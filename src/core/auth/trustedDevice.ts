/**
 * "Recordar este dispositivo": guarda en ESTE navegador el token que el servidor entrega tras
 * verificar el 2FA, para que los alumnos solo tengan que escribir el código cada 7 días.
 *
 * - El token es aleatorio (256 bits) y el servidor solo guarda su hash. Sin la contraseña no sirve.
 * - La caducidad la fija el servidor y no se alarga con el uso.
 * - El administrador nunca usa esta función (lo impiden el cliente, la Edge Function y la RLS).
 */
import { readJson, removeKey, writeJson } from '../security/storage';

export const TRUSTED_DEVICE_DAYS = 7;
const DEVICE_KEY = (userId: string) => `ai.trust.${userId}`;
const SESSION_MARK_KEY = 'ai.trusted.session';

export interface DeviceToken {
  token: string;
  expiresAt: string;
}

export function getDeviceToken(userId: string): DeviceToken | null {
  const t = readJson<DeviceToken | null>('local', DEVICE_KEY(userId), null);
  if (!t || typeof t.token !== 'string' || !(Date.parse(t.expiresAt) > Date.now())) {
    if (t) removeKey('local', DEVICE_KEY(userId));
    return null;
  }
  return t;
}

export function saveDeviceToken(userId: string, token: DeviceToken): void {
  writeJson('local', DEVICE_KEY(userId), token);
}

export function clearDeviceToken(userId: string): void {
  removeKey('local', DEVICE_KEY(userId));
}

/** Marca (solo de interfaz) de que la sesión actual se abrió con un dispositivo de confianza. */
interface TrustedSessionMark {
  sessionId: string;
  expiresAt: string;
}

export function markTrustedSession(sessionId: string, expiresAt: string): void {
  writeJson('session', SESSION_MARK_KEY, { sessionId, expiresAt } satisfies TrustedSessionMark);
}

export function isMarkedTrustedSession(sessionId: string): boolean {
  const m = readJson<TrustedSessionMark | null>('session', SESSION_MARK_KEY, null);
  return Boolean(m && sessionId && m.sessionId === sessionId && Date.parse(m.expiresAt) > Date.now());
}

export function clearTrustedSessionMark(): void {
  removeKey('session', SESSION_MARK_KEY);
}

/** Lee un claim del JWT de acceso (sin verificarlo: solo para la interfaz; el servidor verifica). */
export function jwtClaim(accessToken: string, claim: string): string {
  try {
    const part = accessToken.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const value = (JSON.parse(atob(b64)) as Record<string, unknown>)[claim];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}
