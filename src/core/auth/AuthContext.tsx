import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { syncAiOwner } from '../ai/store';
import { getAuthService, type AuthService, type Session } from './index';

interface AuthState {
  service: AuthService | null;
  session: Session | null;
  loading: boolean;
  /** Vuelve a leer la sesión del proveedor y la publica en el contexto antes de resolver. */
  refresh: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthState | null>(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // cierre de sesión por inactividad

export function AuthProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<AuthService | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivity = useRef(Date.now());
  // Cada lectura de sesión lleva un número; solo se aplica la más reciente.
  // Evita que una respuesta lenta y antigua (p. ej. la del evento SIGNED_IN, que aún dice aal1)
  // pise a otra más nueva (p. ej. la que ya trae aal2 tras el 2FA).
  const loadSeq = useRef(0);

  const load = useCallback(async (svc: AuthService): Promise<Session | null> => {
    const seq = ++loadSeq.current;
    const s = await svc.getSession();
    if (seq === loadSeq.current) setSession(s);
    return s;
  }, []);

  const refresh = useCallback(async () => {
    if (!service) return null;
    return load(service);
  }, [service, load]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void getAuthService().then(async (svc) => {
      if (cancelled) return;
      setService(svc);
      if (svc) {
        await load(svc);
        if (cancelled) return;
        unsub = svc.subscribe(() => void load(svc));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [load]);

  // La conexión con la IA (clave en memoria) muere al cerrar sesión o cambiar de usuario.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!loading) syncAiOwner(userId);
  }, [userId, loading]);

  // Cierre automático por inactividad
  useEffect(() => {
    if (!service || !session) return;
    const mark = () => (lastActivity.current = Date.now());
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_TIMEOUT_MS) void service.signOut();
    }, 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      window.clearInterval(timer);
    };
  }, [service, session]);

  const value = useMemo(() => ({ service, session, loading, refresh }), [service, session, loading, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
