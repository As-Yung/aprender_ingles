import type { LevelId } from '../types';
import type { LevelLabs, TopicLab } from './types';

const loaders: Record<LevelId, () => Promise<{ default: LevelLabs }>> = {
  a1: () => import('./a1'),
  a2: () => import('./a2'),
  b1: () => import('./b1'),
  b2: () => import('./b2'),
  c1: () => import('./c1'),
  c2: () => import('./c2'),
};

export async function loadLevelLabs(level: LevelId): Promise<LevelLabs> {
  return (await loaders[level]()).default;
}

export async function loadLab(level: LevelId, topicId: string): Promise<TopicLab | null> {
  return (await loadLevelLabs(level))[topicId] ?? null;
}

export async function loadAllLabs(): Promise<Record<LevelId, LevelLabs>> {
  const ids = Object.keys(loaders) as LevelId[];
  const all = await Promise.all(ids.map(loadLevelLabs));
  return Object.fromEntries(ids.map((id, i) => [id, all[i]!])) as Record<LevelId, LevelLabs>;
}
