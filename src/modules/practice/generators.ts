import type { Topic, VocabItem } from '../../content/types';

/**
 * Generadores de ejercicios prácticos a partir del contenido de cualquier tema.
 * Así todos los temas (actuales y futuros) tienen práctica visual sin escribirla a mano.
 */

export type Rng = () => number;

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickDistractors(all: VocabItem[], correct: VocabItem, n: number, rng: Rng): VocabItem[] {
  const others = all.filter((v) => v.term !== correct.term && v.es !== correct.es);
  // Primero de la misma categoría (más difícil y más didáctico), luego del resto.
  const same = shuffle(others.filter((v) => v.category === correct.category), rng);
  const rest = shuffle(others.filter((v) => v.category !== correct.category), rng);
  return [...same, ...rest].slice(0, n);
}

/* 1. Emparejar ------------------------------------------------------- */
export interface MatchRound {
  items: VocabItem[];
  /** Orden barajado de la columna derecha (términos en inglés). */
  terms: string[];
}
export function buildMatch(topic: Topic, size = 6, rng: Rng = Math.random): MatchRound {
  const items = shuffle(topic.vocabulary, rng).slice(0, size);
  return { items, terms: shuffle(items.map((v) => v.term), rng) };
}

/* 2. Ordenar la frase ------------------------------------------------ */
export interface OrderTask {
  sentence: string;
  es: string;
  words: string[];
  /** Fichas barajadas (índices de `words`). */
  shuffled: number[];
}
export const splitWords = (s: string) => s.trim().split(/\s+/).filter(Boolean);

export function buildOrder(topic: Topic, count = 4, rng: Rng = Math.random): OrderTask[] {
  const pool = [
    ...topic.conversation.lines.map((l) => ({ en: l.en, es: l.es })),
    ...topic.vocabulary.map((v) => ({ en: v.example, es: v.exampleEs })),
  ].filter((p) => {
    const n = splitWords(p.en).length;
    return n >= 4 && n <= 11;
  });
  const unique = [...new Map(pool.map((p) => [p.en, p])).values()];
  return shuffle(unique, rng)
    .slice(0, count)
    .map((p) => {
      const words = splitWords(p.en);
      let shuffled = shuffle(words.map((_, i) => i), rng);
      // Evita que salga ya ordenada.
      if (shuffled.every((v, i) => v === i)) shuffled = [...shuffled.slice(1), shuffled[0]!];
      return { sentence: p.en, es: p.es, words, shuffled };
    });
}

/* 3. Completar el hueco ---------------------------------------------- */
export interface GapTask {
  item: VocabItem;
  before: string;
  after: string;
  options: string[];
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Busca el término dentro del ejemplo (insensible a mayúsculas y a ’/'). */
export function findGap(example: string, term: string): { before: string; after: string; match: string } | null {
  const norm = (s: string) => s.replace(/’/g, "'");
  const re = new RegExp(`\\b${escapeRe(norm(term))}`, 'i');
  const m = re.exec(norm(example));
  if (!m) return null;
  // Extiende al final de la palabra (fix → fixed, crash → crashed).
  let end = m.index + m[0].length;
  while (end < example.length && /[A-Za-z-]/.test(example[end]!)) end++;
  return { before: example.slice(0, m.index), after: example.slice(end), match: example.slice(m.index, end) };
}

export function buildGaps(topic: Topic, count = 6, rng: Rng = Math.random): GapTask[] {
  const tasks: GapTask[] = [];
  for (const item of shuffle(topic.vocabulary, rng)) {
    const gap = findGap(item.example, item.term);
    if (!gap) continue;
    // Si la forma en la frase difiere (fixed vs fix), la opción correcta es la forma de la frase.
    const correct = gap.match;
    const distract = pickDistractors(topic.vocabulary, item, 3, rng).map((d) => d.term);
    const options = shuffle([...new Set([correct, ...distract])], rng);
    if (options.length < 2) continue;
    tasks.push({ item, before: gap.before, after: gap.after, options });
    if (tasks.length >= count) break;
  }
  return tasks;
}

/* 4. Escucha y elige ------------------------------------------------- */
export interface ListenTask {
  item: VocabItem;
  options: VocabItem[];
}
export function buildListen(topic: Topic, count = 6, rng: Rng = Math.random): ListenTask[] {
  return shuffle(topic.vocabulary, rng)
    .slice(0, count)
    .map((item) => ({ item, options: shuffle([item, ...pickDistractors(topic.vocabulary, item, 3, rng)], rng) }));
}

/* 5. Clasificar por categorías --------------------------------------- */
export interface SortTask {
  categories: string[];
  items: VocabItem[];
}
export function buildSort(topic: Topic, rng: Rng = Math.random): SortTask | null {
  const byCat = new Map<string, VocabItem[]>();
  topic.vocabulary.forEach((v) => byCat.set(v.category, [...(byCat.get(v.category) ?? []), v]));
  const cats = shuffle([...byCat.keys()].filter((c) => byCat.get(c)!.length >= 2), rng).slice(0, 3);
  if (cats.length < 2) return null;
  const items = shuffle(
    cats.flatMap((c) => shuffle(byCat.get(c)!, rng).slice(0, 3)),
    rng,
  );
  return { categories: cats, items };
}
