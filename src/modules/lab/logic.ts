import type { Topic, VocabItem } from '../../content/types';
import type { FixTask, FlowTask } from '../../content/labs/types';
import { findGap, shuffle, type Rng } from '../practice/generators';

export { correctedSentence, tokens, wrongIndex } from '../../content/labs/fix';

export const fixOptions = (task: FixTask, rng: Rng = Math.random) => shuffle([task.right, ...task.alts], rng);
export const fixLabel = (opt: string) => (opt ? opt : '✂️ remove it');

/** Shuffled flow steps that are never already in order. */
export function shuffleFlow(f: FlowTask, rng: Rng = Math.random): number[] {
  const idx = f.steps.map((_, i) => i);
  let s = shuffle(idx, rng);
  if (s.every((v, i) => v === i)) s = [...s.slice(1), s[0]!];
  return s;
}

/* 🃏 Memory flip ---------------------------------------------------- */
export interface MemoryCard {
  id: string;
  pair: string;
  face: string;
  kind: 'emoji' | 'term';
}
export function buildMemory(topic: Topic, pairs = 6, rng: Rng = Math.random): { items: VocabItem[]; cards: MemoryCard[] } {
  const seen = new Set<string>();
  const items = shuffle(topic.vocabulary, rng).filter((v) => {
    if (seen.has(v.emoji)) return false;
    seen.add(v.emoji);
    return true;
  }).slice(0, pairs);
  const cards = shuffle(
    items.flatMap((v) => [
      { id: `e:${v.term}`, pair: v.term, face: v.emoji, kind: 'emoji' as const },
      { id: `t:${v.term}`, pair: v.term, face: v.term, kind: 'term' as const },
    ]),
    rng,
  );
  return { items, cards };
}

/* 🐝 Spelling bee --------------------------------------------------- */
export interface SpellTask {
  item: VocabItem;
  letters: string[];
  /** Shuffled indexes of `letters`. */
  shuffled: number[];
}
export const isSpellable = (term: string) => /^[A-Za-z]{3,12}$/.test(term);
export function buildSpell(topic: Topic, count = 5, rng: Rng = Math.random): SpellTask[] {
  return shuffle(topic.vocabulary.filter((v) => isSpellable(v.term)), rng)
    .slice(0, count)
    .map((item) => {
      const letters = item.term.toLowerCase().split('');
      let shuffled = shuffle(letters.map((_, i) => i), rng);
      if (shuffled.map((k) => letters[k]).join('') === letters.join('')) shuffled = [...shuffled.slice(1), shuffled[0]!];
      return { item, letters, shuffled };
    });
}

/* ⚡ Speed run ------------------------------------------------------- */
export interface SpeedTask {
  item: VocabItem;
  /** Sentence with the term blanked, or null if the example doesn't contain it. */
  before: string | null;
  after: string;
  options: [string, string];
  answer: string;
}
export function buildSpeed(topic: Topic, count = 12, rng: Rng = Math.random): SpeedTask[] {
  const vocab = topic.vocabulary;
  const out: SpeedTask[] = [];
  const pool = shuffle(vocab, rng);
  for (let i = 0; out.length < count && i < pool.length * 3; i++) {
    const item = pool[i % pool.length]!;
    const others = vocab.filter((v) => v.term !== item.term);
    if (!others.length) break;
    const other = others[Math.floor(rng() * others.length)]!;
    const gap = findGap(item.example, item.term);
    const answer = gap ? gap.match : item.term;
    const wrong = other.term;
    if (wrong.toLowerCase() === answer.toLowerCase()) continue;
    out.push({
      item,
      before: gap ? gap.before : null,
      after: gap ? gap.after : '',
      options: rng() < 0.5 ? [answer, wrong] : [wrong, answer],
      answer,
    });
  }
  return out;
}

/** Memory: a perfect game needs one try per pair; each extra try lowers the score. */
export const memoryScore = (pairs: number, tries: number) => pct(pairs, Math.max(pairs, tries));

export const pct = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0);
