import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAuthService, type AuthService, type Session } from './index';

interface AuthState {
  service: AuthService | null;
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // cierre de sesión por inactividad

export function AuthProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<AuthService | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivity = useRef(Date.now());

  const refresh = useCallback(async () => {
    if (!service) return;
    setSession(await service.getSession());
  }, [service]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void getAuthService().then(async (svc) => {
      if (cancelled) return;
      setService(svc);
      if (svc) {
        setSession(await svc.getSession());
        unsub = svc.subscribe((s) => setSession(s));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

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
