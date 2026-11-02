import { useMemo, useState } from 'react';
import { SpeakButton } from '../../components/SpeakButton';
import type { Topic } from '../../content/types';
import { speak } from '../../core/speech/speech';
import type { SectionProps } from '../types';
import { buildGaps, buildListen, buildMatch, buildOrder, buildSort, shuffle } from './generators';

type GameId = 'emparejar' | 'ordenar' | 'completar' | 'escuchar' | 'clasificar';
const GAMES: { id: GameId; emoji: string; label: string; help: string }[] = [
  { id: 'emparejar', emoji: '🧩', label: 'Emparejar', help: 'Toca una tarjeta y luego su palabra en inglés.' },
  { id: 'escuchar', emoji: '👂', label: 'Escucha y elige', help: 'Escucha la palabra y toca la imagen correcta.' },
  { id: 'completar', emoji: '✏️', label: 'Completa', help: 'Elige la palabra que falta en la frase.' },
  { id: 'ordenar', emoji: '🔤', label: 'Ordena la frase', help: 'Toca las fichas en orden para construir la frase.' },
  { id: 'clasificar', emoji: '🗂️', label: 'Clasifica', help: 'Toca cada palabra y luego la caja a la que pertenece.' },
];

type GameProps = { topic: Topic; onDone: (score: number) => void };

export default function PracticeSection({ topic, onComplete }: SectionProps) {
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

  const props: GameProps = { topic, onDone: done };
  return (
    <div className="practice">
      <div className="card">
        <h3>🎮 Práctica visual</h3>
        <p className="muted">
          Cinco mini‑juegos con el vocabulario y las frases de este tema. Completa todos para terminar la sección. Cada vez que
          repites, las preguntas cambian.
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
        <strong>{score}%</strong> {score >= 90 ? '¡Excelente!' : score >= 60 ? '¡Bien hecho!' : 'Sigue practicando, ¡vas bien!'}
      </p>
      {onAgain && (
        <button className="btn" type="button" onClick={onAgain}>
          Otra vez
        </button>
      )}
    </div>
  );
}

const pct = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0);

/* 🧩 Emparejar -------------------------------------------------------- */
function MatchGame({ topic, onDone }: GameProps) {
  const data = useMemo(() => buildMatch(topic), [topic]);
  const [selected, setSelected] = useState<string | null>(null); // es seleccionado (término correcto)
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const finished = matched.length === data.items.length;

  const tryTerm = (term: string) => {
    if (!selected || matched.includes(term)) return;
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
function ListenGame({ topic, onDone }: GameProps) {
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
          {picked === task.item.term ? '✅ ¡Correcto!' : `❌ Era “${task.item.term}” (${task.item.es}).`}{' '}
          <button className="btn btn--small" type="button" onClick={() => { setI(i + 1); setPicked(null); }}>
            Siguiente ➜
          </button>
        </div>
      )}
    </div>
  );
}

/* ✏️ Completar ---------------------------------------------------------- */
function GapGame({ topic, onDone }: GameProps) {
  const tasks = useMemo(() => buildGaps(topic), [topic]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [ok, setOk] = useState(0);
  const task = tasks[i];
  if (!tasks.length) return <p className="muted">Este tema no tiene frases para completar.</p>;
  if (!task) return <Finished score={pct(ok, tasks.length)} />;
  const correct = task.item.example.slice(task.before.length, task.item.example.length - task.after.length);
  const answer = (o: string) => {
    if (picked) return;
    setPicked(o);
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
          {picked === correct ? '✅ ¡Correcto!' : `❌ La respuesta es “${correct}”.`} <SpeakButton text={task.item.example} small />{' '}
          <button className="btn btn--small" type="button" onClick={() => { setI(i + 1); setPicked(null); }}>
            Siguiente ➜
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
  if (!tasks.length) return <p className="muted">Este tema no tiene frases para ordenar.</p>;
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
        {chosen.length === 0 && <span className="muted">Toca las fichas de abajo…</span>}
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
            Comprobar
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => setChosen([])}>
            Borrar
          </button>
        </div>
      ) : (
        <div className={checked ? 'feedback feedback--ok' : 'feedback feedback--bad'}>
          {checked ? '✅ ¡Perfecto!' : `❌ Correcto: “${task.sentence}”`}{' '}
          <button className="btn btn--small" type="button" onClick={() => { setI(i + 1); setChosen([]); setChecked(null); }}>
            Siguiente ➜
          </button>
        </div>
      )}
    </div>
  );
}

/* 🗂️ Clasificar ---------------------------------------------------------- */
function SortGame({ topic, onDone }: GameProps) {
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
