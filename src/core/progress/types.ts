import type { SrsCard } from '../srs/leitner';
import { sanitizeMisses, type MissMap } from './misses';

export interface SectionProgress {
  completed: boolean;
  /** 0..100 */
  score?: number;
  updatedAt: number;
}

export interface ProgressData {
  version: 1;
  /** clave: `${levelId}/${topicId}` → sección → progreso */
  topics: Record<string, Record<string, SectionProgress>>;
  /** clave: `${levelId}/${topicId}/${term}` */
  srs: Record<string, SrsCard>;
  streak: { lastDay: string; count: number };
  /** clave: `${levelId}/${topicId}/${term}` → palabras falladas para repasar. */
  misses: MissMap;
}

export const emptyProgress = (): ProgressData => ({
  version: 1,
  topics: {},
  srs: {},
  streak: { lastDay: '', count: 0 },
  misses: {},
});

export interface ProgressRepository {
  load(userId: string): Promise<ProgressData>;
  save(userId: string, data: ProgressData): Promise<void>;
}

/** Valida/sanea datos externos antes de usarlos (defensa ante datos manipulados). */
export function sanitizeProgress(raw: unknown): ProgressData {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProgressData>;
  if (r.topics && typeof r.topics === 'object') base.topics = r.topics;
  if (r.srs && typeof r.srs === 'object') base.srs = r.srs;
  if (r.streak && typeof r.streak.count === 'number' && typeof r.streak.lastDay === 'string') base.streak = r.streak;
  base.misses = sanitizeMisses(r.misses);
  return base;
}
