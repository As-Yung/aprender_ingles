import { useMemo, useState } from 'react';
import { SpeakButton } from '../../components/SpeakButton';
import type { VocabItem } from '../../content/types';
import { useProgress } from '../../core/progress/ProgressContext';
import { isDue, sortForReview } from '../../core/srs/leitner';
import { normalizeSentence } from '../../core/speech/speech';
import type { SectionProps } from '../types';

type Mode = 'aprender' | 'repasar' | 'practicar';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function FlipCard({ item }: { item: VocabItem }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={`flip ${flipped ? 'is-flipped' : ''}`}
      onClick={() => setFlipped((f) => !f)}
      aria-label={`${item.term}. Tap to see the translation`}
    >
      <span className="flip__inner">
        <span className="flip__front">
          <span className="flip__emoji" aria-hidden="true">
            {item.emoji}
          </span>
          <strong>{item.term}</strong>
          {item.ipa && <small className="ipa">/{item.ipa}/</small>}
        </span>
        <span className="flip__back">
          <strong>{item.es}</strong>
          <em>“{item.example}”</em>
          <small>{item.exampleEs}</small>
        </span>
      </span>
    </button>
  );
}

function Learn({ items }: { items: VocabItem[] }) {
  return (
    <>
      <p className="muted">Tap each card to flip it. Listen to the pronunciation and repeat out loud.</p>
      <div className="flip-grid">
        {items.map((v) => (
          <div key={v.term} className="flip-wrap">
            <FlipCard item={v} />
            <div className="flip-actions">
              <SpeakButton text={v.term} small label="Word" />
              <SpeakButton text={v.example} small label="Example" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Review({ items, keyOf, onDone }: { items: VocabItem[]; keyOf: (v: VocabItem) => string; onDone: () => void }) {
  const { getCard, reviewWord } = useProgress();
  const [queue] = useState(() => sortForReview(items, (v) => getCard(keyOf(v))));
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const dueCount = items.filter((v) => isDue(getCard(keyOf(v)))).length;
  const item = queue[i];

  if (!item) {
    return (
      <div className="card center">
        <p className="big">🎉</p>
        <p>Review done! Words you missed will come back soon; the ones you knew, in a few days.</p>
      </div>
    );
  }
  const card = getCard(keyOf(item));
  const answer = (correct: boolean) => {
    reviewWord(keyOf(item), correct);
    setRevealed(false);
    if (i + 1 >= queue.length) onDone();
    setI(i + 1);
  };

  return (
    <div className="card srs">
      <div className="srs__meta">
        Card {i + 1}/{queue.length} · due today: {dueCount} · box {card?.box ?? 1}/5
      </div>
      <div className="srs__front">
        <span className="flip__emoji" aria-hidden="true">
          {item.emoji}
        </span>
        <strong className="srs__term">{item.term}</strong>
        <SpeakButton text={item.term} />
      </div>
      {revealed ? (
        <>
          <div className="srs__back">
            <strong>{item.es}</strong>
            <p>
              <em>{item.example}</em> <SpeakButton text={item.example} small />
            </p>
            <small>{item.exampleEs}</small>
          </div>
          <div className="row">
            <button className="btn btn--bad" type="button" onClick={() => answer(false)}>
              😕 I didn't know it
            </button>
            <button className="btn btn--ok" type="button" onClick={() => answer(true)}>
              😀 I knew it
            </button>
          </div>
        </>
      ) : (
        <button className="btn" type="button" onClick={() => setRevealed(true)}>
          Show meaning
        </button>
      )}
    </div>
  );
}

function Practice({ items, keyOf, onDone }: { items: VocabItem[]; keyOf: (v: VocabItem) => string; onDone: (score: number) => void }) {
  const { reviewWord } = useProgress();
  const rounds = useMemo(
    () =>
      shuffle(items).map((item, idx) => ({
        item,
        type: idx % 2 === 0 ? ('choice' as const) : ('write' as const),
        options: shuffle([item, ...shuffle(items.filter((x) => x.term !== item.term)).slice(0, 3)]),
      })),
    [items],
  );
  const [i, setI] = useState(0);
  const [result, setResult] = useState<null | boolean>(null);
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState(0);
  const round = rounds[i];

  if (!round) {
    const pct = Math.round((score / rounds.length) * 100);
    return (
      <div className="card center">
        <div className="quiz-result__score">{pct}%</div>
        <p>
          {score} of {rounds.length} correct.
        </p>
      </div>
    );
  }

  const check = (ok: boolean) => {
    setResult(ok);
    reviewWord(keyOf(round.item), ok);
    if (ok) setScore((s) => s + 1);
  };
  const next = () => {
    setResult(null);
    setTyped('');
    if (i + 1 >= rounds.length) onDone(Math.round(((score) / rounds.length) * 100));
    setI(i + 1);
  };

  return (
    <div className="card practice">
      <div className="srs__meta">
        Exercise {i + 1}/{rounds.length}
      </div>
      <p className="quiz__prompt">
        <span aria-hidden="true">{round.item.emoji}</span> How do you say <strong lang="es">“{round.item.es}”</strong> in English?
      </p>
      {round.type === 'choice' ? (
        <div className="quiz__options">
          {round.options.map((o) => (
            <button
              key={o.term}
              type="button"
              className={`quiz__option ${result !== null && o.term === round.item.term ? 'is-correct' : ''}`}
              disabled={result !== null}
              onClick={() => check(o.term === round.item.term)}
            >
              {o.term}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (result === null) check(normalizeSentence(typed) === normalizeSentence(round.item.term));
          }}
        >
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type the word in English"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={80}
            disabled={result !== null}
            aria-label="Answer"
          />
          <button className="btn" type="submit" disabled={result !== null}>
            Check
          </button>
        </form>
      )}
      {result !== null && (
        <div className={result ? 'feedback feedback--ok' : 'feedback feedback--bad'} role="status">
          <strong>{result ? 'Correct!' : `It was: ${round.item.term}`}</strong> <SpeakButton text={round.item.term} small />
          <p>
            <em>{round.item.example}</em>
          </p>
          <button className="btn" type="button" onClick={next}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function VocabularySection({ topic, topicKey, onComplete }: SectionProps) {
  const [mode, setMode] = useState<Mode>('aprender');
  const keyOf = (v: VocabItem) => `${topicKey}/${v.term}`;
  const tabs: { id: Mode; label: string }[] = [
    { id: 'aprender', label: '📚 Learn' },
    { id: 'repasar', label: '🔁 Review (SRS)' },
    { id: 'practicar', label: '🎯 Practice' },
  ];
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            className={`tab ${mode === t.id ? 'is-active' : ''}`}
            onClick={() => setMode(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {mode === 'aprender' && <Learn items={topic.vocabulary} />}
      {mode === 'repasar' && <Review key={topicKey} items={topic.vocabulary} keyOf={keyOf} onDone={() => onComplete()} />}
      {mode === 'practicar' && <Practice key={topicKey} items={topic.vocabulary} keyOf={keyOf} onDone={(s) => onComplete(s)} />}
    </div>
  );
}
