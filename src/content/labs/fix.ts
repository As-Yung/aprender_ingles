import type { FixTask } from './types';

/** Splits a sentence into tokens (words with their punctuation kept for display). */
export const tokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const bare = (t: string) => t.replace(/^[^\p{L}\p{N}’']+|[^\p{L}\p{N}’']+$/gu, '');

/** Index of the wrong token in a FixTask sentence (or -1). */
export function wrongIndex(task: FixTask): number {
  return tokens(task.sentence).findIndex((t) => bare(t) === task.wrong);
}

/** The corrected sentence (an empty `right` removes the wrong word). */
export function correctedSentence(task: FixTask): string {
  const toks = tokens(task.sentence);
  const i = wrongIndex(task);
  if (i < 0) return task.sentence;
  const tok = toks[i]!;
  const start = tok.indexOf(task.wrong);
  const rebuilt = tok.slice(0, start) + task.right + tok.slice(start + task.wrong.length);
  const out = toks.slice(0, i);
  if (bare(rebuilt)) out.push(rebuilt);
  else if (out.length) out[out.length - 1] += rebuilt; // keep trailing punctuation of a removed word
  out.push(...toks.slice(i + 1));
  const s = out.join(' ').replace(/\s+([,.!?;:])/g, '$1');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
