/** Utilidades criptográficas basadas en WebCrypto (sin dependencias externas). */
const encoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array {
  const b = new Uint8Array(length);
  crypto.getRandomValues(b);
  return b;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomId(): string {
  return crypto.randomUUID();
}

/** PBKDF2-SHA256 (recomendación OWASP 2023+: ≥ 600 000 iteraciones). */
export async function hashPassword(
  password: string,
  salt: Uint8Array = randomBytes(16),
  iterations = 600_000,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt), iterations };
}

/** Comparación en tiempo constante para evitar ataques de temporización. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  const { hash } = await hashPassword(password, fromBase64(stored.salt), stored.iterations);
  return constantTimeEqual(hash, stored.hash);
}
