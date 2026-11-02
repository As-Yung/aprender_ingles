import { describe, expect, it } from 'vitest';
import { LEVELS, loadAllLevels } from '../content';
import type { Question } from '../content/types';

const checkQuestions = (qs: Question[], where: string) => {
  qs.forEach((q, i) => {
    expect(q.options.length, `${where} #${i} opciones`).toBeGreaterThanOrEqual(2);
    expect(q.answer, `${where} #${i} índice de respuesta`).toBeGreaterThanOrEqual(0);
    expect(q.answer, `${where} #${i} índice de respuesta`).toBeLessThan(q.options.length);
    expect(new Set(q.options).size, `${where} #${i} opciones duplicadas`).toBe(q.options.length);
  });
};

describe('contenido A1–C2', async () => {
  const levels = await loadAllLevels();

  it('incluye los seis niveles del MCER en orden', () => {
    expect(levels.map((l) => l.id)).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
    expect(LEVELS.map((l) => l.id)).toEqual(levels.map((l) => l.id));
  });

  for (const level of levels) {
    describe(level.name, () => {
      it('tiene temas con ids únicos', () => {
        expect(level.topics.length).toBeGreaterThan(0);
        const ids = level.topics.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      for (const t of level.topics) {
        it(`${t.id}: estructura completa`, () => {
          expect(t.id).toMatch(/^[a-z0-9-]+$/);
          expect(t.vocabulary.length).toBeGreaterThanOrEqual(8);
          expect(new Set(t.vocabulary.map((v) => v.term)).size).toBe(t.vocabulary.length);
          expect(t.keyPoints.length).toBeGreaterThanOrEqual(3);
          expect(t.notes.length).toBeGreaterThan(3);
          expect(t.conversation.lines.length).toBeGreaterThanOrEqual(6);
          expect(new Set(t.conversation.lines.map((l) => l.speaker)).size).toBeGreaterThanOrEqual(2);
          expect(t.reading.paragraphs.length).toBe(t.reading.translation.length);
          Object.keys(t.reading.glossary).forEach((k) => {
            expect(k, 'claves del glosario en minúsculas').toBe(k.toLowerCase());
            expect(k.split(' ').length, 'máximo 4 palabras').toBeLessThanOrEqual(4);
          });
          checkQuestions(t.quiz, `${t.id} quiz`);
          checkQuestions(t.reading.questions, `${t.id} lectura`);
          expect(t.quiz.length).toBeGreaterThanOrEqual(5);
        });
      }
    });
  }
});
