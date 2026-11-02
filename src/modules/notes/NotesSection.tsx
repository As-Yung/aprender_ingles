import { useEffect } from 'react';
import { SpeakButton } from '../../components/SpeakButton';
import type { NoteBlock } from '../../content/types';
import type { SectionProps } from '../types';

function Block({ block }: { block: NoteBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h3 className="notes__heading">{block.text}</h3>;
    case 'text':
      return <p>{block.text}</p>;
    case 'formula':
      return (
        <div className="formula-box">
          {block.label && <div className="formula-box__label">{block.label}</div>}
          <div className="formula">
            {block.parts.map((p, i) => (
              <span key={i} className="formula__part">
                {p}
              </span>
            ))}
          </div>
        </div>
      );
    case 'table':
      return (
        <div className="table-wrap">
          <table className="notes__table">
            <thead>
              <tr>
                {block.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'examples':
      return (
        <ul className="notes__examples">
          {block.items.map((e) => (
            <li key={e.en}>
              <span className="en">{e.en}</span> <SpeakButton text={e.en} small />
              <span className="es">{e.es}</span>
            </li>
          ))}
        </ul>
      );
    case 'tip':
      return <div className="callout callout--tip">💡 {block.text}</div>;
    case 'warning':
      return <div className="callout callout--warn">⚠️ {block.text}</div>;
    case 'list':
      return (
        <ul className="notes__list">
          {block.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      );
  }
}

/** Apuntes tipo cuaderno + resumen final con los puntos clave. */
export default function NotesSection({ topic, onComplete }: SectionProps) {
  useEffect(() => {
    const t = window.setTimeout(() => onComplete(), 20_000); // leído ≥ 20 s
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="notebook">
      <div className="notebook__page">
        <h2 className="notebook__title">
          {topic.emoji} {topic.title} <small>— {topic.titleEs}</small>
        </h2>
        <p className="notebook__focus">
          <span className="highlighter">Enfoque:</span> {topic.grammarFocus}
        </p>
        <p>{topic.summary}</p>
        {topic.notes.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
      <aside className="notebook__summary">
        <h3>📌 Resumen para repasar</h3>
        <ol>
          {topic.keyPoints.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        <button className="btn btn--ghost" type="button" onClick={() => window.print()}>
          🖨️ Imprimir apuntes
        </button>
      </aside>
    </div>
  );
}
