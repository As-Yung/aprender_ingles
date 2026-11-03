import type { Level, Question } from '../../content/types';
import { findGap } from '../practice/generators';
import { barajar, limpiarEs, palabrasDelNivel, type PalabraJuego, type Rng } from '../vocab-game/logic';
import { rngConSemilla } from '../vocab-duel/questions';

/**
 * Game Arcade engine. Every game turns the level content (vocabulary, dialogues,
 * readings, quizzes…) into a deterministic sequence of questions from a seed, so
 * PvE runs and PvP duels (both players get the same questions) work the same way.
 */

export type Lang = 'en' | 'es';

export interface Prompt {
  /** Small label above the prompt, e.g. "What does it mean?". */
  ask: string;
  text?: string;
  textLang?: Lang;
  emoji?: string;
  /** Sentence with a blank: before ____ after. */
  gap?: { before: string; after: string };
  /** English text read aloud when the question appears (listening games). */
  listen?: string;
  /** Hide the text until answered (listening games). */
  hidden?: boolean;
  hint?: string;
}

interface Base {
  prompt: Prompt;
  /** Shown after answering: "deploy = desplegar". */
  reveal: string;
  /** English text read aloud after answering. */
  say?: string;
  /** Word reference, for spaced repetition and the review list. */
  word?: PalabraJuego;
}

export type ArcadeQuestion =
  | (Base & { kind: 'choice'; options: string[]; answer: string; optionsLang: Lang })
  | (Base & { kind: 'type'; answer: string; accept: string[]; pattern?: string; fuzzy?: boolean })
  | (Base & { kind: 'tiles'; tiles: string[]; answer: string[]; joiner: '' | ' ' })
  | (Base & { kind: 'hangman'; answer: string })
  | (Base & { kind: 'memory'; pairs: { a: string; b: string }[] });

export interface Ctx {
  level: Level;
  words: PalabraJuego[];
  /** Vocabulary items whose example contains the term (for gap games). */
  gapWords: PalabraJuego[];
  lines: { en: string; es: string; next?: string; topic: string }[];
  phrases: { en: string; es: string }[];
  quizzes: Question[];
  readingQs: (Question & { title: string })[];
  glossary: { en: string; es: string }[];
  dictation: string[];
  categories: string[];
}

export function buildCtx(level: Level): Ctx {
  const words = palabrasDelNivel(level);
  const lines: Ctx['lines'] = [];
  for (const t of level.topics) {
    t.conversation.lines.forEach((l, i, all) => lines.push({ en: l.en, es: l.es, next: all[i + 1]?.en, topic: t.id }));
  }
  const uniq = <T>(arr: T[], key: (x: T) => string) => [...new Map(arr.map((x) => [key(x), x])).values()];
  return {
    level,
    words,
    gapWords: words.filter((w) => findGap(w.item.example, w.item.term)),
    lines,
    phrases: uniq(
      level.topics.flatMap((t) => t.conversation.usefulPhrases),
      (p) => p.en,
    ),
    quizzes: level.topics.flatMap((t) => t.quiz),
    readingQs: level.topics.flatMap((t) => t.reading.questions.map((q) => ({ ...q, title: t.reading.title }))),
    glossary: uniq(
      level.topics.flatMap((t) => Object.entries(t.reading.glossary).map(([en, es]) => ({ en, es }))),
      (g) => g.en.toLowerCase(),
    ),
    dictation: [...new Set(level.topics.flatMap((t) => t.dictation ?? t.vocabulary.map((v) => v.example)))],
    categories: [...new Set(words.map((w) => w.item.category))],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const hashIdx = (seed: number, i: number, salt = 0) => (seed ^ Math.imul(i + 1 + salt * 977, 2654435761)) | 0;

/** Item number i of a list, walking a seeded shuffle (no repeats until the list runs out). */
export function nth<T>(list: readonly T[], seed: number, i: number): T {
  const round = Math.floor(i / list.length);
  return barajar(rngConSemilla(seed + round * 7919), list)[i % list.length]!;
}

/** Up to n distinct distractors (case-insensitive), preferring `near` ones first. */
function distract(rng: Rng, correct: string, near: string[], far: string[], n = 3): string[] {
  const seen = new Set([correct.toLowerCase()]);
  const out: string[] = [];
  for (const v of [...barajar(rng, near), ...barajar(rng, far)]) {
    const k = v.toLowerCase();
    if (!v.trim() || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

function wordDistractors(rng: Rng, ctx: Ctx, w: PalabraJuego, field: (p: PalabraJuego) => string, n = 3): string[] {
  const others = ctx.words.filter((p) => p.item.term !== w.item.term);
  const near = others.filter((p) => p.item.category === w.item.category || p.topicId === w.topicId).map(field);
  return distract(rng, field(w), near, others.map(field), n);
}

const es = (w: PalabraJuego) => limpiarEs(w.item.es);
const reveal = (w: PalabraJuego) => `${w.item.term} = ${w.item.es}`;
const choice = (
  rng: Rng,
  prompt: Prompt,
  answer: string,
  wrong: string[],
  optionsLang: Lang,
  extra: Partial<Base> & { reveal: string },
): ArcadeQuestion => ({ kind: 'choice', prompt, answer, options: barajar(rng, [answer, ...wrong]), optionsLang, ...extra });

/** Words for spelling games: letters only, 3–14 characters. */
const spellable = (ctx: Ctx) => ctx.words.filter((w) => /^[a-z][a-z' -]{2,13}$/i.test(w.item.term));

function scramble(rng: Rng, s: string): string[] {
  const letters = s.split('');
  let out = barajar(rng, letters);
  for (let k = 0; k < 5 && out.join('') === s; k++) out = barajar(rng, letters);
  return out;
}

const fromQuestion = (rng: Rng, q: Question, ask: string, sub?: string): ArcadeQuestion => {
  const answer = q.options[q.answer]!;
  return {
    kind: 'choice',
    prompt: { ask, text: q.prompt, hint: sub },
    answer,
    options: barajar(rng, q.options),
    optionsLang: 'en',
    reveal: q.explanation ? `${answer} — ${q.explanation}` : answer,
  };
};

const splitWords = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tilesFor = (rng: Rng, sentence: string) => {
  const words = splitWords(sentence);
  let tiles = barajar(rng, words);
  for (let k = 0; k < 5 && tiles.join(' ') === words.join(' '); k++) tiles = barajar(rng, words);
  return { tiles, answer: words };
};
const shortSentences = (list: { en: string; es: string }[], min = 4, max = 10) =>
  list.filter((p) => {
    const n = splitWords(p.en).length;
    return n >= min && n <= max;
  });

/* ------------------------------------------------------------------ */
/* Games                                                               */
/* ------------------------------------------------------------------ */

export type Skill = 'Vocabulary' | 'Listening' | 'Spelling' | 'Sentences' | 'Reading' | 'Speed';

export interface GameDef {
  id: string;
  name: string;
  emoji: string;
  skill: Skill;
  blurb: string;
  /** Seconds for timed games (the server enforces it too). */
  timeLimit?: number;
  available?: (ctx: Ctx) => boolean;
  generate: (ctx: Ctx, seed: number, i: number) => ArcadeQuestion;
}

const rngFor = (seed: number, i: number, salt = 0) => rngConSemilla(hashIdx(seed, i, salt));

const meaning = (ctx: Ctx, seed: number, i: number, ask = 'What does it mean?'): ArcadeQuestion => {
  const w = nth(ctx.words, seed, i);
  const rng = rngFor(seed, i);
  return choice(rng, { ask, text: w.item.term, textLang: 'en' }, es(w), wordDistractors(rng, ctx, w, es), 'es', {
    reveal: reveal(w),
    say: w.item.term,
    word: w,
  });
};

const translate = (ctx: Ctx, seed: number, i: number): ArcadeQuestion => {
  const w = nth(ctx.words, seed, i);
  const rng = rngFor(seed, i);
  return choice(rng, { ask: 'Say it in English', text: es(w), textLang: 'es', emoji: w.item.emoji }, w.item.term, wordDistractors(rng, ctx, w, (p) => p.item.term), 'en', {
    reveal: reveal(w),
    say: w.item.term,
    word: w,
  });
};

export const GAMES: GameDef[] = [
  {
    id: 'meaning-match',
    name: 'Meaning Match',
    emoji: '🎯',
    skill: 'Vocabulary',
    blurb: 'See an English word, pick its meaning.',
    generate: (c, s, i) => meaning(c, s, i),
  },
  {
    id: 'translate-it',
    name: 'Say It in English',
    emoji: '🗣️',
    skill: 'Vocabulary',
    blurb: 'See the Spanish word, pick the English one.',
    generate: translate,
  },
  {
    id: 'emoji-guess',
    name: 'Emoji Guess',
    emoji: '🤔',
    skill: 'Vocabulary',
    blurb: 'Which word does the emoji show?',
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      return choice(rng, { ask: 'Which word is this?', emoji: w.item.emoji, hint: w.item.category }, w.item.term, wordDistractors(rng, ctx, w, (p) => p.item.term), 'en', {
        reveal: reveal(w),
        say: w.item.term,
        word: w,
      });
    },
  },
  {
    id: 'listen-pick',
    name: 'Listen & Pick',
    emoji: '👂',
    skill: 'Listening',
    blurb: 'Hear a word and pick how it is written.',
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      return choice(rng, { ask: 'Listen and pick the word', listen: w.item.term, hidden: true }, w.item.term, wordDistractors(rng, ctx, w, (p) => p.item.term), 'en', {
        reveal: reveal(w),
        word: w,
      });
    },
  },
  {
    id: 'listen-translate',
    name: 'Listen & Translate',
    emoji: '🎧',
    skill: 'Listening',
    blurb: 'Hear a word and pick what it means.',
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      return choice(rng, { ask: 'Listen: what does it mean?', listen: w.item.term, hidden: true }, es(w), wordDistractors(rng, ctx, w, es), 'es', {
        reveal: reveal(w),
        word: w,
      });
    },
  },
  {
    id: 'gap-fill',
    name: 'Fill the Gap',
    emoji: '✏️',
    skill: 'Sentences',
    blurb: 'Complete real tech-team sentences.',
    available: (c) => c.gapWords.length >= 8,
    generate: (ctx, seed, i) => {
      const w = nth(ctx.gapWords, seed, i);
      const rng = rngFor(seed, i);
      const g = findGap(w.item.example, w.item.term)!;
      return choice(
        rng,
        { ask: 'Complete the sentence', gap: { before: g.before, after: g.after }, hint: w.item.exampleEs },
        g.match,
        wordDistractors(rng, ctx, w, (p) => p.item.term),
        'en',
        { reveal: reveal(w), say: w.item.example, word: w },
      );
    },
  },
  {
    id: 'true-false',
    name: 'True or False',
    emoji: '⚖️',
    skill: 'Speed',
    blurb: 'Is the translation right? Decide fast.',
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      const truthy = rng() < 0.5;
      const shown = truthy ? es(w) : wordDistractors(rng, ctx, w, es, 1)[0] ?? es(w);
      const ok = shown === es(w);
      return {
        kind: 'choice',
        prompt: { ask: 'True or false?', text: `${w.item.term} = ${shown}`, textLang: 'en' },
        options: ['True', 'False'],
        answer: ok ? 'True' : 'False',
        optionsLang: 'en',
        reveal: reveal(w),
        say: w.item.term,
        word: w,
      };
    },
  },
  {
    id: 'speed-sprint',
    name: 'Speed Sprint',
    emoji: '⚡',
    skill: 'Speed',
    blurb: '60 seconds. As many right answers as you can.',
    timeLimit: 60,
    generate: (ctx, seed, i) => (i % 2 ? translate(ctx, seed, i) : meaning(ctx, seed, i, 'Quick! What does it mean?')),
  },
  {
    id: 'spelling-bee',
    name: 'Spelling Bee',
    emoji: '🐝',
    skill: 'Spelling',
    blurb: 'Hear the word and type it correctly.',
    generate: (ctx, seed, i) => {
      const w = nth(spellable(ctx), seed, i);
      return {
        kind: 'type',
        prompt: { ask: 'Listen and type the word', listen: w.item.term, hidden: true, hint: `${es(w)} ${w.item.emoji}` },
        answer: w.item.term,
        accept: [w.item.term],
        reveal: reveal(w),
        word: w,
      };
    },
  },
  {
    id: 'word-scramble',
    name: 'Word Scramble',
    emoji: '🔀',
    skill: 'Spelling',
    blurb: 'Put the letters back in order.',
    generate: (ctx, seed, i) => {
      const w = nth(
        spellable(ctx).filter((p) => !p.item.term.includes(' ')),
        seed,
        i,
      );
      const term = w.item.term.toLowerCase();
      return {
        kind: 'tiles',
        prompt: { ask: 'Unscramble the word', text: es(w), textLang: 'es', emoji: w.item.emoji },
        tiles: scramble(rngFor(seed, i), term),
        answer: term.split(''),
        joiner: '',
        reveal: reveal(w),
        say: w.item.term,
        word: w,
      };
    },
  },
  {
    id: 'missing-letters',
    name: 'Missing Letters',
    emoji: '🧩',
    skill: 'Spelling',
    blurb: 'Some letters are gone. Type the full word.',
    generate: (ctx, seed, i) => {
      const w = nth(spellable(ctx), seed, i);
      const rng = rngFor(seed, i);
      const term = w.item.term;
      const pattern = term
        .split('')
        .map((ch, k) => (/[a-z]/i.test(ch) && k > 0 && rng() < 0.45 ? '_' : ch))
        .join('');
      const finalPattern = pattern.includes('_') ? pattern : term[0] + '_' + term.slice(2);
      return {
        kind: 'type',
        prompt: { ask: 'Complete the word', text: finalPattern.split('').join(' '), textLang: 'en', hint: `${es(w)} ${w.item.emoji}` },
        answer: term,
        accept: [term],
        pattern: finalPattern,
        reveal: reveal(w),
        say: term,
        word: w,
      };
    },
  },
  {
    id: 'sentence-builder',
    name: 'Sentence Builder',
    emoji: '🧱',
    skill: 'Sentences',
    blurb: 'Tap the words in the right order.',
    generate: (ctx, seed, i) => {
      const pool = shortSentences(ctx.words.map((w) => ({ en: w.item.example, es: w.item.exampleEs })));
      const p = nth(pool, seed, i);
      return { kind: 'tiles', prompt: { ask: 'Build the sentence', text: p.es, textLang: 'es' }, ...tilesFor(rngFor(seed, i), p.en), joiner: ' ', reveal: p.en, say: p.en };
    },
  },
  {
    id: 'dialogue-builder',
    name: 'Dialogue Builder',
    emoji: '💬',
    skill: 'Sentences',
    blurb: 'Rebuild real lines from team conversations.',
    generate: (ctx, seed, i) => {
      const p = nth(shortSentences(ctx.lines, 4, 11), seed, i);
      return { kind: 'tiles', prompt: { ask: 'Rebuild the line', text: p.es, textLang: 'es' }, ...tilesFor(rngFor(seed, i), p.en), joiner: ' ', reveal: p.en, say: p.en };
    },
  },
  {
    id: 'category-quiz',
    name: 'Category Check',
    emoji: '🗂️',
    skill: 'Vocabulary',
    blurb: 'Which group does the word belong to?',
    available: (c) => c.categories.length >= 4,
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      return choice(rng, { ask: 'Which group is it in?', text: w.item.term, textLang: 'en', hint: es(w) }, w.item.category, distract(rng, w.item.category, [], ctx.categories), 'es', {
        reveal: `${w.item.term} → ${w.item.category}`,
        say: w.item.term,
        word: w,
      });
    },
  },
  {
    id: 'odd-one-out',
    name: 'Odd One Out',
    emoji: '🦄',
    skill: 'Vocabulary',
    blurb: 'Three words go together. Find the one that doesn’t.',
    available: (c) => c.categories.some((cat) => c.words.filter((w) => w.item.category === cat).length >= 3),
    generate: (ctx, seed, i) => {
      const rng = rngFor(seed, i);
      const groups = ctx.categories.filter((cat) => ctx.words.filter((w) => w.item.category === cat).length >= 3);
      const cat = nth(groups, seed, i);
      const three = barajar(rng, ctx.words.filter((w) => w.item.category === cat)).slice(0, 3);
      const odd = nth(
        ctx.words.filter((w) => w.item.category !== cat),
        seed + 17,
        i,
      );
      return {
        kind: 'choice',
        prompt: { ask: 'Find the odd one out' },
        options: barajar(rng, [...three.map((w) => w.item.term), odd.item.term]),
        answer: odd.item.term,
        optionsLang: 'en',
        reveal: `${odd.item.term} (${odd.item.category}) — the others are “${cat}”.`,
        say: odd.item.term,
        word: odd,
      };
    },
  },
  {
    id: 'first-letter',
    name: 'First Letter',
    emoji: '🔤',
    skill: 'Spelling',
    blurb: 'You get the meaning and the first letter. Type the word.',
    generate: (ctx, seed, i) => {
      const w = nth(spellable(ctx), seed, i);
      const t = w.item.term;
      return {
        kind: 'type',
        prompt: { ask: 'Type the English word', text: `${t[0]!.toUpperCase()}${' _'.repeat(t.length - 1)}`, textLang: 'en', hint: `${es(w)} ${w.item.emoji}` },
        answer: t,
        accept: [t],
        reveal: reveal(w),
        say: t,
        word: w,
      };
    },
  },
  {
    id: 'hangman',
    name: 'Hangman',
    emoji: '🪢',
    skill: 'Spelling',
    blurb: 'Guess the letters before you run out of tries.',
    generate: (ctx, seed, i) => {
      const w = nth(spellable(ctx), seed, i);
      return { kind: 'hangman', prompt: { ask: 'Guess the word', hint: `${es(w)} ${w.item.emoji}` }, answer: w.item.term, reveal: reveal(w), say: w.item.term, word: w };
    },
  },
  {
    id: 'memory-pairs',
    name: 'Memory Pairs',
    emoji: '🃏',
    skill: 'Vocabulary',
    blurb: 'Flip the cards and match each word with its meaning.',
    generate: (ctx, seed, i) => {
      const four = [0, 1, 2, 3].map((k) => nth(ctx.words, seed, i * 4 + k));
      const unique = [...new Map(four.map((w) => [es(w).toLowerCase(), w])).values()];
      return {
        kind: 'memory',
        prompt: { ask: 'Match the pairs' },
        pairs: unique.map((w) => ({ a: w.item.term, b: es(w) })),
        reveal: unique.map(reveal).join(' · '),
      };
    },
  },
  {
    id: 'sentence-translate',
    name: 'Sentence Translator',
    emoji: '🌍',
    skill: 'Sentences',
    blurb: 'Read the Spanish sentence and pick the English one.',
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      const wrong = distract(
        rng,
        w.item.example,
        ctx.words.filter((p) => p.topicId === w.topicId).map((p) => p.item.example),
        ctx.words.map((p) => p.item.example),
      );
      return choice(rng, { ask: 'Pick the English sentence', text: w.item.exampleEs, textLang: 'es' }, w.item.example, wrong, 'en', {
        reveal: w.item.example,
        say: w.item.example,
        word: w,
      });
    },
  },
  {
    id: 'phrase-finder',
    name: 'Phrase Finder',
    emoji: '🔎',
    skill: 'Vocabulary',
    blurb: 'Learn the useful phrases teams really say.',
    available: (c) => c.phrases.length >= 8,
    generate: (ctx, seed, i) => {
      const p = nth(ctx.phrases, seed, i);
      const rng = rngFor(seed, i);
      return choice(rng, { ask: 'What does this phrase mean?', text: p.en, textLang: 'en' }, p.es, distract(rng, p.es, [], ctx.phrases.map((x) => x.es)), 'es', {
        reveal: `${p.en} = ${p.es}`,
        say: p.en,
      });
    },
  },
  {
    id: 'next-line',
    name: 'What Comes Next?',
    emoji: '⏭️',
    skill: 'Reading',
    blurb: 'Pick the line that continues the conversation.',
    generate: (ctx, seed, i) => {
      const pool = ctx.lines.filter((l) => l.next);
      const l = nth(pool, seed, i);
      const rng = rngFor(seed, i);
      const wrong = distract(
        rng,
        l.next!,
        pool.filter((x) => x.topic !== l.topic).map((x) => x.en),
        pool.map((x) => x.en),
      );
      return choice(rng, { ask: 'What comes next?', text: `“${l.en}”`, textLang: 'en', hint: l.es }, l.next!, wrong, 'en', { reveal: l.next!, say: l.next! });
    },
  },
  {
    id: 'reading-quiz',
    name: 'Reading Challenge',
    emoji: '📖',
    skill: 'Reading',
    blurb: 'Questions about the level’s reading texts.',
    available: (c) => c.readingQs.length >= 5,
    generate: (ctx, seed, i) => {
      const q = nth(ctx.readingQs, seed, i);
      return fromQuestion(rngFor(seed, i), q, `Reading: ${q.title}`);
    },
  },
  {
    id: 'topic-quiz',
    name: 'Grammar Trivia',
    emoji: '🧠',
    skill: 'Reading',
    blurb: 'Grammar and usage questions from every topic.',
    available: (c) => c.quizzes.length >= 5,
    generate: (ctx, seed, i) => fromQuestion(rngFor(seed, i), nth(ctx.quizzes, seed, i), 'Choose the right answer'),
  },
  {
    id: 'glossary-hunt',
    name: 'Glossary Hunt',
    emoji: '🗺️',
    skill: 'Reading',
    blurb: 'Words and expressions from the readings.',
    available: (c) => c.glossary.length >= 8,
    generate: (ctx, seed, i) => {
      const g = nth(ctx.glossary, seed, i);
      const rng = rngFor(seed, i);
      return choice(rng, { ask: 'What does it mean?', text: g.en, textLang: 'en' }, g.es, distract(rng, g.es, [], ctx.glossary.map((x) => x.es)), 'es', {
        reveal: `${g.en} = ${g.es}`,
        say: g.en,
      });
    },
  },
  {
    id: 'sound-match',
    name: 'Sound Match',
    emoji: '🔊',
    skill: 'Listening',
    blurb: 'Read the pronunciation (or hear it) and find the word.',
    generate: (ctx, seed, i) => {
      const withIpa = ctx.words.filter((w) => w.item.ipa);
      const pool = withIpa.length >= 8 ? withIpa : ctx.words;
      const w = nth(pool, seed, i);
      const rng = rngFor(seed, i);
      const prompt: Prompt = w.item.ipa
        ? { ask: 'Which word sounds like this?', text: w.item.ipa, textLang: 'en', listen: undefined }
        : { ask: 'Which word do you hear?', listen: w.item.term, hidden: true };
      return choice(rng, prompt, w.item.term, wordDistractors(rng, ctx, w, (p) => p.item.term), 'en', { reveal: reveal(w), say: w.item.term, word: w });
    },
  },
  {
    id: 'type-translation',
    name: 'Type It!',
    emoji: '⌨️',
    skill: 'Spelling',
    blurb: 'Translate into English by typing, no options.',
    generate: (ctx, seed, i) => {
      const w = nth(spellable(ctx), seed, i);
      return {
        kind: 'type',
        prompt: { ask: 'Type it in English', text: es(w), textLang: 'es', emoji: w.item.emoji },
        answer: w.item.term,
        accept: [w.item.term],
        reveal: reveal(w),
        say: w.item.term,
        word: w,
      };
    },
  },
  {
    id: 'dictation-dash',
    name: 'Dictation Dash',
    emoji: '📝',
    skill: 'Listening',
    blurb: 'Listen to a sentence and type it.',
    generate: (ctx, seed, i) => {
      const s = nth(ctx.dictation, seed, i);
      return { kind: 'type', prompt: { ask: 'Listen and type the sentence', listen: s, hidden: true }, answer: s, accept: [s], fuzzy: true, reveal: s };
    },
  },
  {
    id: 'category-rush',
    name: 'Category Rush',
    emoji: '🏃',
    skill: 'Speed',
    blurb: '60 seconds: yes or no, does the word belong to the group?',
    timeLimit: 60,
    available: (c) => c.categories.length >= 3,
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      const yes = rng() < 0.5;
      const cat = yes ? w.item.category : (distract(rng, w.item.category, [], ctx.categories, 1)[0] ?? w.item.category);
      const ok = cat === w.item.category;
      return {
        kind: 'choice',
        prompt: { ask: `Is it in “${cat}”?`, text: w.item.term, textLang: 'en', emoji: w.item.emoji },
        options: ['Yes', 'No'],
        answer: ok ? 'Yes' : 'No',
        optionsLang: 'en',
        reveal: `${w.item.term} → ${w.item.category}`,
        word: w,
      };
    },
  },
  {
    id: 'sentence-meaning',
    name: 'Sentence Meaning',
    emoji: '💡',
    skill: 'Reading',
    blurb: 'Read an English sentence and pick its meaning.',
    generate: (ctx, seed, i) => {
      const w = nth(ctx.words, seed, i);
      const rng = rngFor(seed, i);
      const wrong = distract(
        rng,
        w.item.exampleEs,
        ctx.words.filter((p) => p.topicId === w.topicId).map((p) => p.item.exampleEs),
        ctx.words.map((p) => p.item.exampleEs),
      );
      return choice(rng, { ask: 'What does it mean?', text: w.item.example, textLang: 'en' }, w.item.exampleEs, wrong, 'es', {
        reveal: `${w.item.example} = ${w.item.exampleEs}`,
        say: w.item.example,
        word: w,
      });
    },
  },
  {
    id: 'phrase-builder',
    name: 'Phrase Builder',
    emoji: '🏗️',
    skill: 'Sentences',
    blurb: 'Build useful phrases word by word.',
    available: (c) => shortSentences(c.phrases, 3, 10).length >= 5,
    generate: (ctx, seed, i) => {
      const p = nth(shortSentences(ctx.phrases, 3, 10), seed, i);
      return { kind: 'tiles', prompt: { ask: 'Build the phrase', text: p.es, textLang: 'es' }, ...tilesFor(rngFor(seed, i), p.en), joiner: ' ', reveal: p.en, say: p.en };
    },
  },
];

export const BOSS_GAME = { id: 'boss', name: 'Boss Battle', emoji: '🐉', skill: 'Vocabulary' as Skill, blurb: 'Defeat 10 bosses with your vocabulary.' };

export const findGame = (id: string | undefined) => GAMES.find((g) => g.id === id);
export const gameName = (id: string) => (id === 'boss' ? BOSS_GAME.name : (findGame(id)?.name ?? id));
export const gameEmoji = (id: string) => (id === 'boss' ? BOSS_GAME.emoji : (findGame(id)?.emoji ?? '🎮'));

/* ------------------------------------------------------------------ */
/* Answer checking                                                     */
/* ------------------------------------------------------------------ */

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Similarity 0..1 by Levenshtein distance on normalized text. */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x && !y) return 1;
  const d: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[y.length]! / Math.max(x.length, y.length);
}

export function checkTyped(q: Extract<ArcadeQuestion, { kind: 'type' }>, typed: string): boolean {
  if (q.fuzzy) return similarity(typed, q.answer) >= 0.85;
  return q.accept.some((a) => normalize(a) === normalize(typed));
}

/* ------------------------------------------------------------------ */
/* Run rules (same values as the arcade_games table on the server)     */
/* ------------------------------------------------------------------ */

export interface Rules {
  maxQuestions: number;
  lives: number;
  timeLimit: number;
}

const DEFAULT_RULES: Rules = { maxQuestions: 20, lives: 3, timeLimit: 900 };
const SPECIAL_RULES: Record<string, Partial<Rules>> = {
  'true-false': { maxQuestions: 25 },
  'speed-sprint': { maxQuestions: 200, timeLimit: 60, lives: 9999 },
  'category-rush': { maxQuestions: 200, timeLimit: 60, lives: 9999 },
  'spelling-bee': { maxQuestions: 15 },
  'word-scramble': { maxQuestions: 15 },
  'missing-letters': { maxQuestions: 15 },
  'sentence-builder': { maxQuestions: 12 },
  'dialogue-builder': { maxQuestions: 12 },
  'first-letter': { maxQuestions: 15 },
  hangman: { maxQuestions: 12 },
  'memory-pairs': { maxQuestions: 10 },
  'sentence-translate': { maxQuestions: 15 },
  'next-line': { maxQuestions: 15 },
  'reading-quiz': { maxQuestions: 15 },
  'topic-quiz': { maxQuestions: 15 },
  'type-translation': { maxQuestions: 15 },
  'dictation-dash': { maxQuestions: 10 },
  'sentence-meaning': { maxQuestions: 15 },
  'phrase-builder': { maxQuestions: 12 },
};

export const rulesFor = (id: string): Rules => ({ ...DEFAULT_RULES, ...SPECIAL_RULES[id] });

/** Same formula as run_answer() on the server (used offline and for instant feedback). */
export const pointsFor = (streakAfter: number, seconds: number) => 100 + 10 * Math.min(streakAfter - 1, 10) + Math.max(0, 50 - Math.floor(seconds * 5));
