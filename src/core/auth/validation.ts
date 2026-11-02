/**
 * Reglas de validación compartidas por el cliente y (duplicadas) por la Edge Function.
 * El cliente valida por UX; el servidor valida por seguridad.
 */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(u)) {
    return 'El usuario debe tener 3–32 caracteres: letras minúsculas, números, punto, guion o guion bajo.';
  }
  return null;
}

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export function checkPassword(pw: string, username?: string): PasswordCheck {
  const problems: string[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH) problems.push(`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
  if (pw.length > PASSWORD_MAX_LENGTH) problems.push(`Máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
  if (!/[a-z]/.test(pw)) problems.push('Al menos una letra minúscula.');
  if (!/[A-Z]/.test(pw)) problems.push('Al menos una letra mayúscula.');
  if (!/[0-9]/.test(pw)) problems.push('Al menos un número.');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('Al menos un símbolo (por ejemplo - _ ! @ #).');
  if (username && pw.toLowerCase().includes(normalizeUsername(username))) {
    problems.push('No debe contener el nombre de usuario.');
  }
  return { ok: problems.length === 0, problems };
}

export function isValidTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/** Genera una contraseña temporal aleatoria que cumple la política. */
/** Entero aleatorio uniforme en [0, n) sin sesgo de módulo (muestreo por rechazo). */
export function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % n;
}

export function generateTemporaryPassword(length = 16): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '-_!@#%*+=?';
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[randomInt(set.length)]!;
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  // Mezcla Fisher–Yates con aleatoriedad criptográfica
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
