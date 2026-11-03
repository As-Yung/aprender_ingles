import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAllLevels } from '../content';
import { buildCtx, checkTyped, GAMES, similarity } from '../modules/arcade/engine';

describe('Game Arcade', async () => {
  const levels = await loadAllLevels();

  it('has 30 games, all registered on the server', () => {
    expect(GAMES).toHaveLength(30);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(30);
    const sql = readFileSync('supabase/migrations/20261104000000_arcade_leaderboards.sql', 'utf8');
    for (const g of GAMES) expect(sql, g.id).toContain(`('${g.id}',`);
    expect(sql).toContain("('boss',");
  });

  for (const level of levels) {
    it(`${level.id}: every game produces valid, repeatable questions`, () => {
      const ctx = buildCtx(level);
      for (const game of GAMES) {
        if (game.available && !game.available(ctx)) continue;
        for (let i = 0; i < 40; i++) {
          const q = game.generate(ctx, 987654, i);
          expect(game.generate(ctx, 987654, i), `${game.id} #${i} determinista`).toEqual(q);
          const where = `${level.id} ${game.id} #${i}`;
          switch (q.kind) {
            case 'choice':
              expect(q.options.length, where).toBeGreaterThanOrEqual(2);
              expect(q.options.filter((o) => o === q.answer), where).toHaveLength(1);
              expect(new Set(q.options.map((o) => o.toLowerCase())).size, where).toBe(q.options.length);
              break;
            case 'type':
              expect(checkTyped(q, q.answer), where).toBe(true);
              expect(checkTyped(q, 'zzzz'), where).toBe(false);
              break;
            case 'tiles':
              expect([...q.tiles].sort(), where).toEqual([...q.answer].sort());
              break;
            case 'hangman':
              expect(q.answer.length, where).toBeGreaterThanOrEqual(3);
              break;
            case 'memory':
              expect(q.pairs.length, where).toBeGreaterThanOrEqual(3);
              break;
          }
        }
      }
      const disponibles = GAMES.filter((g) => !g.available || g.available(ctx)).length;
      expect(disponibles, 'games available').toBeGreaterThanOrEqual(28);
    });
  }

  it('fuzzy dictation tolerates small typos', () => {
    expect(similarity('The server is down again', 'the server is down agian')).toBeGreaterThan(0.85);
    expect(similarity('hello', 'goodbye')).toBeLessThan(0.5);
  });
});

describe('Arcade rules match the server', () => {
  it('max questions, lives and time limits are the same as in SQL', async () => {
    const { rulesFor } = await import('../modules/arcade/engine');
    const sql = readFileSync('supabase/migrations/20261104000000_arcade_leaderboards.sql', 'utf8');
    for (const g of GAMES) {
      const m = new RegExp(`\\('${g.id}', (\\d+), (\\d+), (\\d+)\\)`).exec(sql);
      expect(m, g.id).not.toBeNull();
      const r = rulesFor(g.id);
      expect([r.maxQuestions, r.timeLimit, r.lives], g.id).toEqual([Number(m![1]), Number(m![2]), Number(m![3])]);
    }
  });
});
