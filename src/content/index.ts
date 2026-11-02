import type { Level, LevelId, LevelMeta, Topic } from './types';

/** Metadatos ligeros (siempre cargados). El contenido de cada nivel se carga bajo demanda. */
export const LEVELS: LevelMeta[] = [
  { id: 'a1', name: 'A1', label: 'Beginner', description: 'Basic phrases: introduce yourself to your tech team and talk about your day.', color: '#10b981' },
  { id: 'a2', name: 'A2', label: 'Elementary', description: 'Tell past stories, explain what broke in a system, shop and order food.', color: '#22c55e' },
  { id: 'b1', name: 'B1', label: 'Intermediate', description: 'Project and travel plans, team stand-ups, experiences and simple opinions.', color: '#3b82f6' },
  { id: 'b2', name: 'B2', label: 'Upper-intermediate', description: 'Hypotheses, explaining IoT architectures, and tech & news articles.', color: '#6366f1' },
  { id: 'c1', name: 'C1', label: 'Advanced', description: 'Argue with nuance in design reviews, use emphasis and formal register.', color: '#a855f7' },
  { id: 'c2', name: 'C2', label: 'Mastery', description: 'Real engineering-team slang, idioms, fine nuance and academic writing.', color: '#ec4899' },
];

const loaders: Record<LevelId, () => Promise<{ default: Level }>> = {
  a1: () => import('./levels/a1'),
  a2: () => import('./levels/a2'),
  b1: () => import('./levels/b1'),
  b2: () => import('./levels/b2'),
  c1: () => import('./levels/c1'),
  c2: () => import('./levels/c2'),
};

const cache = new Map<LevelId, Promise<Level>>();

export function isLevelId(id: string | undefined): id is LevelId {
  return !!id && id in loaders;
}

export function loadLevel(id: LevelId): Promise<Level> {
  let p = cache.get(id);
  if (!p) {
    p = loaders[id]().then((m) => m.default);
    cache.set(id, p);
  }
  return p;
}

export async function loadTopic(levelId: LevelId, topicId: string): Promise<{ level: Level; topic: Topic } | null> {
  const level = await loadLevel(levelId);
  const topic = level.topics.find((t) => t.id === topicId);
  return topic ? { level, topic } : null;
}

export async function loadAllLevels(): Promise<Level[]> {
  return Promise.all(LEVELS.map((l) => loadLevel(l.id)));
}
