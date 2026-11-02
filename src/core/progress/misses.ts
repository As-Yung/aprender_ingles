/**
 * Registro de palabras falladas ("bugs" de vocabulario). Cada fallo en cualquier práctica
 * (práctica visual, vocabulario con repetición espaciada o Vocab Boss Game) se guarda aquí.
 * Una palabra queda "aplastada" (dominada) al acertarla MASTER_AFTER veces seguidas.
 */
export interface MissRecord {
  /** Veces que se ha fallado en total. */
  count: number;
  /** Aciertos seguidos desde el último fallo. */
  ok: number;
  /** Último fallo o acierto (ms). */
  last: number;
}

export const MASTER_AFTER = 3;

export type MissMap = Record<string, MissRecord>;

/** Aplica una respuesta. Solo crea registro si se falla; los aciertos solo cuentan si ya había fallos. */
export function applyAnswer(map: MissMap, key: string, correct: boolean, now = Date.now()): MissMap {
  const prev = map[key];
  if (correct) {
    if (!prev || prev.ok >= MASTER_AFTER) return map;
    return { ...map, [key]: { ...prev, ok: prev.ok + 1, last: now } };
  }
  return { ...map, [key]: { count: (prev?.count ?? 0) + 1, ok: 0, last: now } };
}

export const isMastered = (r: MissRecord) => r.ok >= MASTER_AFTER;

/** Palabras pendientes: primero las más falladas y, a igualdad, las que llevan más tiempo sin verse. */
export function pendingKeys(map: MissMap): string[] {
  return Object.entries(map)
    .filter(([, r]) => !isMastered(r))
    .sort(([, a], [, b]) => b.count - a.count || a.last - b.last)
    .map(([k]) => k);
}

/** Valida datos externos (pueden venir manipulados). */
export function sanitizeMisses(raw: unknown): MissMap {
  const out: MissMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== 'string' || k.length > 300 || !v || typeof v !== 'object') continue;
    const r = v as Partial<MissRecord>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);
    const count = num(r.count);
    const ok = num(r.ok);
    const last = num(r.last);
    if (count === null || ok === null || last === null) continue;
    out[k] = { count: Math.floor(count), ok: Math.min(MASTER_AFTER, Math.floor(ok)), last };
  }
  return out;
}

/** Clave `${levelId}/${topicId}/${term}` → partes (el término puede contener "/"). */
export function parseWordKey(key: string): { levelId: string; topicId: string; term: string } | null {
  const a = key.indexOf('/');
  const b = a < 0 ? -1 : key.indexOf('/', a + 1);
  if (a <= 0 || b <= a + 1 || b === key.length - 1) return null;
  return { levelId: key.slice(0, a), topicId: key.slice(a + 1, b), term: key.slice(b + 1) };
}
