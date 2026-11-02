import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../security/storage';

/**
 * Spanish help ("ayuda en español"): the platform is English-first for immersion.
 * - auto: Spanish translations are visible in A1–A2 and hidden (tap to reveal) from B1 up.
 * - always: always visible.
 * - never: always hidden (tap to reveal).
 */
export type SpanishHelp = 'auto' | 'always' | 'never';

const KEY = 'ai.spanishHelp';
export const DEFAULT_SPANISH_HELP: SpanishHelp = 'auto';
const listeners = new Set<() => void>();

export function getSpanishHelp(): SpanishHelp {
  const v = readJson<unknown>('local', KEY, DEFAULT_SPANISH_HELP);
  return v === 'auto' || v === 'always' || v === 'never' ? v : DEFAULT_SPANISH_HELP;
}

export function setSpanishHelp(v: SpanishHelp): void {
  writeJson('local', KEY, v);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSpanishHelp(): SpanishHelp {
  return useSyncExternalStore(subscribe, getSpanishHelp, () => DEFAULT_SPANISH_HELP);
}

/** Should Spanish be shown by default for this level? */
export function showSpanishFor(mode: SpanishHelp, levelId?: string): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return levelId === 'a1' || levelId === 'a2';
}

export const SPANISH_HELP_LABEL: Record<SpanishHelp, string> = {
  auto: 'Auto (A1–A2 only)',
  always: 'Always',
  never: 'Never (tap to reveal)',
};
