import type { Question, VocabItem } from './types';

/** Atajo para declarar vocabulario de forma compacta. */
export const v = (
  term: string,
  es: string,
  emoji: string,
  category: string,
  example: string,
  exampleEs: string,
  ipa?: string,
): VocabItem => ({ term, es, emoji, category, example, exampleEs, ipa });

/** Atajo para preguntas: la respuesta correcta se indica por índice. */
export const q = (prompt: string, options: string[], answer: number, explanation?: string): Question => ({
  prompt,
  options,
  answer,
  explanation,
});
