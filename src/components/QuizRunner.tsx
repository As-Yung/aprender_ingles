import { useMemo, useState } from 'react';
import type { Question } from '../content/types';

interface Props {
  questions: Question[];
  onFinish?: (score: number) => void;
  title?: string;
}

/** Ejecuta un cuestionario de opción múltiple con retroalimentación inmediata. */
export function QuizRunner({ questions, onFinish, title }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const q = questions[index];
  const score = useMemo(() => Math.round((correct / Math.max(1, questions.length)) * 100), [correct, questions.length]);

  if (questions.length === 0) return null;

  if (finished) {
    return (
      <div className="card quiz-result">
        <div className="quiz-result__score">{score}%</div>
        <p>
          Acertaste {correct} de {questions.length}.{' '}
          {score >= 80 ? '¡Excelente trabajo! 🎉' : score >= 50 ? 'Vas bien, repasa los apuntes. 💪' : 'Repasa el tema y vuelve a intentarlo. 📒'}
        </p>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setIndex(0);
            setSelected(null);
            setCorrect(0);
            setFinished(false);
          }}
        >
          Repetir
        </button>
      </div>
    );
  }

  if (!q) return null;
  const answered = selected !== null;

  return (
    <div className="card quiz">
      {title && <h3>{title}</h3>}
      <div className="quiz__meta">
        Pregunta {index + 1} de {questions.length}
        <div className="progress-bar" aria-hidden="true">
          <span style={{ width: `${(index / questions.length) * 100}%` }} />
        </div>
      </div>
      <p className="quiz__prompt">{q.prompt}</p>
      <div className="quiz__options" role="radiogroup">
        {q.options.map((opt, i) => {
          let cls = 'quiz__option';
          if (answered && i === q.answer) cls += ' is-correct';
          else if (answered && i === selected) cls += ' is-wrong';
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={selected === i}
              className={cls}
              disabled={answered}
              onClick={() => {
                setSelected(i);
                if (i === q.answer) setCorrect((c) => c + 1);
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={selected === q.answer ? 'feedback feedback--ok' : 'feedback feedback--bad'} role="status">
          <strong>{selected === q.answer ? '¡Correcto!' : `Respuesta correcta: ${q.options[q.answer]}`}</strong>
          {q.explanation && <p>{q.explanation}</p>}
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (index + 1 >= questions.length) {
                setFinished(true);
                onFinish?.(Math.round((correct / questions.length) * 100));
              } else {
                setIndex(index + 1);
                setSelected(null);
              }
            }}
          >
            {index + 1 >= questions.length ? 'Ver resultado' : 'Siguiente'}
          </button>
        </div>
      )}
    </div>
  );
}
