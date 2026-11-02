import { Secret, TOTP } from 'otpauth';

export const TOTP_ISSUER = 'Aprender Ingles';

export function createTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

/**
 * Valida un código TOTP con una ventana de ±1 periodo.
 * Devuelve el contador usado (para impedir reutilizar el mismo código) o null.
 */
export function validateTotp(secretBase32: string, code: string, lastUsedCounter?: number): number | null {
  const totp = buildTotp(secretBase32, 'x');
  const delta = totp.validate({ token: code.trim(), window: 1 });
  if (delta === null) return null;
  const counter = totp.counter() + delta;
  if (lastUsedCounter !== undefined && counter <= lastUsedCounter) return null; // replay
  return counter;
}
