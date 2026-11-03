import type { ChatTask, FixTask, FlowTask } from './types';

/** chat(from, avatar, message, [goodReply, why], [badReply, why], [badReply, why]) — the first reply is the good one. */
export const chat = (
  from: string,
  avatar: string,
  message: string,
  good: [string, string],
  ...bad: [string, string][]
): ChatTask => ({
  from,
  avatar,
  message,
  replies: [{ text: good[0], why: good[1], ok: true }, ...bad.map(([text, why]) => ({ text, why, ok: false }))],
});

/** fix(sentence, wrongWord, rightWord, [otherWrongFixes], why) */
export const fix = (sentence: string, wrong: string, right: string, alts: string[], why: string): FixTask => ({
  sentence,
  wrong,
  right,
  alts,
  why,
});

/** flow(title, '🔌 Step one', '📡 Step two', …) — each step starts with its emoji. */
export const flow = (title: string, ...steps: string[]): FlowTask => ({
  title,
  steps: steps.map((s) => {
    const i = s.indexOf(' ');
    return { emoji: s.slice(0, i), text: s.slice(i + 1) };
  }),
});
