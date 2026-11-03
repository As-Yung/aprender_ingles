import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../security/storage';
import { PROVIDERS, type ProviderId } from './providers';

/**
 * The AI connection lives ONLY in this module's memory:
 * - never in localStorage / sessionStorage / cookies / Supabase;
 * - it disappears on sign-out, on idle sign-out, when another user signs in,
 *   on page reload and when the tab is closed.
 * So every time the learner signs in, they connect their AI again (by design).
 *
 * Only the non-secret preference "which AI I like" is remembered (localStorage).
 */
export type AiMode = 'key' | 'chat';

export interface AiConnection {
  provider: ProviderId;
  mode: AiMode;
  /** Only in 'key' mode. Kept in memory, never persisted. */
  apiKey: string;
  model: string;
  /** The app user who connected it: a different user never inherits it. */
  ownerId: string;
  connectedAt: number;
}

let current: AiConnection | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getAiConnection(): AiConnection | null {
  return current;
}

export function connectAi(c: Omit<AiConnection, 'connectedAt'>): void {
  current = Object.freeze({ ...c, apiKey: c.mode === 'key' ? c.apiKey.trim() : '', connectedAt: Date.now() });
  setPreferredProvider(c.provider);
  emit();
}

export function disconnectAi(): void {
  if (!current) return;
  current = null;
  emit();
}

/** Called by the auth layer: drops the connection if the signed-in user changed or left. */
export function syncAiOwner(userId: string | null): void {
  if (current && current.ownerId !== userId) disconnectAi();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAiConnection(): AiConnection | null {
  return useSyncExternalStore(subscribe, getAiConnection, () => null);
}

const PREF_KEY = 'ai.tutorProvider';

export function getPreferredProvider(): ProviderId {
  const v = readJson<unknown>('local', PREF_KEY, 'claude');
  return typeof v === 'string' && v in PROVIDERS ? (v as ProviderId) : 'claude';
}

export function setPreferredProvider(p: ProviderId): void {
  writeJson('local', PREF_KEY, p);
}

/* ---------- Ask-AI panel open/close state (shared by the floating button and pages) ---------- */
let panelOpen = false;
let panelDraft = '';
const panelListeners = new Set<() => void>();

export function openAskAi(draft = ''): void {
  panelOpen = true;
  panelDraft = draft;
  panelListeners.forEach((l) => l());
}
export function closeAskAi(): void {
  panelOpen = false;
  panelListeners.forEach((l) => l());
}
export function takeAskAiDraft(): string {
  const d = panelDraft;
  panelDraft = '';
  return d;
}
export function useAskAiOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      panelListeners.add(l);
      return () => panelListeners.delete(l);
    },
    () => panelOpen,
    () => false,
  );
}
