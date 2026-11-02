/** Repetición espaciada (sistema Leitner de 5 cajas). */
export interface SrsCard {
  box: number; // 1..5
  due: number; // timestamp ms
  reviews: number;
}

const DAY = 24 * 60 * 60 * 1000;
export const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, 16] as const; // índice = caja

export function newCard(now = Date.now()): SrsCard {
  return { box: 1, due: now, reviews: 0 };
}

export function review(card: SrsCard | undefined, correct: boolean, now = Date.now()): SrsCard {
  const c = card ?? newCard(now);
  const box = correct ? Math.min(5, c.box + 1) : 1;
  return { box, due: now + (BOX_INTERVAL_DAYS[box] ?? 0) * DAY, reviews: c.reviews + 1 };
}

export function isDue(card: SrsCard | undefined, now = Date.now()): boolean {
  return !card || card.due <= now;
}

/** Ordena: primero las vencidas y de caja más baja. */
export function sortForReview<T>(items: T[], getCard: (item: T) => SrsCard | undefined, now = Date.now()): T[] {
  return [...items].sort((a, b) => {
    const ca = getCard(a);
    const cb = getCard(b);
    const da = isDue(ca, now) ? 0 : 1;
    const db = isDue(cb, now) ? 0 : 1;
    if (da !== db) return da - db;
    return (ca?.box ?? 0) - (cb?.box ?? 0);
  });
}
