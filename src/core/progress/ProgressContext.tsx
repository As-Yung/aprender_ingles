import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { SupabaseAuthService } from '../auth/supabaseAuthService';
import { review as srsReview, type SrsCard } from '../srs/leitner';
import { applyAnswer } from './misses';
import { LocalProgressRepository, SupabaseProgressRepository } from './repositories';
import { emptyProgress, type ProgressData, type ProgressRepository } from './types';

interface ProgressState {
  data: ProgressData;
  markSection: (topicKey: string, section: string, score?: number) => void;
  reviewWord: (wordKey: string, correct: boolean) => void;
  getCard: (wordKey: string) => SrsCard | undefined;
  /** Registra un acierto/fallo solo en la lista de palabras falladas (sin tocar la repetición espaciada). */
  recordAnswer: (wordKey: string, correct: boolean) => void;
}

const ProgressContext = createContext<ProgressState | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function bumpStreak(data: ProgressData): ProgressData['streak'] {
  const t = today();
  if (data.streak.lastDay === t) return data.streak;
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return { lastDay: t, count: data.streak.lastDay === y ? data.streak.count + 1 : 1 };
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { service, session } = useAuth();
  const [data, setData] = useState<ProgressData>(emptyProgress);
  const repoRef = useRef<ProgressRepository | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const userId = session?.aal === 'aal2' ? session.user.id : null;

  useEffect(() => {
    if (!service || !userId) {
      setData(emptyProgress());
      return;
    }
    const repo: ProgressRepository =
      service.mode === 'supabase'
        ? new SupabaseProgressRepository((service as SupabaseAuthService).client)
        : new LocalProgressRepository();
    repoRef.current = repo;
    let cancelled = false;
    void repo.load(userId).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [service, userId]);

  const persist = useCallback(
    (next: ProgressData) => {
      if (!userId || !repoRef.current) return;
      window.clearTimeout(saveTimer.current);
      const repo = repoRef.current;
      saveTimer.current = window.setTimeout(() => void repo.save(userId, next).catch(() => undefined), 800);
    },
    [userId],
  );

  const update = useCallback(
    (fn: (d: ProgressData) => ProgressData) => {
      setData((prev) => {
        const next = fn(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const markSection = useCallback(
    (topicKey: string, section: string, score?: number) =>
      update((d) => {
        const prevSection = d.topics[topicKey]?.[section];
        const best = Math.max(prevSection?.score ?? 0, score ?? 0);
        return {
          ...d,
          streak: bumpStreak(d),
          topics: {
            ...d.topics,
            [topicKey]: {
              ...d.topics[topicKey],
              [section]: { completed: true, score: score === undefined ? prevSection?.score : best, updatedAt: Date.now() },
            },
          },
        };
      }),
    [update],
  );

  const reviewWord = useCallback(
    (wordKey: string, correct: boolean) =>
      update((d) => ({
        ...d,
        streak: bumpStreak(d),
        srs: { ...d.srs, [wordKey]: srsReview(d.srs[wordKey], correct) },
        misses: applyAnswer(d.misses, wordKey, correct),
      })),
    [update],
  );

  const recordAnswer = useCallback(
    (wordKey: string, correct: boolean) =>
      update((d) => {
        const misses = applyAnswer(d.misses, wordKey, correct);
        return misses === d.misses ? d : { ...d, misses };
      }),
    [update],
  );

  const getCard = useCallback((wordKey: string) => data.srs[wordKey], [data]);

  const value = useMemo(
    () => ({ data, markSection, reviewWord, getCard, recordAnswer }),
    [data, markSection, reviewWord, getCard, recordAnswer],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressState {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress debe usarse dentro de <ProgressProvider>');
  return ctx;
}
