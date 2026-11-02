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
    return <div className="card">Your browser doesn't support speech synthesis. Try an up-to-date Chrome, Edge or Safari.</div>;
  }
  if (!sentence) {
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)) * 100);
    return (
      <div className="card center">
        <div className="quiz-result__score">{avg}%</div>
        <p>Average dictation accuracy.</p>
        <button className="btn" type="button" onClick={() => { setI(0); setScores([]); }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="srs__meta">
        Sentence {i + 1}/{sentences.length}
      </div>
      <p>Listen to the sentence and type it. Replay it as many times as you need.</p>
      <div className="row">
        <button className="btn" type="button" onClick={() => void speak(sentence)}>
          🔊 Listen
        </button>
        <button className="btn btn--ghost" type="button" onClick={() => void speak(sentence, { rate: 0.7 })}>
          🐢 Slow
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
          placeholder="Type what you hear…"
          aria-label="Dictation"
          spellCheck={false}
          disabled={score !== null}
        />
        {score === null ? (
          <button className="btn" type="submit">
            Check
          </button>
        ) : (
          <div className={score >= 0.85 ? 'feedback feedback--ok' : 'feedback feedback--bad'} role="status">
            <strong>{Math.round(score * 100)}% match</strong>
            <p>Answer: “{sentence}”</p>
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
              Next
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
