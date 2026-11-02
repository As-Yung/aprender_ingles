import { useMemo, useState } from 'react';
import { QuizRunner } from '../../components/QuizRunner';
import { SpeakButton } from '../../components/SpeakButton';
import type { SectionProps } from '../types';

interface Token {
  text: string;
  key?: string; // clave de glosario si la palabra/expresión es clicable
}

const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9'’-]/g, '').replace('’', "'");

/** Divide el párrafo en tokens, uniendo expresiones de varias palabras del glosario. */
export function tokenize(paragraph: string, gloss: Map<string, string>): Token[] {
  const words = paragraph.split(/(\s+)/);
  const out: Token[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (/^\s+$/.test(w) || w === '') {
      out.push({ text: w });
      continue;
    }
    let matched = false;
    for (let n = 4; n >= 2; n--) {
      const slice = words.slice(i, i + n * 2 - 1);
      if (slice.length < n * 2 - 1) continue;
      const phrase = slice.filter((_, k) => k % 2 === 0).map(clean).join(' ');
      if (gloss.has(phrase)) {
        out.push({ text: slice.join(''), key: phrase });
        i += n * 2 - 2;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const k = clean(w);
      out.push({ text: w, key: k || undefined });
    }
  }
  return out;
}

export default function ReadingSection({ topic, onComplete }: SectionProps) {
  const r = topic.reading;
  const gloss = useMemo(() => {
    const m = new Map<string, string>();
    topic.vocabulary.forEach((v) => m.set(v.term.toLowerCase(), v.es));
    Object.entries(r.glossary).forEach(([k, v]) => m.set(k.toLowerCase(), v));
    return m;
  }, [topic, r]);
  const [selected, setSelected] = useState<{ word: string; key: string } | null>(null);
  const [showTr, setShowTr] = useState<Record<number, boolean>>({});

  return (
    <div className="reading">
      <div className="card">
        <h3>📖 {r.title}</h3>
        <p className="muted">
          Tap any word: <mark className="gloss-mark">highlighted</mark> ones have an explanation. Use 🔊 to listen to each paragraph.
        </p>
        {r.paragraphs.map((p, i) => (
          <div key={i} className="reading__para">
            <p>
              {tokenize(p, gloss).map((t, j) =>
                t.key ? (
                  <button
                    key={j}
                    type="button"
                    className={`word ${gloss.has(t.key) ? 'word--gloss' : ''} ${selected?.key === t.key ? 'is-selected' : ''}`}
                    onClick={() => setSelected({ word: t.text.replace(/[.,;:!?"“”()]/g, ''), key: t.key! })}
                  >
                    {t.text}
                  </button>
                ) : (
                  <span key={j}>{t.text}</span>
                ),
              )}
            </p>
            <div className="row row--tight">
              <SpeakButton text={p} small label="Listen to paragraph" />
              <SpeakButton text={p} rate={0.7} small label="Listen slowly" />
              <button type="button" className="link-btn" onClick={() => setShowTr((s) => ({ ...s, [i]: !s[i] }))}>
                {showTr[i] ? 'Hide Spanish' : 'Show Spanish'}
              </button>
            </div>
            {showTr[i] && (
              <p className="reading__tr" lang="es">
                {r.translation[i]}
              </p>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="gloss-pop" role="dialog" aria-label={`Meaning of ${selected.word}`}>
          <strong>{selected.word}</strong> <SpeakButton text={selected.word} small />
          <p>{gloss.get(selected.key) ?? 'No gloss: listen to it and guess the meaning from context. 🔎'}</p>
          <button type="button" className="link-btn" onClick={() => setSelected(null)}>
            Close
          </button>
        </div>
      )}

      <QuizRunner title="Reading comprehension" questions={r.questions} onFinish={(s) => onComplete(s)} />
    </div>
  );
}
