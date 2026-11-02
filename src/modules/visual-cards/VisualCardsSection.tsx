import { useMemo } from 'react';
import { SpeakButton } from '../../components/SpeakButton';
import type { NoteBlock, VocabItem } from '../../content/types';
import type { SectionProps } from '../types';

const PALETTE = ['#fde68a', '#bfdbfe', '#fbcfe8', '#bbf7d0', '#ddd6fe', '#fed7aa', '#a5f3fc'];

/** Tarjetas visuales tipo infografía: un bloque por categoría + tarjeta de repaso + fórmula. */
export default function VisualCardsSection({ level, topic, onComplete }: SectionProps) {
  const groups = useMemo(() => {
    const map = new Map<string, VocabItem[]>();
    topic.vocabulary.forEach((v) => map.set(v.category, [...(map.get(v.category) ?? []), v]));
    return [...map.entries()];
  }, [topic]);
  const formulas = topic.notes.filter((n): n is Extract<NoteBlock, { kind: 'formula' }> => n.kind === 'formula');

  return (
    <div>
      <div className="section-toolbar">
        <p className="muted">Guarda o imprime estas tarjetas para repasar. Pulsa 🔊 para escuchar.</p>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            onComplete();
            window.print();
          }}
        >
          🖨️ Imprimir / PDF
        </button>
      </div>

      <div className="vcard-grid">
        {groups.map(([category, items], gi) => (
          <article key={category} className="vcard" style={{ background: PALETTE[gi % PALETTE.length] }}>
            <header className="vcard__header">
              <span className="vcard__level" style={{ background: level.color }}>
                {level.name}
              </span>
              <h3>{category}</h3>
            </header>
            <ul className="vcard__items">
              {items.map((v) => (
                <li key={v.term}>
                  <span className="vcard__emoji" aria-hidden="true">
                    {v.emoji}
                  </span>
                  <span className="vcard__term">
                    <strong>{v.term}</strong>
                    {v.ipa && <small className="ipa">/{v.ipa}/</small>}
                    <span className="vcard__es">{v.es}</span>
                  </span>
                  <SpeakButton text={v.term} small />
                </li>
              ))}
            </ul>
          </article>
        ))}

        {formulas.map((f, i) => (
          <article key={`f${i}`} className="vcard vcard--formula">
            <header className="vcard__header">
              <span className="vcard__level" style={{ background: level.color }}>
                {level.name}
              </span>
              <h3>{f.label ?? 'Estructura'}</h3>
            </header>
            <div className="formula">
              {f.parts.map((p, j) => (
                <span key={j} className="formula__part">
                  {p}
                </span>
              ))}
            </div>
          </article>
        ))}

        <article className="vcard vcard--review">
          <header className="vcard__header">
            <span className="vcard__level" style={{ background: level.color }}>
              {level.name}
            </span>
            <h3>
              {topic.emoji} Repaso: {topic.titleEs}
            </h3>
          </header>
          <ol className="vcard__points">
            {topic.keyPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </article>
      </div>
    </div>
  );
}
