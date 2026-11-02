import { describe, expect, it } from 'vitest';
import { loadAllLevels } from '../content';
import { buildGaps, buildListen, buildMatch, buildOrder, buildSort, findGap } from '../modules/practice/generators';

describe('práctica visual: generadores', async () => {
  const levels = await loadAllLevels();
  const topics = levels.flatMap((l) => l.topics.map((t) => ({ key: `${l.id}/${t.id}`, t })));

  it('findGap encuentra formas conjugadas', () => {
    expect(findGap('The server crashed last night.', 'crash')?.match).toBe('crashed');
    expect(findGap('Our data is in the cloud.', 'the cloud')?.match).toBe('the cloud');
    expect(findGap('Hello', 'bye')).toBeNull();
  });

  for (const { key, t } of topics) {
    it(`${key}: genera ejercicios válidos`, () => {
      const m = buildMatch(t);
      expect(m.items.length).toBeGreaterThanOrEqual(4);
      expect([...m.terms].sort()).toEqual(m.items.map((v) => v.term).sort());

      const order = buildOrder(t);
      expect(order.length, 'frases para ordenar').toBeGreaterThan(0);
      order.forEach((o) => {
        expect(o.words.join(' ')).toBe(o.sentence.trim().split(/\s+/).join(' '));
        expect([...o.shuffled].sort((a, b) => a - b)).toEqual(o.words.map((_, i) => i));
      });

      const gaps = buildGaps(t);
      expect(gaps.length, 'frases para completar').toBeGreaterThanOrEqual(3);
      gaps.forEach((g) => {
        const correct = g.item.example.slice(g.before.length, g.item.example.length - g.after.length);
        expect(g.options).toContain(correct);
      });

      buildListen(t).forEach((l) => expect(l.options.map((o) => o.term)).toContain(l.item.term));
      const s = buildSort(t);
      if (s) s.items.forEach((v) => expect(s.categories).toContain(v.category));
    });
  }
});
