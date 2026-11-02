/** Acceso seguro a localStorage/sessionStorage (puede fallar en modo privado). */
export function readJson<T>(storage: 'local' | 'session', key: string, fallback: T): T {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage;
    const raw = s.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(storage: 'local' | 'session', key: string, value: unknown): void {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage;
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function removeKey(storage: 'local' | 'session', key: string): void {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage;
    s.removeItem(key);
  } catch {
    /* ignorar */
  }
}
