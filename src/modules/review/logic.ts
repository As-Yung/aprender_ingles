import type { Level, VocabItem } from '../../content/types';
import { MASTER_AFTER, parseWordKey, pendingKeys, type MissMap, type MissRecord } from '../../core/progress/misses';
import { findGap, shuffle, type Rng } from '../practice/generators';

/**
 * Lógica (sin React) del módulo "Caza de bugs": repaso de las palabras falladas.
 * La dificultad sube con cada acierto: primero reconocer, luego escuchar/completar y,
 * al final, escribir la palabra letra a letra. Al acertar MASTER_AFTER veces seguidas, se aplasta.
 */

export interface ReviewWord {
  key: string;
  item: VocabItem;
  levelId: string;
  levelName: string;
  topicTitle: string;
  /** Vocabulario del mismo tema (para los distractores). */
  topicVocab: VocabItem[];
  record: MissRecord;
}

/** Une las claves falladas con su contenido. Ignora claves de contenido que ya no existe. */
export function resolveWords(misses: MissMap, levels: Level[], keys: string[] = Object.keys(misses)): ReviewWord[] {
  const out: ReviewWord[] = [];
  for (const key of keys) {
    const p = parseWordKey(key);
    const record = misses[key];
    if (!p || !record) continue;
    const level = levels.find((l) => l.id === p.levelId);
    const topic = level?.topics.find((t) => t.id === p.topicId);
    const item = topic?.vocabulary.find((v) => v.term === p.term);
    if (!level || !topic || !item) continue;
    out.push({ key, item, levelId: level.id, levelName: level.name, topicTitle: topic.title, topicVocab: topic.vocabulary, record });
  }
  return out;
}

/** Niveles que hay que cargar para mostrar las palabras falladas. */
export function levelsNeeded(misses: MissMap): string[] {
  return [...new Set(Object.keys(misses).map((k) => parseWordKey(k)?.levelId).filter((x): x is string => !!x))];
}

/** Elige las palabras de una ronda: las más falladas primero, con un poco de mezcla. */
export function pickRound(misses: MissMap, words: ReviewWord[], size = 8, rng: Rng = Math.random): ReviewWord[] {
  const order = pendingKeys(misses);
  const byKey = new Map(words.map((w) => [w.key, w]));
  const top = order.map((k) => byKey.get(k)).filter((w): w is ReviewWord => !!w).slice(0, size);
  return shuffle(top, rng);
}

export type ReviewKind = 'significado' | 'escucha' | 'completa' | 'deletrea';

export const KIND_INFO: Record<ReviewKind, { emoji: string; label: string; help: string }> = {
  significado: { emoji: '🔎', label: 'What does it mean?', help: 'Read (and listen to) the word, then tap its meaning.' },
  escucha: { emoji: '👂', label: 'Listen & pick', help: 'Listen to the word and tap the right card.' },
  completa: { emoji: '✏️', label: 'Fill the gap', help: 'Pick the missing word.' },
  deletrea: { emoji: '🔤', label: 'Spell it', help: 'Tap the letters in order to spell the English word.' },
};

export interface ChoiceOption {
  id: string;
  text: string;
  emoji?: string;
}

export interface ReviewQuestion {
  kind: ReviewKind;
  word: ReviewWord;
  /** Opciones (no se usan en "deletrea"). */
  options: ChoiceOption[];
  answer: string;
  /** "completa": frase partida alrededor del hueco. */
  before?: string;
  after?: string;
  /** "deletrea": letras que hay que escribir (sin espacios) y fichas barajadas (índices). */
  letters?: string[];
  tiles?: number[];
}

/** Quita aclaraciones entre paréntesis ("visto (see)" → "visto") para no delatar la respuesta. */
export const cleanEs = (es: string) => es.replace(/\s*\([^)]*\)/g, '').trim() || es;

const MAX_SPELL = 16;

function distractors(word: ReviewWord, extra: VocabItem[], n: number, rng: Rng): VocabItem[] {
  const seen = new Set([word.item.term.toLowerCase(), cleanEs(word.item.es).toLowerCase()]);
  const same = shuffle(word.topicVocab.filter((v) => v.category === word.item.category), rng);
  const rest = shuffle([...word.topicVocab.filter((v) => v.category !== word.item.category), ...extra], rng);
  const out: VocabItem[] = [];
  for (const v of [...same, ...rest]) {
    const a = v.term.toLowerCase();
    const b = cleanEs(v.es).toLowerCase();
    if (seen.has(a) || seen.has(b)) continue;
    seen.add(a);
    seen.add(b);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

/** Tipo de pregunta según cuántas veces seguidas la has acertado (sube la dificultad). */
export function kindFor(word: ReviewWord, rng: Rng = Math.random): ReviewKind {
  const canSpell = word.item.term.replace(/\s/g, '').length <= MAX_SPELL;
  const canGap = !!findGap(word.item.example, word.item.term);
  const stage = Math.min(word.record.ok, MASTER_AFTER - 1);
  const pool: ReviewKind[] =
    stage === 0 ? ['significado', 'escucha'] : stage === 1 ? (canGap ? ['escucha', 'completa'] : ['escucha', 'significado']) : canSpell ? ['deletrea'] : canGap ? ['completa'] : ['escucha'];
  return pool[Math.floor(rng() * pool.length)]!;
}

/** Letras sin espacios, con ’ normalizado a '. */
export const spellLetters = (term: string) => [...term.replace(/’/g, "'").replace(/\s+/g, '')];

export function buildQuestion(word: ReviewWord, extra: VocabItem[] = [], rng: Rng = Math.random, kind = kindFor(word, rng)): ReviewQuestion {
  const { item } = word;
  if (kind === 'deletrea') {
    const letters = spellLetters(item.term);
    let tiles = shuffle(letters.map((_, i) => i), rng);
    if (letters.length > 1 && tiles.every((v, i) => v === i)) tiles = [...tiles.slice(1), tiles[0]!];
    return { kind, word, options: [], answer: item.term, letters, tiles };
  }
  if (kind === 'completa') {
    const gap = findGap(item.example, item.term);
    if (gap) {
      const opts = [gap.match, ...distractors(word, extra, 3, rng).map((d) => d.term)];
      return {
        kind,
        word,
        answer: gap.match,
        before: gap.before,
        after: gap.after,
        options: shuffle(opts, rng).map((t) => ({ id: t, text: t })),
      };
    }
    kind = 'significado';
  }
  const others = distractors(word, extra, 3, rng);
  if (kind === 'escucha') {
    return {
      kind,
      word,
      answer: item.term,
      options: shuffle([item, ...others], rng).map((v) => ({ id: v.term, text: cleanEs(v.es), emoji: v.emoji })),
    };
  }
  return {
    kind: 'significado',
    word,
    answer: cleanEs(item.es),
    options: shuffle([item, ...others], rng).map((v) => ({ id: cleanEs(v.es), text: cleanEs(v.es), emoji: v.emoji })),
  };
}

/** ¿La letra tocada es la siguiente? (sin distinguir mayúsculas). */
export const sameLetter = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
