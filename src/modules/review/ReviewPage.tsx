import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SpeakButton } from '../../components/SpeakButton';
import { LEVELS, isLevelId, loadLevel } from '../../content';
import type { Level } from '../../content/types';
import { useProgress } from '../../core/progress/ProgressContext';
import { MASTER_AFTER, isMastered } from '../../core/progress/misses';
import { speak, stopSpeaking } from '../../core/speech/speech';
import { sonar } from '../vocab-game/fx';
import {
  KIND_INFO,
  buildQuestion,
  levelsNeeded,
  pickRound,
  resolveWords,
  sameLetter,
  type ReviewQuestion,
  type ReviewWord,
} from './logic';
import './review.css';

/**
 * 🐛 Caza de bugs: cada palabra que fallas en las prácticas se convierte en un bug.
 * Acierta MASTER_AFTER veces seguidas para aplastarlo. Las preguntas se vuelven más difíciles
 * con cada acierto (reconocer → escuchar/completar → escribir).
 */
export default function ReviewPage() {
  const { data } = useProgress();
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [filter, setFilter] = useState<string>('todos');
  const [session, setSession] = useState<ReviewWord[] | null>(null);
  const [round, setRound] = useState(0);
  const location = useLocation();
  // Pulsar "Repaso" en el menú durante una ronda vuelve al nido.
  useEffect(() => setSession(null), [location.key]);

  const needed = levelsNeeded(data.misses).join(',');
  useEffect(() => {
    let cancel = false;
    const ids = needed ? needed.split(',').filter(isLevelId) : [];
    void Promise.all(ids.map((id) => loadLevel(id))).then((ls) => !cancel && setLevels(ls));
    return () => {
      cancel = true;
    };
  }, [needed]);

  const words = useMemo(() => (levels ? resolveWords(data.misses, levels) : []), [data.misses, levels]);
  const pending = words.filter((w) => !isMastered(w.record));
  const mastered = words.filter((w) => isMastered(w.record));
  const levelIds = LEVELS.filter((l) => pending.some((w) => w.levelId === l.id));
  const shown = filter === 'todos' ? pending : pending.filter((w) => w.levelId === filter);
  const totalMisses = pending.reduce((a, w) => a + w.record.count, 0);

  const start = () => {
    const pool = filter === 'todos' ? words : words.filter((w) => w.levelId === filter);
    setSession(pickRound(data.misses, pool));
    setRound((r) => r + 1);
  };

  if (!levels) return <p className="muted">Loading your bugs…</p>;

  if (session) {
    return <Hunt key={round} words={session} all={words} onExit={() => setSession(null)} onAgain={start} />;
  }

  return (
    <div className="bugs">
      <section className="bugs-hero">
        <div className="bugs-hero__text">
          <h1>🐛 Bug Hunt</h1>
          <p>
            Every word you miss in visual practice, vocabulary or the ⚔️ Vocab Boss Game becomes a <strong>bug</strong>. Get it right{' '}
            {MASTER_AFTER} times in a row to <strong>squash it 💥</strong>. Each hit makes it harder: first you recognize it, then you listen and
            fill the gap, and finally you spell it yourself.
          </p>
        </div>
        <div className="bugs-stats">
          <div className="bugs-stat">
            <strong>🐛 {pending.length}</strong>
            <span>to hunt</span>
          </div>
          <div className="bugs-stat">
            <strong>💥 {mastered.length}</strong>
            <span>squashed</span>
          </div>
          <div className="bugs-stat">
            <strong>❌ {totalMisses}</strong>
            <span>total misses</span>
          </div>
        </div>
      </section>

      {pending.length === 0 ? (
        <div className="card center bugs-empty">
          <p className="big">{mastered.length ? '🏆' : '🌱'}</p>
          <h2>{mastered.length ? 'No bugs left!' : 'No bugs yet'}</h2>
          <p className="muted">
            {mastered.length
              ? 'You squashed every word you had missed. Keep practicing!'
              : 'When you miss a word in practice, it shows up here so you can review it by playing.'}
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn" to="/">
              📚 Go to topics
            </Link>
            <Link className="btn btn--ghost" to="/juego">
              ⚔️ Vocab Boss Game
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card bugs-play">
            <button className="btn btn--big bugs-play__btn" type="button" onClick={start}>
              ▶️ Start hunting! <small>({Math.min(8, shown.length)} bugs)</small>
            </button>
            {levelIds.length > 1 && (
              <div className="row bugs-filter" role="group" aria-label="Filter by level">
                <button type="button" className={`chip ${filter === 'todos' ? 'is-selected' : ''}`} onClick={() => setFilter('todos')}>
                  All
                </button>
                {levelIds.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`chip ${filter === l.id ? 'is-selected' : ''}`}
                    style={{ borderColor: l.color }}
                    onClick={() => setFilter(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <h2 className="bugs-title">🪲 Your bug nest</h2>
          <p className="muted">Tap a card to flip it and see its meaning and an example.</p>
          <div className="bugs-grid">
            {shown.map((w) => (
              <BugCard key={w.key} word={w} />
            ))}
          </div>
        </>
      )}

      {mastered.length > 0 && (
        <>
          <h2 className="bugs-title">🏆 Bugs aplastados</h2>
          <div className="row">
            {mastered.map((w) => (
              <span key={w.key} className="chip chip--static bugs-squashed">
                💥 {w.item.emoji} {w.item.term}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Pips({ ok }: { ok: number }) {
  return (
    <span className="bugs-pips" aria-label={`${ok} of ${MASTER_AFTER} correct in a row`}>
      {Array.from({ length: MASTER_AFTER }, (_, i) => (
        <span key={i} className={i < ok ? 'is-on' : ''} />
      ))}
    </span>
  );
}

function BugCard({ word }: { word: ReviewWord }) {
  const [flipped, setFlipped] = useState(false);
  const { item, record } = word;
  const level = LEVELS.find((l) => l.id === word.levelId);
  return (
    <div className={`bug-card ${flipped ? 'is-flipped' : ''} ${record.count >= 3 ? 'is-angry' : ''}`}>
      <button type="button" className="bug-card__inner" onClick={() => setFlipped((f) => !f)} aria-label={`${item.term}. Tap to see the translation`}>
        <span className="bug-card__front">
          <span className="bug-card__badge" style={{ background: level?.color }}>
            {word.levelName}
          </span>
          <span className="bug-card__misses" title="Times missed">
            ❌×{record.count}
          </span>
          <span className="bug-card__emoji" aria-hidden="true">
            {item.emoji}
          </span>
          <strong className="bug-card__term">{item.term}</strong>
          <Pips ok={record.ok} />
        </span>
        <span className="bug-card__back">
          <strong>{item.es}</strong>
          <span className="bug-card__example">“{item.example}”</span>
          <span className="muted">{item.exampleEs}</span>
          <small className="muted">📚 {word.topicTitle}</small>
        </span>
      </button>
      <span className="bug-card__speak">
        <SpeakButton text={flipped ? item.example : item.term} small />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partida                                                             */
/* ------------------------------------------------------------------ */

function Hunt({ words, all, onExit, onAgain }: { words: ReviewWord[]; all: ReviewWord[]; onExit: () => void; onAgain: () => void }) {
  const { data, reviewWord } = useProgress();
  const missesRef = useRef(data.misses);
  missesRef.current = data.misses;
  const extra = useMemo(() => all.map((w) => w.item), [all]);

  const [queue, setQueue] = useState<ReviewWord[]>(words);
  const [retried, setRetried] = useState<Set<string>>(() => new Set());
  const [i, setI] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [hits, setHits] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [squashed, setSquashed] = useState<string[]>([]);
  const [boom, setBoom] = useState<string | null>(null);

  const fresh = useCallback((w: ReviewWord): ReviewWord => ({ ...w, record: missesRef.current[w.key] ?? w.record }), []);
  const current = queue[i];
  const question = useMemo<ReviewQuestion | null>(() => (current ? buildQuestion(fresh(current), extra) : null), [current, i, extra, fresh]);

  useEffect(() => () => stopSpeaking(), []);

  const answer = (correct: boolean) => {
    if (!question || result !== null) return;
    const w = question.word;
    setResult(correct);
    setAnswered((a) => a + 1);
    reviewWord(w.key, correct);
    if (correct) {
      setHits((h) => h + 1);
      const c = combo + 1;
      setCombo(c);
      setBestCombo((b) => Math.max(b, c));
      if (w.record.ok + 1 >= MASTER_AFTER) {
        setSquashed((s) => [...s, w.key]);
        setBoom(w.item.term);
        sonar('victoria', true);
        setTimeout(() => setBoom(null), 1400);
      } else {
        sonar('acierto', true);
      }
    } else {
      setCombo(0);
      sonar('error', true);
      // El bug se escapa… y vuelve al final de la ronda (una vez).
      if (!retried.has(w.key)) {
        setRetried(new Set(retried).add(w.key));
        setQueue((q) => [...q, w]);
      }
    }
    void speak(question.kind === 'completa' ? w.item.example : w.item.term);
  };

  const next = () => {
    setResult(null);
    setI((n) => n + 1);
  };

  if (!question) {
    const score = answered ? Math.round((hits / answered) * 100) : 0;
    const stars = score >= 90 ? '⭐⭐⭐' : score >= 60 ? '⭐⭐' : '⭐';
    return (
      <div className="card center bugs-end">
        <p className="big">{stars}</p>
        <h2>Round complete!</h2>
        <p>
          <strong>{score}%</strong> correct · 🔥 best combo: <strong>{bestCombo}</strong>
        </p>
        {squashed.length > 0 ? (
          <p>
            💥 You squashed <strong>{squashed.length}</strong> {squashed.length === 1 ? 'bug' : 'bugs'}:{' '}
            {squashed.map((k) => all.find((w) => w.key === k)?.item.term).join(', ')}
          </p>
        ) : (
          <p className="muted">Every hit brings the bugs closer to being squashed. One more round!</p>
        )}
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" type="button" onClick={onAgain}>
            🔁 Another round
          </button>
          <button className="btn btn--ghost" type="button" onClick={onExit}>
            🪲 See my nest
          </button>
        </div>
      </div>
    );
  }

  const info = KIND_INFO[question.kind];
  const ok = question.word.record.ok;
  return (
    <div className="bugs hunt">
      <div className="hunt__top">
        <button className="btn btn--ghost btn--small" type="button" onClick={onExit}>
          ✕ Exit
        </button>
        <div className="hunt__track" aria-label={`Question ${i + 1} of ${queue.length}`}>
          {queue.map((w, k) => (
            <span key={`${w.key}-${k}`} className={`hunt__dot ${k < i ? 'is-done' : ''} ${k === i ? 'is-now' : ''}`} aria-hidden="true">
              {squashed.includes(w.key) && k < i ? '💥' : k === i ? '🐛' : k < i ? '·' : '🐛'}
            </span>
          ))}
        </div>
        <span className={`hunt__combo ${combo >= 3 ? 'is-hot' : ''}`} title="Correct in a row">
          🔥 {combo}
        </span>
      </div>

      <div className="card hunt__card">
        <div className="hunt__kind">
          <span>
            {info.emoji} {info.label}
          </span>
          <Pips ok={ok} />
        </div>
        <p className="muted hunt__help">{info.help}</p>
        {question.kind === 'deletrea' ? (
          <Spell key={`${question.word.key}-${i}`} q={question} done={result !== null} onResult={answer} />
        ) : (
          <Choice key={`${question.word.key}-${i}`} q={question} result={result} onPick={(id) => answer(id === question.answer)} />
        )}

        {result !== null && (
          <div className={result ? 'feedback feedback--ok hunt__feedback' : 'feedback feedback--bad hunt__feedback'}>
            <span className="hunt__answer">
              <span aria-hidden="true">{question.word.item.emoji}</span> <strong>{question.word.item.term}</strong> = {question.word.item.es}{' '}
              <SpeakButton text={question.word.item.term} small />
            </span>
            <span className="hunt__example">
              “{question.word.item.example}” <SpeakButton text={question.word.item.example} small label="Listen to example" />
            </span>
            <span>{result ? (boom ? '💥 Bug squashed!' : '✅ Correct! The bug is getting weaker.') : '❌ It got away! It will come back at the end of the round.'}</span>
            <button className="btn btn--small" type="button" onClick={next} autoFocus>
              Next ➜
            </button>
          </div>
        )}
      </div>

      {boom && (
        <div className="bugs-boom" role="status" aria-live="polite">
          <span className="bugs-boom__bang" aria-hidden="true">
            💥
          </span>
          <strong>{boom} squashed!</strong>
        </div>
      )}
    </div>
  );
}

/* Opción múltiple (significado, escucha y completa) ------------------- */
function Choice({ q, result, onPick }: { q: ReviewQuestion; result: boolean | null; onPick: (id: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const { item } = q.word;

  useEffect(() => {
    if (q.kind === 'escucha') void speak(item.term);
  }, [q, item.term]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (result === null && n >= 1 && n <= q.options.length) {
        const o = q.options[n - 1]!;
        setPicked(o.id);
        onPick(o.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, result, onPick]);

  return (
    <div>
      {q.kind === 'significado' && (
        <div className="hunt__prompt">
          <strong className="hunt__term">{item.term}</strong>
          <SpeakButton text={item.term} />
        </div>
      )}
      {q.kind === 'escucha' && (
        <div className="row hunt__listen">
          <button className="btn btn--big" type="button" onClick={() => void speak(item.term)}>
            🔊 Listen
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => void speak(item.term, { rate: 0.7 })}>
            🐢 Slow
          </button>
        </div>
      )}
      {q.kind === 'completa' && (
        <div className="gap">
          <span className="gap__emoji" aria-hidden="true">
            {item.emoji}
          </span>
          <p className="gap__sentence">
            {q.before}
            <span className={`gap__blank ${result !== null ? (result ? 'is-correct' : 'is-wrong') : ''}`}>{result !== null ? q.answer : '_____'}</span>
            {q.after}
          </p>
          <p className="muted">🇪🇸 {item.exampleEs}</p>
        </div>
      )}
      <div className={q.kind === 'completa' ? 'row hunt__chips' : 'pgrid'}>
        {q.options.map((o, k) => {
          const cls = result !== null && o.id === q.answer ? 'is-correct' : picked === o.id && o.id !== q.answer ? 'is-wrong shake' : '';
          return q.kind === 'completa' ? (
            <button key={o.id} type="button" className={`chip ${cls}`} disabled={result !== null} onClick={() => { setPicked(o.id); onPick(o.id); }}>
              {o.text}
            </button>
          ) : (
            <button
              key={o.id}
              type="button"
              className={`pcard pcard--big ${cls}`}
              disabled={result !== null}
              onClick={() => {
                setPicked(o.id);
                onPick(o.id);
              }}
            >
              <span className="hunt__key" aria-hidden="true">
                {k + 1}
              </span>
              {o.emoji && (
                <span className="pcard__emoji" aria-hidden="true">
                  {o.emoji}
                </span>
              )}
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Escribir con fichas de letras --------------------------------------- */
function Spell({ q, done, onResult }: { q: ReviewQuestion; done: boolean; onResult: (correct: boolean) => void }) {
  const letters = q.letters ?? [];
  const tiles = q.tiles ?? [];
  const { item } = q.word;
  const [used, setUsed] = useState<number[]>([]); // índices de fichas usadas, en orden
  const [mistakes, setMistakesState] = useState(0);
  const mistakesRef = useRef(0);
  const setMistakes = (fn: (m: number) => number) => {
    mistakesRef.current = fn(mistakesRef.current);
    setMistakesState(mistakesRef.current);
  };
  const [wrongTile, setWrongTile] = useState<number | null>(null);
  const pos = used.length;
  const words = item.term.replace(/’/g, "'").trim().split(/\s+/);

  const tap = useCallback(
    (tile: number) => {
      if (done || used.includes(tile) || pos >= letters.length) return;
      if (sameLetter(letters[tile]!, letters[pos]!)) {
        const next = [...used, tile];
        setUsed(next);
        if (next.length === letters.length) onResult(mistakesRef.current <= 1);
      } else {
        setMistakes((m) => m + 1);
        setWrongTile(tile);
        setTimeout(() => setWrongTile(null), 450);
      }
    },
    [done, used, pos, letters, onResult],
  );

  const hint = () => {
    if (done) return;
    const tile = tiles.find((t) => !used.includes(t) && sameLetter(letters[t]!, letters[pos]!));
    if (tile === undefined) return;
    setMistakes((m) => m + 1);
    tap(tile);
  };

  // Teclado físico: escribe la letra y se usa la primera ficha libre que coincida.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const tile = tiles.find((t) => !used.includes(t) && sameLetter(letters[t]!, e.key.replace(/’/g, "'")));
      if (tile !== undefined) tap(tile);
      else if (!done && /\S/.test(e.key)) {
        setMistakes((m) => m + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tiles, used, letters, tap, done]);

  let idx = 0;
  return (
    <div className="spell">
      <div className="spell__clue">
        <span className="spell__emoji" aria-hidden="true">
          {item.emoji}
        </span>
        <strong>{item.es}</strong>
        <SpeakButton text={item.term} />
      </div>
      <div className="spell__slots" aria-live="polite" aria-label={`Typed: ${used.map((t) => letters[t]).join('')}`}>
        {words.map((wd, wi) => (
          <span key={wi} className="spell__word">
            {[...wd].map(() => {
              const k = idx++;
              const filled = k < pos;
              return (
                <span key={k} className={`spell__slot ${filled ? 'is-filled' : ''} ${k === pos && !done ? 'is-next' : ''}`}>
                  {filled ? letters[k] : ''}
                </span>
              );
            })}
          </span>
        ))}
      </div>
      <div className="spell__tiles">
        {tiles.map((t) => (
          <button
            key={t}
            type="button"
            className={`spell__tile ${wrongTile === t ? 'is-wrong shake' : ''}`}
            disabled={used.includes(t) || done}
            onClick={() => tap(t)}
          >
            {letters[t]}
          </button>
        ))}
      </div>
      {!done && (
        <div className="row spell__tools">
          <button className="btn btn--ghost btn--small" type="button" onClick={hint}>
            💡 Hint
          </button>
          <button className="btn btn--ghost btn--small" type="button" onClick={() => void speak(item.term, { rate: 0.7 })}>
            🐢 Listen slowly
          </button>
          <button className="btn btn--ghost btn--small" type="button" onClick={() => onResult(false)}>
            🏳️ I don't know
          </button>
          <span className="muted">Mistakes: {mistakes} (1 allowed)</span>
        </div>
      )}
    </div>
  );
}
