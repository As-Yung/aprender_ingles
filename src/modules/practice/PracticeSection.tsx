import { useMemo, useState } from 'react';
import { SpeakButton } from '../../components/SpeakButton';
import type { Topic, VocabItem } from '../../content/types';
import { useProgress } from '../../core/progress/ProgressContext';
import { speak } from '../../core/speech/speech';
import type { SectionProps } from '../types';
import { buildGaps, buildListen, buildMatch, buildOrder, buildSort, shuffle } from './generators';

type GameId = 'emparejar' | 'ordenar' | 'completar' | 'escuchar' | 'clasificar';
const GAMES: { id: GameId; emoji: string; label: string; help: string }[] = [
  { id: 'emparejar', emoji: '🧩', label: 'Match', help: 'Tap a card, then its English word.' },
  { id: 'escuchar', emoji: '👂', label: 'Listen & pick', help: 'Listen to the word and tap the right picture.' },
  { id: 'completar', emoji: '✏️', label: 'Fill the gap', help: 'Pick the word missing from the sentence.' },
  { id: 'ordenar', emoji: '🔤', label: 'Build the sentence', help: 'Tap the tiles in order to build the sentence.' },
  { id: 'clasificar', emoji: '🗂️', label: 'Sort it', help: 'Tap each word, then the box it belongs to.' },
];

type GameProps = {
  topic: Topic;
  onDone: (score: number) => void;
  /** Registra el acierto/fallo de una palabra (alimenta el repaso de palabras falladas). */
  onAnswer: (item: VocabItem, correct: boolean) => void;
};

export default function PracticeSection({ topic, topicKey, onComplete }: SectionProps) {
  const { recordAnswer } = useProgress();
  const sortable = useMemo(() => buildSort(topic) !== null, [topic]);
  const games = GAMES.filter((g) => g.id !== 'clasificar' || sortable);
  const [game, setGame] = useState<GameId>('emparejar');
  const [round, setRound] = useState(0);
  const [scores, setScores] = useState<Partial<Record<GameId, number>>>({});
  const current = games.find((g) => g.id === game)!;

  const done = (score: number) => {
    const next = { ...scores, [game]: Math.max(score, scores[game] ?? 0) };
    setScores(next);
    const vals = games.map((g) => next[g.id]);
    if (vals.every((v) => v !== undefined)) {
      onComplete(Math.round(vals.reduce((a, b) => a! + b!, 0)! / vals.length));
    }
  };

  const onAnswer = (item: VocabItem, correct: boolean) => recordAnswer(`${topicKey}/${item.term}`, correct);
  const props: GameProps = { topic, onDone: done, onAnswer };
  return (
    <div className="practice">
      <div className="card">
        <h3>🎮 Visual practice</h3>
        <p className="muted">
          Five mini-games with this topic's vocabulary and phrases. Finish them all to complete the section. Questions change every
          time you replay.
        </p>
        <div className="practice__games" role="tablist">
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={game === g.id}
              className={`practice__game ${game === g.id ? 'is-active' : ''}`}
              onClick={() => {
                setGame(g.id);
                setRound((r) => r + 1);
              }}
            >
              <span className="practice__game-emoji" aria-hidden="true">
                {g.emoji}
              </span>
              <span>{g.label}</span>
              <small>{scores[g.id] !== undefined ? `⭐ ${scores[g.id]}%` : '—'}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <p className="practice__help">
          {current.emoji} {current.help}
        </p>
        {game === 'emparejar' && <MatchGame key={`m${round}`} {...props} />}
        {game === 'escuchar' && <ListenGame key={`l${round}`} {...props} />}
        {game === 'completar' && <GapGame key={`g${round}`} {...props} />}
        {game === 'ordenar' && <OrderGame key={`o${round}`} {...props} />}
        {game === 'clasificar' && <SortGame key={`s${round}`} {...props} />}
        <div className="row">
          <button className="btn btn--ghost btn--small" type="button" onClick={() => setRound((r) => r + 1)}>
            🔀 Nuevas preguntas
          </button>
        </div>
      </div>
    </div>
  );
}

function Finished({ score, onAgain }: { score: number; onAgain?: () => void }) {
  const stars = score >= 90 ? '⭐⭐⭐' : score >= 60 ? '⭐⭐' : '⭐';
  return (
    <div className="practice__finished">
      <p className="big">{stars}</p>
      <p>
        <strong>{score}%</strong> {score >= 90 ? 'Excellent!' : score >= 60 ? 'Well done!' : 'Keep practicing, you are doing fine!'}
      </p>
      {onAgain && (
        <button className="btn" type="button" onClick={onAgain}>
          Play again
        </button>
      )}
    </div>
  );
}

const pct = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0);

/* 🧩 Emparejar -------------------------------------------------------- */
function MatchGame({ topic, onDone, onAnswer }: GameProps) {
  const data = useMemo(() => buildMatch(topic), [topic]);
  const [selected, setSelected] = useState<string | null>(null); // es seleccionado (término correcto)
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const finished = matched.length === data.items.length;

  const tryTerm = (term: string) => {
    if (!selected || matched.includes(term)) return;
    const item = data.items.find((v) => v.term === selected);
    if (item) onAnswer(item, selected === term);
    if (selected === term) {
      const next = [...matched, term];
      setMatched(next);
      setSelected(null);
      void speak(term);
      if (next.length === data.items.length) onDone(pct(data.items.length, data.items.length + mistakes));
    } else {
      setMistakes((m) => m + 1);
      setWrong(term);
      setTimeout(() => setWrong(null), 500);
    }
  };

  if (finished) return <Finished score={pct(data.items.length, data.items.length + mistakes)} />;
  return (
    <div className="match">
      <div className="match__col">
        {data.items.map((v) => (
          <button
            key={v.term}
            type="button"
            disabled={matched.includes(v.term)}
            className={`pcard ${selected === v.term ? 'is-selected' : ''} ${matched.includes(v.term) ? 'is-correct' : ''}`}
            onClick={() => setSelected(v.term)}
          >
            <span className="pcard__emoji" aria-hidden="true">
              {v.emoji}
            </span>
            <span>{v.es}</span>
          </button>
        ))}
      </div>
      <div className="match__col">
        {data.terms.map((t) => (
          <button
            key={t}
            type="button"
            disabled={matched.includes(t)}
            className={`chip ${matched.includes(t) ? 'is-correct' : ''} ${wrong === t ? 'is-wrong shake' : ''}`}
            onClick={() => tryTerm(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/* 👂 Escucha y elige --------------------------------------------------- */
function ListenGame({ topic, onDone, onAnswer }: GameProps) {
  const tasks = useMemo(() => buildListen(topic), [topic]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [ok, setOk] = useState(0);
  const task = tasks[i];
  if (!task) return <Finished score={pct(ok, tasks.length)} />;
  const answer = (term: string) => {
    if (picked) return;
    setPicked(term);
    const good = term === task.item.term;
    onAnswer(task.item, good);
    const nextOk = ok + (good ? 1 : 0);
    setOk(nextOk);
    if (i + 1 === tasks.length) setTimeout(() => onDone(pct(nextOk, tasks.length)), 0);
  };
  return (
    <div>
      <div className="srs__meta">
        {i + 1}/{tasks.length}
      </div>
      <div className="row">
        <button className="btn btn--big" type="button" onClick={() => void speak(task.item.term)}>
          🔊 Escuchar
        </button>
        <button className="btn btn--ghost" type="button" onClick={() => void speak(task.item.term, { rate: 0.7 })}>
          🐢 Despacio
        </button>
      </div>
      <div className="pgrid">
        {task.options.map((o) => (
          <button
            key={o.term}
            type="button"
            className={`pcard pcard--big ${picked && o.term === task.item.term ? 'is-correct' : ''} ${picked === o.term && o.term !== task.item.term ? 'is-wrong' : ''}`}
            onClick={() => answer(o.term)}
          >
            <span className="pcard__emoji" aria-hidden="true">
              {o.emoji}
            </span>
            <span>{picked ? `${o.term} · ${o.es}` : o.es}</span>
          </button>
        ))}
      </div>
      {picked && (
        <div className={picked === task.item.term ? 'feedback feedback--ok' : 'feedback feedback--bad'}>
          {picked === task.item.term ? '✅ Correct!' : `❌ It was “${task.item.term}” (${task.item.es}).`}{' '}
          <button className="btn btn--small" type="button" onClick={() => { setI(i + 1); setPicked(null); }}>
            Next ➜
          </button>
        </div>
      )}
    </div>
  );
}

/* ✏️ Completar ---------------------------------------------------------- */
function GapGame({ topic, onDone, onAnswer }: GameProps) {
  const tasks = useMemo(() => buildGaps(topic), [topic]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [ok, setOk] = useState(0);
  const task = tasks[i];
  if (!tasks.length) return <p className="muted">This topic has no sentences to complete.</p>;
  if (!task) return <Finished score={pct(ok, tasks.length)} />;
  const correct = task.item.example.slice(task.before.length, task.item.example.length - task.after.length);
  const answer = (o: string) => {
    if (picked) return;
    setPicked(o);
    onAnswer(task.item, o === correct);
    const nextOk = ok + (o === correct ? 1 : 0);
    setOk(nextOk);
    if (o === correct) void speak(task.item.example);
    if (i + 1 === tasks.length) setTimeout(() => onDone(pct(nextOk, tasks.length)), 0);
  };
  return (
    <div>
      <div className="srs__meta">
        {i + 1}/{tasks.length}
      </div>
      <div className="gap">
        <span className="gap__emoji" aria-hidden="true">
          {task.item.emoji}
        </span>
        <p className="gap__sentence">
          {task.before}
          <span className={`gap__blank ${picked ? (picked === correct ? 'is-correct' : 'is-wrong') : ''}`}>{picked ? correct : '_____'}</span>
          {task.after}
        </p>
        <p className="muted">🇪🇸 {task.item.exampleEs}</p>
      </div>
      <div className="row">
        {task.options.map((o) => (
          <button
            key={o}
            type="button"
            className={`chip ${picked && o === correct ? 'is-correct' : ''} ${picked === o && o !== correct ? 'is-wrong' : ''}`}
            onClick={() => answer(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {picked && (
        <div className={picked === correct ? 'feedback feedback--ok' : 'feedback feedback--bad'}>
          {picked === correct ? '✅ Correct!' : `❌ The answer is “${correct}”.`} <SpeakButton text={task.item.example} small />{' '}
          <button className="btn btn--small" type="button" onClick={() => { setI(i + 1); setPicked(null); }}>
            Next ➜
          </button>
        </div>
      )}
    </div>
  );
}

/* 🔤 Ordenar la frase --------------------------------------------------- */
function OrderGame({ topic, onDone }: GameProps) {
  const tasks = useMemo(() => buildOrder(topic), [topic]);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [ok, setOk] = useState(0);
  const task = tasks[i];
  if (!tasks.length) return <p className="muted">This topic has no sentences to build.</p>;
  if (!task) return <Finished score={pct(ok, tasks.length)} />;
  const built = chosen.map((k) => task.words[k]).join(' ');
  const check = () => {
    const good = built === task.words.join(' ');
    setChecked(good);
    const nextOk = ok + (good ? 1 : 0);
    setOk(nextOk);
    void speak(task.sentence);
    if (i + 1 === tasks.length) setTimeout(() => onDone(pct(nextOk, tasks.length)), 0);
  };
  return (
    <div>
      <div className="srs__meta">
        {i + 1}/{tasks.length}
      </div>
      <p className="muted">🇪🇸 {task.es}</p>
      <div className="order__answer" aria-live="polite">
        {chosen.length === 0 && <span className="muted">Tap the tiles below…</span>}
        {chosen.map((k, pos) => (
          <button
            key={`${k}-${pos}`}
            type="button"
            className="chip chip--placed"
            disabled={checked !== null}
            onClick={() => setChosen(chosen.filter((_, p) => p !== pos))}
          >
            {task.words[k]}
          </button>
        ))}
      </div>
      <div className="row">
        {task.shuffled.map((k) => (
          <button key={k} type="button" className="chip" disabled={chosen.includes(k) || checked !== null} onClick={() => setChosen([...chosen, k])}>
            {task.words[k]}
          </button>
        ))}
      </div>
      {checked === null ? (
        <div className="row">
          <button className="btn" type="button" disabled={chosen.length !== task.words.length} onClick={check}>
            Check
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => setChosen([])}>
            Clear
          </button>
        </div>
      ) : (
        <div className={checked ? 'feedback feedback--ok' : 'feedback feedback--bad'}>
          {checked ? '✅ Perfect!' : `❌ Answer: “${task.sentence}”`}{' '}
          <button className="btn btn--small" type="button" onClick={() => { setI(i + 1); setChosen([]); setChecked(null); }}>
            Next ➜
          </button>
        </div>
      )}
    </div>
  );
}

/* 🗂️ Clasificar ---------------------------------------------------------- */
function SortGame({ topic, onDone, onAnswer }: GameProps) {
  const task = useMemo(() => buildSort(topic), [topic]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [mistakes, setMistakes] = useState(0);
  const [wrongBox, setWrongBox] = useState<string | null>(null);
  const colors = useMemo(() => shuffle(['#fde68a', '#bfdbfe', '#fbcfe8', '#bbf7d0', '#ddd6fe']), []);
  if (!task) return null;
  const finished = Object.keys(placed).length === task.items.length;
  const score = pct(task.items.length, task.items.length + mistakes);
  const drop = (cat: string) => {
    if (!selected) return;
    const item = task.items.find((v) => v.term === selected)!;
    onAnswer(item, item.category === cat);
    if (item.category === cat) {
      const next = { ...placed, [selected]: cat };
      setPlaced(next);
      setSelected(null);
      if (Object.keys(next).length === task.items.length) onDone(pct(task.items.length, task.items.length + mistakes));
    } else {
      setMistakes((m) => m + 1);
      setWrongBox(cat);
      setTimeout(() => setWrongBox(null), 500);
    }
  };
  return (
    <div>
      <div className="row">
        {task.items
          .filter((v) => !placed[v.term])
          .map((v) => (
            <button key={v.term} type="button" className={`chip ${selected === v.term ? 'is-selected' : ''}`} onClick={() => { setSelected(v.term); void speak(v.term); }}>
              {v.emoji} {v.term}
            </button>
          ))}
      </div>
      <div className="sort">
        {task.categories.map((c, ci) => (
          <button
            key={c}
            type="button"
            className={`sort__box ${wrongBox === c ? 'shake' : ''} ${selected ? 'is-ready' : ''}`}
            style={{ background: colors[ci % colors.length] }}
            onClick={() => drop(c)}
          >
            <strong>{c}</strong>
            <span className="sort__items">
              {task.items
                .filter((v) => placed[v.term] === c)
                .map((v) => (
                  <span key={v.term} className="chip chip--static">
                    {v.emoji} {v.term}
                  </span>
                ))}
            </span>
          </button>
        ))}
      </div>
      {finished && <Finished score={score} />}
    </div>
  );
}
