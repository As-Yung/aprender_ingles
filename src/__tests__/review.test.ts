import { describe, expect, it } from 'vitest';
import { loadLevel } from '../content';
import { MASTER_AFTER, applyAnswer, parseWordKey, pendingKeys, sanitizeMisses } from '../core/progress/misses';
import { sanitizeProgress } from '../core/progress/types';
import { buildQuestion, kindFor, pickRound, resolveWords, spellLetters } from '../modules/review/logic';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

describe('registro de palabras falladas', () => {
  it('un fallo crea el registro y los aciertos lo aplastan', () => {
    let m = applyAnswer({}, 'a1/t/hello', true, 1);
    expect(m).toEqual({}); // acertar sin haber fallado no crea nada
    m = applyAnswer(m, 'a1/t/hello', false, 2);
    m = applyAnswer(m, 'a1/t/hello', false, 3);
    expect(m['a1/t/hello']).toEqual({ count: 2, ok: 0, last: 3 });
    for (let i = 0; i < MASTER_AFTER; i++) m = applyAnswer(m, 'a1/t/hello', true, 10 + i);
    expect(m['a1/t/hello']!.ok).toBe(MASTER_AFTER);
    expect(pendingKeys(m)).toEqual([]);
    m = applyAnswer(m, 'a1/t/hello', false, 20);
    expect(m['a1/t/hello']).toMatchObject({ count: 3, ok: 0 });
  });
  it('ordena por más fallos y luego por antigüedad', () => {
    const m = { x: { count: 1, ok: 0, last: 5 }, y: { count: 3, ok: 1, last: 9 }, z: { count: 1, ok: 0, last: 1 } };
    expect(pendingKeys(m)).toEqual(['y', 'z', 'x']);
  });
  it('sanea datos manipulados', () => {
    const m = sanitizeMisses({ ok: { count: 2, ok: 9, last: 1 }, bad: { count: 'x' }, neg: { count: -1, ok: 0, last: 0 }, n: null });
    expect(Object.keys(m)).toEqual(['ok']);
    expect(m.ok!.ok).toBe(MASTER_AFTER);
    expect(sanitizeProgress({}).misses).toEqual({});
  });
  it('separa la clave aunque el término tenga "/"', () => {
    expect(parseWordKey('b1/io-t/TCP/IP')).toEqual({ levelId: 'b1', topicId: 'io-t', term: 'TCP/IP' });
    expect(parseWordKey('nada')).toBeNull();
  });
});

describe('caza de bugs', () => {
  it('resuelve palabras reales y genera preguntas válidas de cada tipo', async () => {
    const level = await loadLevel('a1');
    const topic = level.topics[0]!;
    let misses = {};
    for (const v of topic.vocabulary.slice(0, 5)) misses = applyAnswer(misses, `a1/${topic.id}/${v.term}`, false);
    misses = applyAnswer(misses, 'a1/no-existe/foo', false);
    const words = resolveWords(misses, [level]);
    expect(words).toHaveLength(5);
    const round = pickRound(misses, words, 3);
    expect(round).toHaveLength(3);
    for (const w of words) {
      for (const kind of ['significado', 'escucha', 'completa', 'deletrea'] as const) {
        const q = buildQuestion(w, [], Math.random, kind);
        if (q.kind === 'deletrea') {
          expect(q.letters!.join('')).toBe(spellLetters(w.item.term).join(''));
          expect([...q.tiles!].sort((a, b) => a - b)).toEqual(q.letters!.map((_, i) => i));
        } else {
          const ids = q.options.map((o) => o.id);
          expect(ids).toContain(q.answer);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
  it('la dificultad sube con los aciertos', async () => {
    const level = await loadLevel('a1');
    const topic = level.topics[0]!;
    const item = topic.vocabulary.find((v) => v.term.length < 10)!;
    const key = `a1/${topic.id}/${item.term}`;
    const [w] = resolveWords({ [key]: { count: 1, ok: 0, last: 0 } }, [level]);
    expect(['significado', 'escucha']).toContain(kindFor(w!, seq([0.1])));
    expect(kindFor({ ...w!, record: { count: 1, ok: 2, last: 0 } }, seq([0.1]))).toBe('deletrea');
  });
});
