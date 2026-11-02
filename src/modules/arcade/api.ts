import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useMemo, useRef } from 'react';
import type { LevelId } from '../../content/types';
import { useAuth } from '../../core/auth/AuthContext';
import type { SupabaseAuthService } from '../../core/auth/supabaseAuthService';

/**
 * Server side of the arcade (supabase/migrations/20261104000000_arcade_leaderboards.sql):
 * PvE runs scored by the server and the PvE / PvP leaderboards.
 */

export interface Run {
  id: string;
  game: string;
  level: LevelId;
  seed: number;
  score: number;
  answered: number;
  correct: number;
  streak: number;
  best_streak: number;
  lives: number;
  status: 'active' | 'finished';
}

export interface PveRow {
  rank: number;
  username: string;
  score: number;
  correct: number;
  answered: number;
  best_streak: number;
  played_at: string;
  is_me: boolean;
}

export interface PvpRow {
  rank: number;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  is_me: boolean;
}

export const ERRORS: Record<string, string> = {
  not_authenticated: 'Your session expired. Please sign in again.',
  invalid_game: 'Unknown game.',
  invalid_level: 'Unknown level.',
  rate_limited: 'Too many games in a short time. Take a short break!',
  not_found: 'That game no longer exists.',
  not_active: 'That game is already over.',
  out_of_order: 'The game got out of sync.',
  too_fast: 'Slow down a little 🙂',
};

export class ArcadeError extends Error {
  constructor(readonly code: string) {
    super(ERRORS[code] ?? 'Could not reach the server. Try again.');
  }
}

async function rpc<T>(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new ArcadeError(Object.keys(ERRORS).find((k) => error.message?.includes(k)) ?? 'unknown');
  return data as T;
}

export const runStart = (c: SupabaseClient, game: string, level: LevelId) => rpc<Run>(c, 'run_start', { p_game: game, p_level: level });
export const runAnswer = (c: SupabaseClient, run: string, q: number, correct: boolean) =>
  rpc<Run>(c, 'run_answer', { p_run: run, p_q: q, p_correct: correct });
export const runFinish = (c: SupabaseClient, run: string) => rpc<Run>(c, 'run_finish', { p_run: run });
export const leaderboardPve = (c: SupabaseClient, game: string, level: LevelId) =>
  rpc<PveRow[]>(c, 'leaderboard_pve', { p_game: game, p_level: level, p_limit: 20 });
export const leaderboardPvp = (c: SupabaseClient, game: string) => rpc<PvpRow[]>(c, 'leaderboard_pvp', { p_game: game, p_limit: 20 });

/** Supabase client when the app runs with the online backend (null in local dev mode). */
export function useOnlineClient(): SupabaseClient | null {
  const { service } = useAuth();
  return service?.mode === 'supabase' ? (service as SupabaseAuthService).client : null;
}

/**
 * Keeps a scored run on the server. All calls are best‑effort: if the server is not
 * available the game keeps working, it just doesn't reach the leaderboard.
 */
export function useServerRun() {
  const client = useOnlineClient();
  const run = useRef<Run | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const start = useCallback(
    async (game: string, level: LevelId): Promise<Run | null> => {
      run.current = null;
      if (!client) return null;
      try {
        run.current = await runStart(client, game, level);
      } catch {
        run.current = null;
      }
      return run.current;
    },
    [client],
  );

  /** Sends answers in order (q = index of the question in this run). */
  const answer = useCallback(
    (q: number, correct: boolean): Promise<Run | null> => {
      const p = queue.current.then(async () => {
        const r = run.current;
        if (!client || !r || r.status !== 'active') return r;
        try {
          run.current = await runAnswer(client, r.id, q, correct);
        } catch (e) {
          if (e instanceof ArcadeError && e.code === 'too_fast') {
            await new Promise((res) => setTimeout(res, 700));
            try {
              run.current = await runAnswer(client, r.id, q, correct);
            } catch {
              /* keep playing offline */
            }
          }
        }
        return run.current;
      });
      queue.current = p.catch(() => undefined);
      return p;
    },
    [client],
  );

  const finish = useCallback(async (): Promise<Run | null> => {
    await queue.current;
    const r = run.current;
    if (!client || !r) return r;
    try {
      run.current = await runFinish(client, r.id);
    } catch {
      /* ignore */
    }
    return run.current;
  }, [client]);

  return useMemo(() => ({ start, answer, finish, online: !!client, current: () => run.current }), [start, answer, finish, client]);
}
