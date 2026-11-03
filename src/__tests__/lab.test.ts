import { describe, expect, it } from 'vitest';
import { loadAllLevels } from '../content';
import { loadAllLabs } from '../content/labs';
import { collectSpeech } from '../core/speech/catalog';
import { buildMemory, buildSpeed, buildSpell, correctedSentence, shuffleFlow, tokens, wrongIndex } from '../modules/lab/logic';

describe('Hands-on Lab', async () => {
  const levels = await loadAllLevels();
  const labs = await loadAllLabs();

  it('correctedSentence replaces or removes the wrong word', () => {
    expect(correctedSentence({ sentence: 'She are a developer.', wrong: 'are', right: 'is', alts: [], why: '' })).toBe('She is a developer.');
    expect(correctedSentence({ sentence: 'Don’t to share it.', wrong: 'to', right: '', alts: [], why: '' })).toBe('Don’t share it.');
    expect(correctedSentence({ sentence: 'More questions than they answer them.', wrong: 'them', right: '', alts: [], why: '' })).toBe('More questions than they answer.');
    expect(correctedSentence({ sentence: 'Do she code?', wrong: 'Do', right: 'Does', alts: [], why: '' })).toBe('Does she code?');
  });

  it('every lab belongs to an existing topic', () => {
    for (const level of levels) {
      const ids = new Set(level.topics.map((t) => t.id));
      Object.keys(labs[level.id]).forEach((id) => expect(ids.has(id), `${level.id}/${id}`).toBe(true));
    }
  });

  for (const level of levels) {
    for (const topic of level.topics) {
      const key = `${level.id}/${topic.id}`;
      it(`${key}: has a valid lab`, () => {
        const lab = labs[level.id][topic.id];
        expect(lab, 'lab content').toBeDefined();
        if (!lab) return;

        expect(lab.chats.length).toBeGreaterThanOrEqual(3);
        lab.chats.forEach((c) => {
          expect(c.replies.filter((r) => r.ok), c.message).toHaveLength(1);
          expect(new Set(c.replies.map((r) => r.text)).size).toBe(c.replies.length);
        });

        expect(lab.fixes.length).toBeGreaterThanOrEqual(4);
        lab.fixes.forEach((f) => {
          const hits = tokens(f.sentence).filter((_, i) => i === wrongIndex(f));
          expect(hits, `wrong word “${f.wrong}” in “${f.sentence}”`).toHaveLength(1);
          const bareHits = tokens(f.sentence).filter((t) => t.replace(/[^\p{L}\p{N}’']/gu, '') === f.wrong);
          expect(bareHits, `“${f.wrong}” must appear once in “${f.sentence}”`).toHaveLength(1);
          expect(f.alts).not.toContain(f.right);
          expect(f.right).not.toBe(f.wrong);
          expect(correctedSentence(f)).not.toBe(f.sentence);
        });

        expect(lab.flow.steps.length).toBeGreaterThanOrEqual(4);
        lab.flow.steps.forEach((s) => expect(s.emoji && s.text).toBeTruthy());
        const order = shuffleFlow(lab.flow);
        expect([...order].sort((a, b) => a - b)).toEqual(lab.flow.steps.map((_, i) => i));
        expect(order.every((v, i) => v === i)).toBe(false);

        expect(lab.screen.lines.length).toBeGreaterThanOrEqual(4);
        expect(lab.screen.questions.length).toBeGreaterThanOrEqual(3);
        lab.screen.questions.forEach((qq) => {
          expect(qq.options[qq.answer]).toBeDefined();
          expect(new Set(qq.options).size).toBe(qq.options.length);
        });
      });

      it(`${key}: vocabulary games work`, () => {
        const m = buildMemory(topic);
        expect(m.items.length).toBeGreaterThanOrEqual(4);
        expect(m.cards).toHaveLength(m.items.length * 2);
        expect(new Set(m.cards.filter((c) => c.kind === 'emoji').map((c) => c.face)).size).toBe(m.items.length);
        buildSpell(topic).forEach((s) => {
          expect(s.letters.join('')).toBe(s.item.term.toLowerCase());
          expect(s.shuffled.map((k) => s.letters[k]).join('')).not.toBe(s.letters.join(''));
        });
        const speed = buildSpeed(topic, 30);
        expect(speed.length).toBeGreaterThanOrEqual(10);
        speed.forEach((t) => {
          expect(t.options).toContain(t.answer);
          expect(t.options[0]!.toLowerCase()).not.toBe(t.options[1]!.toLowerCase());
        });
      });
    }
  }

  it('audio catalog includes the new lab phrases', () => {
    const texts = new Set(collectSpeech(levels, labs).map((i) => `${i.voice}|${i.text}`));
    const lab = labs.a1['tech-team-intro']!;
    expect(texts.has(`1|${lab.chats[0]!.message}`)).toBe(true);
    expect(texts.has(`0|${lab.chats[0]!.replies.find((r) => r.ok)!.text}`)).toBe(true);
    expect(texts.has(`0|${correctedSentence(lab.fixes[0]!)}`)).toBe(true);
  });
});
