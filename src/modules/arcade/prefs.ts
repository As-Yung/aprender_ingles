import { LEVELS } from '../../content';
import type { LevelId } from '../../content/types';
import { readJson, writeJson } from '../../core/security/storage';

/** Per-device arcade preferences (only conveniences: level, sound and voice). */
export interface ArcadePrefs {
  level: LevelId;
  sound: boolean;
  voice: boolean;
}

const KEY = 'aprender-ingles.arcade';

export function readArcadePrefs(): ArcadePrefs {
  const p = readJson<Partial<ArcadePrefs>>('local', KEY, {});
  const game = readJson<{ nivel?: LevelId }>('local', 'aprender-ingles.vocab-game', {});
  const level = [p.level, game.nivel].find((l) => LEVELS.some((x) => x.id === l)) ?? 'a1';
  return { level, sound: p.sound !== false, voice: p.voice !== false };
}

export function writeArcadePrefs(change: Partial<ArcadePrefs>): ArcadePrefs {
  const next = { ...readArcadePrefs(), ...change };
  writeJson('local', KEY, next);
  return next;
}
