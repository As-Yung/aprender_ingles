import { useMemo, useState } from 'react';
import { canPlayAudio, similarity, speak } from '../../core/speech/speech';
import type { SectionProps } from '../types';

export default function DictationSection({ topic, onComplete }: SectionProps) {
  const sentences = useMemo(
    () => (topic.dictation?.length ? topic.dictation : topic.vocabulary.slice(0, 6).map((v) => v.example)),
    [topic],
  );
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const sentence = sentences[i];

  if (!canPlayAudio()) {
    return <div className="card">Tu navegador no tiene síntesis de voz. Prueba con Chrome, Edge o Safari actualizados.</div>;
  }
  if (!sentence) {
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)) * 100);
    return (
      <div className="card center">
        <div className="quiz-result__score">{avg}%</div>
        <p>Precisión media del dictado.</p>
        <button className="btn" type="button" onClick={() => { setI(0); setScores([]); }}>
          Repetir
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="srs__meta">
        Frase {i + 1}/{sentences.length}
      </div>
      <p>Escucha la frase y escríbela. Puedes repetirla las veces que necesites.</p>
      <div className="row">
        <button className="btn" type="button" onClick={() => void speak(sentence)}>
          🔊 Escuchar
        </button>
        <button className="btn btn--ghost" type="button" onClick={() => void speak(sentence, { rate: 0.7 })}>
          🐢 Despacio
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (score !== null) return;
          const s = similarity(sentence, typed);
          setScore(s);
          setScores((x) => [...x, s]);
        }}
      >
        <textarea
          className="input"
          rows={2}
          value={typed}
          maxLength={300}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Escribe lo que oyes…"
          aria-label="Dictado"
          spellCheck={false}
          disabled={score !== null}
        />
        {score === null ? (
          <button className="btn" type="submit">
            Comprobar
          </button>
        ) : (
          <div className={score >= 0.85 ? 'feedback feedback--ok' : 'feedback feedback--bad'} role="status">
            <strong>{Math.round(score * 100)}% de coincidencia</strong>
            <p>Correcto: “{sentence}”</p>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setTyped('');
                setScore(null);
                if (i + 1 >= sentences.length) {
                  onComplete(Math.round(([...scores].reduce((a, b) => a + b, 0) / scores.length) * 100));
                }
                setI(i + 1);
              }}
            >
              Siguiente
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
