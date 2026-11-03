import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loading } from '../../components/Loading';
import { SpeakButton } from '../../components/SpeakButton';
import { loadLab } from '../../content/labs';
import type { ChatTask, FixTask, FlowTask, ScreenTask, TopicLab } from '../../content/labs/types';
import type { Topic, VocabItem } from '../../content/types';
import { useProgress } from '../../core/progress/ProgressContext';
import { speak } from '../../core/speech/speech';
import { findGap, shuffle } from '../practice/generators';
import type { SectionProps } from '../types';
import {
  buildMemory,
  buildSpeed,
  buildSpell,
  correctedSentence,
  fixLabel,
  fixOptions,
  memoryScore,
  pct,
  shuffleFlow,
  tokens,
  wrongIndex,
} from './logic';
import './lab.css';

type ActivityId = 'chat' | 'fix' | 'flow' | 'screen' | 'memory' | 'spell' | 'speed';
const ACTIVITIES: { id: ActivityId; emoji: string; label: string; help: string; needsLab?: boolean }[] = [
  { id: 'chat', emoji: '💬', label: 'Team chat', help: 'A teammate messages you. Pick the most natural reply.', needsLab: true },
  { id: 'fix', emoji: '🔍', label: 'Spot the mistake', help: 'Tap the wrong word, then choose the fix.', needsLab: true },
  { id: 'flow', emoji: '🧭', label: 'Build the flow', help: 'Tap the steps in the right order to build the diagram.', needsLab: true },
  { id: 'screen', emoji: '🖥️', label: 'Read the screen', help: 'Read the screen like you would at work, then answer.', needsLab: true },
  { id: 'memory', emoji: '🃏', label: 'Memory flip', help: 'Flip two cards: find each picture and its word.' },
  { id: 'spell', emoji: '🐝', label: 'Spelling bee', help: 'Listen, then tap the letters to spell the word.' },
  { id: 'speed', emoji: '⚡', label: 'Speed run', help: '45 seconds! Pick the word that completes each sentence.' },
];

type Props = {
  topic: Topic;
  lab: TopicLab | null;
  onDone: (score: number) => void;
  onAnswer: (item: VocabItem, correct: boolean) => void;
};

export default function LabSection({ level, topic, topicKey, onComplete }: SectionProps) {
  const { recordAnswer } = useProgress();
  const [lab, setLab] = useState<TopicLab | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadLab(level.id, topic.id).then((l) => alive && setLab(l));
    return () => {
      alive = false;
    };
  }, [level.id, topic.id]);

  const hasSpell = useMemo(() => buildSpell(topic).length >= 2, [topic]);
  const acts = ACTIVITIES.filter((a) => (!a.needsLab || lab) && (a.id !== 'spell' || hasSpell));
  const [act, setAct] = useState<ActivityId>('chat');
  const [round, setRound] = useState(0);
  const [scores, setScores] = useState<Partial<Record<ActivityId, number>>>({});

  if (lab === undefined) return <Loading />;
  const current = acts.find((a) => a.id === act) ?? acts[0]!;

  const done = (score: number) => {
    const next = { ...scores, [current.id]: Math.max(score, scores[current.id] ?? 0) };
    setScores(next);
    const vals = acts.map((a) => next[a.id]);
    if (vals.every((v) => v !== undefined)) onComplete(Math.round(vals.reduce((s, v) => s! + v!, 0)! / vals.length));
  };
  const onAnswer = (item: VocabItem, correct: boolean) => recordAnswer(`${topicKey}/${item.term}`, correct);
  const props: Props = { topic, lab, onDone: done, onAnswer };
  const k = `${current.id}${round}`;

  return (
    <div className="lab">
      <div className="card">
        <h3>🧪 Hands-on Lab</h3>
        <p className="muted">
          Real-life tech situations: chats with your team, screens, diagrams and quick games. Finish every activity to complete
          the section. Questions change each time you play.
        </p>
        <div className="lab__acts" role="tablist">
          {acts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={current.id === a.id}
              className={`lab__act ${current.id === a.id ? 'is-active' : ''}`}
              onClick={() => {
                setAct(a.id);
                setRound((r) => r + 1);
              }}
            >
              <span className="lab__act-emoji" aria-hidden="true">
                {a.emoji}
              </span>
              <span>{a.label}</span>
              <small>{scores[a.id] !== undefined ? `⭐ ${scores[a.id]}%` : '—'}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <p className="lab__help">
          {current.emoji} {current.help}
        </p>
        {current.id === 'chat' && lab && <ChatGame key={k} {...props} chats={lab.chats} />}
        {current.id === 'fix' && lab && <FixGame key={k} {...props} fixes={lab.fixes} />}
        {current.id === 'flow' && lab && <FlowGame key={k} {...props} flow={lab.flow} />}
        {current.id === 'screen' && lab && <ScreenGame key={k} {...props} screen={lab.screen} />}
        {current.id === 'memory' && <MemoryGame key={k} {...props} />}
        {current.id === 'spell' && <SpellGame key={k} {...props} />}
        {current.id === 'speed' && <SpeedGame key={k} {...props} />}
        <div className="row">
          <button className="btn btn--ghost btn--small" type="button" onClick={() => setRound((r) => r + 1)}>
            🔀 Play again
          </button>
        </div>
      </div>
    </div>
  );
}

function Finished({ score }: { score: number }) {
  const stars = score >= 90 ? '⭐⭐⭐' : score >= 60 ? '⭐⭐' : '⭐';
  return (
    <div className="lab__finished" role="status">
      <p className="big">{stars}</p>
      <p>
        <strong>{score}%</strong> {score >= 90 ? 'Awesome!' : score >= 60 ? 'Nice work!' : 'Keep going, you’re getting there!'}
      </p>
    </div>
  );
}

function Counter({ i, n }: { i: number; n: number }) {
  return (
    <div className="lab__progress" aria-label={`${i + 1} of ${n}`}>
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={k < i ? 'is-done' : k === i ? 'is-now' : ''} />
      ))}
    </div>
  );
}

function Next({ ok, text, onNext, children }: { ok: boolean; text: string; onNext: () => void; children?: ReactNode }) {
  return (
    <div className={ok ? 'feedback feedback--ok' : 'feedback feedback--bad'} aria-live="polite">
      <p>
        {ok ? '✅ ' : '❌ '}
        {text}
      </p>
      {children}
      <button className="btn btn--small" type="button" onClick={onNext}>
        Next ➜
      </button>
    </div>
  );
}

/* 💬 Team chat --------------------------------------------------------- */
function ChatGame({ chats, onDone }: Props & { chats: ChatTask[] }) {
  const tasks = useMemo(() => shuffle(chats).map((c) => ({ ...c, replies: shuffle(c.replies) })), [chats]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ok, setOk] = useState(0);
  const task = tasks[i];
  useEffect(() => {
    if (task) void speak(task.message, { speaker: 1 });
  }, [task]);
  if (!task) return <Finished score={pct(ok, tasks.length)} />;
  const reply = picked !== null ? task.replies[picked]! : null;
  const answer = (r: number) => {
    if (picked !== null) return;
    setPicked(r);
    const good = task.replies[r]!.ok;
    const nextOk = ok + (good ? 1 : 0);
    setOk(nextOk);
    if (good) void speak(task.replies[r]!.text);
    if (i + 1 === tasks.length) setTimeout(() => onDone(pct(nextOk, tasks.length)), 0);
  };
  const best = task.replies.find((r) => r.ok)!;
  return (
    <div>
      <Counter i={i} n={tasks.length} />
      <div className="chatwin">
        <div className="chatwin__bar">
          <span className="chatwin__dot" />
          <span className="chatwin__dot" />
          <span className="chatwin__dot" />
          <span className="chatwin__title"># team-chat</span>
        </div>
        <div className="chatwin__body">
          <div className="bubble bubble--in">
            <span className="bubble__avatar" aria-hidden="true">
              {task.avatar}
            </span>
            <div>
              <strong className="bubble__name">{task.from}</strong>
              <p>
                {task.message} <SpeakButton text={task.message} speaker={1} small label="Listen" />
              </p>
            </div>
          </div>
          {reply && (
            <div className={`bubble bubble--out ${reply.ok ? '' : 'is-wrong'}`}>
              <div>
                <strong className="bubble__name">You</strong>
                <p>{reply.text}</p>
              </div>
              <span className="bubble__avatar" aria-hidden="true">
                🙂
              </span>
            </div>
          )}
          {reply && !reply.ok && (
            <div className="bubble bubble--out bubble--hint">
              <div>
                <strong className="bubble__name">Better reply</strong>
                <p>
                  {best.text} <SpeakButton text={best.text} small label="Listen" />
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      {picked === null ? (
        <div className="lab__options">
          {task.replies.map((r, idx) => (
            <button key={r.text} type="button" className="lab__option" onClick={() => answer(idx)}>
              {r.text}
            </button>
          ))}
        </div>
      ) : (
        <Next ok={reply!.ok} text={reply!.why} onNext={() => { setI(i + 1); setPicked(null); }} />
      )}
    </div>
  );
}

/* 🔍 Spot the mistake -------------------------------------------------- */
function FixGame({ fixes, onDone }: Props & { fixes: FixTask[] }) {
  const tasks = useMemo(() => shuffle(fixes).map((f) => ({ f, options: fixOptions(f) })), [fixes]);
  const [i, setI] = useState(0);
  const [tapped, setTapped] = useState<number | null>(null);
  const [miss, setMiss] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [ok, setOk] = useState(0);
  const t = tasks[i];
  if (!t) return <Finished score={pct(ok, tasks.length)} />;
  const words = tokens(t.f.sentence);
  const wi = wrongIndex(t.f);
  const fixed = correctedSentence(t.f);
  const tap = (k: number) => {
    if (tapped !== null) return;
    if (k === wi) setTapped(k);
    else {
      setMistakes((m) => m + 1);
      setMiss(k);
      setTimeout(() => setMiss(null), 500);
    }
  };
  const choose = (o: string) => {
    if (picked !== null) return;
    setPicked(o);
    // Full point if found on the first tap; half a point after wrong taps.
    const nextOk = ok + (o === t.f.right ? (mistakes === 0 ? 1 : 0.5) : 0);
    setOk(nextOk);
    if (o === t.f.right) void speak(fixed);
    if (i + 1 === tasks.length) setTimeout(() => onDone(pct(nextOk, tasks.length)), 0);
  };
  return (
    <div>
      <Counter i={i} n={tasks.length} />
      <p className="fix__sentence">
        {words.map((w, k) => (
          <button
            key={k}
            type="button"
            className={`fix__word ${k === tapped ? 'is-found' : ''} ${k === miss ? 'is-miss shake' : ''}`}
            onClick={() => tap(k)}
            disabled={tapped !== null}
          >
            {w}
          </button>
        ))}
      </p>
      {tapped !== null && picked === null && (
        <>
          <p className="muted">Good catch! Now choose the fix for “{t.f.wrong}”:</p>
          <div className="row">
            {t.options.map((o) => (
              <button key={o || '∅'} type="button" className="chip" onClick={() => choose(o)}>
                {fixLabel(o)}
              </button>
            ))}
          </div>
        </>
      )}
      {picked !== null && (
        <Next ok={picked === t.f.right} text={t.f.why} onNext={() => { setI(i + 1); setTapped(null); setPicked(null); setMistakes(0); }}>
          <p className="fix__fixed">
            ✔ {fixed} <SpeakButton text={fixed} small label="Listen" />
          </p>
        </Next>
      )}
    </div>
  );
}

/* 🧭 Build the flow ---------------------------------------------------- */
function FlowGame({ flow, onDone }: Props & { flow: FlowTask }) {
  const order = useMemo(() => shuffleFlow(flow), [flow]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const finished = placed.length === flow.steps.length;
  const tap = (k: number) => {
    if (k === placed.length) {
      const next = [...placed, k];
      setPlaced(next);
      void speak(flow.steps[k]!.text);
      if (next.length === flow.steps.length) onDone(pct(flow.steps.length, flow.steps.length + mistakes));
    } else {
      setMistakes((m) => m + 1);
      setWrong(k);
      setTimeout(() => setWrong(null), 500);
    }
  };
  return (
    <div>
      <h4 className="flow__title">{flow.title}</h4>
      <ol className="flow__diagram" aria-label="Your diagram">
        {flow.steps.map((s, k) => (
          <li key={k} className={`flow__node ${k < placed.length ? 'is-placed' : ''}`}>
            <span className="flow__num">{k + 1}</span>
            {k < placed.length ? (
              <>
                <span className="flow__emoji" aria-hidden="true">
                  {s.emoji}
                </span>
                <span>{s.text}</span>
              </>
            ) : (
              <span className="muted">?</span>
            )}
          </li>
        ))}
      </ol>
      {!finished && (
        <div className="flow__pool">
          {order
            .filter((k) => !placed.includes(k))
            .map((k) => (
              <button key={k} type="button" className={`chip ${wrong === k ? 'is-wrong shake' : ''}`} onClick={() => tap(k)}>
                {flow.steps[k]!.emoji} {flow.steps[k]!.text}
              </button>
            ))}
        </div>
      )}
      {finished && <Finished score={pct(flow.steps.length, flow.steps.length + mistakes)} />}
    </div>
  );
}

/* 🖥️ Read the screen --------------------------------------------------- */
function ScreenGame({ screen, onDone }: Props & { screen: ScreenTask }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ok, setOk] = useState(0);
  const qn = screen.questions[i];
  const answer = (o: number) => {
    if (picked !== null || !qn) return;
    setPicked(o);
    const nextOk = ok + (o === qn.answer ? 1 : 0);
    setOk(nextOk);
    if (i + 1 === screen.questions.length) setTimeout(() => onDone(pct(nextOk, screen.questions.length)), 0);
  };
  const icon = { terminal: '⌨️', dashboard: '📊', email: '✉️', chat: '💬' }[screen.kind];
  return (
    <div>
      <figure className={`screen screen--${screen.kind}`}>
        <figcaption className="screen__bar">
          <span className="chatwin__dot" />
          <span className="chatwin__dot" />
          <span className="chatwin__dot" />
          <span>
            {icon} {screen.title}
          </span>
        </figcaption>
        <div className="screen__body">
          {screen.lines.map((l, k) => (
            <div key={k} className="screen__line">
              {l}
            </div>
          ))}
        </div>
      </figure>
      {qn ? (
        <div>
          <Counter i={i} n={screen.questions.length} />
          <p className="lab__q">{qn.prompt}</p>
          <div className="lab__options">
            {qn.options.map((o, k) => (
              <button
                key={o}
                type="button"
                className={`lab__option ${picked !== null && k === qn.answer ? 'is-correct' : ''} ${picked === k && k !== qn.answer ? 'is-wrong' : ''}`}
                onClick={() => answer(k)}
              >
                {o}
              </button>
            ))}
          </div>
          {picked !== null && (
            <Next
              ok={picked === qn.answer}
              text={qn.explanation ?? (picked === qn.answer ? 'Correct!' : `The answer is “${qn.options[qn.answer]}”.`)}
              onNext={() => { setI(i + 1); setPicked(null); }}
            />
          )}
        </div>
      ) : (
        <Finished score={pct(ok, screen.questions.length)} />
      )}
    </div>
  );
}

/* 🃏 Memory flip ------------------------------------------------------- */
function MemoryGame({ topic, onDone, onAnswer }: Props) {
  const { items, cards } = useMemo(() => buildMemory(topic), [topic]);
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [tries, setTries] = useState(0);
  const busy = useRef(false);
  const finished = found.length === items.length;
  const flip = (id: string) => {
    if (busy.current || open.includes(id)) return;
    const card = cards.find((c) => c.id === id)!;
    if (found.includes(card.pair)) return;
    if (card.kind === 'term') void speak(card.face);
    const next = [...open, id];
    setOpen(next);
    if (next.length < 2) return;
    setTries((t) => t + 1);
    const [a, b] = next.map((x) => cards.find((c) => c.id === x)!);
    const item = items.find((v) => v.term === a!.pair)!;
    if (a!.pair === b!.pair) {
      onAnswer(item, true);
      const f = [...found, a!.pair];
      setFound(f);
      setOpen([]);
      if (f.length === items.length) onDone(memoryScore(items.length, tries + 1));
    } else {
      busy.current = true;
      setTimeout(() => {
        busy.current = false;
        setOpen([]);
      }, 900);
    }
  };
  return (
    <div>
      <p className="muted">
        Pairs found: {found.length}/{items.length} · Tries: {tries}
      </p>
      <div className="memory">
        {cards.map((c) => {
          const up = open.includes(c.id) || found.includes(c.pair);
          return (
            <button
              key={c.id}
              type="button"
              className={`memory__card ${up ? 'is-up' : ''} ${found.includes(c.pair) ? 'is-found' : ''}`}
              onClick={() => flip(c.id)}
              aria-label={up ? c.face : 'Hidden card'}
            >
              <span className={c.kind === 'emoji' ? 'memory__emoji' : 'memory__term'}>{up ? c.face : '?'}</span>
            </button>
          );
        })}
      </div>
      {finished && <Finished score={memoryScore(items.length, tries)} />}
    </div>
  );
}

/* 🐝 Spelling bee ------------------------------------------------------ */
const maskTerm = (item: VocabItem) => {
  const g = findGap(item.example, item.term);
  return g ? `${g.before}_____${g.after}` : null;
};

function SpellGame({ topic, onDone, onAnswer }: Props) {
  const tasks = useMemo(() => buildSpell(topic), [topic]);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const [ok, setOk] = useState(0);
  const t = tasks[i];
  useEffect(() => {
    if (t) void speak(t.item.term);
  }, [t]);
  if (!t) return <Finished score={pct(ok, tasks.length)} />;
  const built = chosen.map((k) => t.letters[k]).join('');
  const hint = maskTerm(t.item);
  const add = (k: number) => {
    if (result !== null) return;
    const next = [...chosen, k];
    setChosen(next);
    if (next.length === t.letters.length) {
      const good = next.map((x) => t.letters[x]).join('') === t.letters.join('');
      setResult(good);
      onAnswer(t.item, good);
      const nextOk = ok + (good ? 1 : 0);
      setOk(nextOk);
      if (i + 1 === tasks.length) setTimeout(() => onDone(pct(nextOk, tasks.length)), 0);
    }
  };
  return (
    <div>
      <Counter i={i} n={tasks.length} />
      <div className="spell__clue">
        <span className="spell__emoji" aria-hidden="true">
          {t.item.emoji}
        </span>
        <div className="row">
          <button className="btn" type="button" onClick={() => void speak(t.item.term)}>
            🔊 Listen
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => void speak(t.item.term, { rate: 0.7 })}>
            🐢 Slow
          </button>
        </div>
        {hint && <p className="muted">“{hint}”</p>}
      </div>
      <div className="spell__slots" aria-live="polite">
        {t.letters.map((_, k) => (
          <span key={k} className={`spell__slot ${result === true ? 'is-correct' : result === false ? 'is-wrong' : ''}`}>
            {built[k] ?? ''}
          </span>
        ))}
      </div>
      {result === null ? (
        <>
          <div className="row spell__tiles">
            {t.shuffled.map((k) => (
              <button key={k} type="button" className="spell__tile" disabled={chosen.includes(k)} onClick={() => add(k)}>
                {t.letters[k]}
              </button>
            ))}
          </div>
          <button className="btn btn--ghost btn--small" type="button" onClick={() => setChosen(chosen.slice(0, -1))} disabled={!chosen.length}>
            ⌫ Undo
          </button>
        </>
      ) : (
        <Next ok={result} text={result ? `Yes! “${t.item.term}”.` : `It’s spelled “${t.item.term}”.`} onNext={() => { setI(i + 1); setChosen([]); setResult(null); }} />
      )}
    </div>
  );
}

/* ⚡ Speed run --------------------------------------------------------- */
const SPEED_SECONDS = 45;

function SpeedGame({ topic, onDone, onAnswer }: Props) {
  const tasks = useMemo(() => buildSpeed(topic, 30), [topic]);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(SPEED_SECONDS);
  const [i, setI] = useState(0);
  const [ok, setOk] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const over = started && (left <= 0 || i >= tasks.length);
  const reported = useRef(false);

  useEffect(() => {
    if (!started || over) return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [started, over]);

  // Score: 10 correct answers (or all tasks, if fewer) = 100%.
  const target = Math.min(10, tasks.length);
  const score = Math.min(100, pct(ok, target));
  useEffect(() => {
    if (over && !reported.current) {
      reported.current = true;
      onDone(score);
    }
  }, [over, score, onDone]);

  if (!started)
    return (
      <div className="speed__start">
        <p>
          Get <strong>{target}</strong> right in {SPEED_SECONDS} seconds for 100%. Wrong answers don’t lose points, but they
          cost time!
        </p>
        <button className="btn btn--big" type="button" onClick={() => setStarted(true)}>
          ⚡ Start
        </button>
      </div>
    );
  if (over)
    return (
      <div>
        <p className="speed__result">
          ⏱️ {ok} correct answer{ok === 1 ? '' : 's'}
        </p>
        <Finished score={score} />
      </div>
    );

  const t = tasks[i]!;
  const pick = (o: string) => {
    const good = o === t.answer;
    onAnswer(t.item, good);
    if (good) setOk((n) => n + 1);
    setFlash(good ? 'ok' : 'bad');
    setTimeout(() => setFlash(null), 250);
    setI(i + 1);
  };
  return (
    <div className={`speed ${flash ? `speed--${flash}` : ''}`}>
      <div className="speed__hud">
        <span className="speed__timer" style={{ ['--left' as string]: `${(left / SPEED_SECONDS) * 100}%` }}>
          ⏱️ {left}s
        </span>
        <span>✅ {ok}</span>
      </div>
      <div className="speed__card">
        <span className="speed__emoji" aria-hidden="true">
          {t.item.emoji}
        </span>
        {t.before !== null ? (
          <p className="speed__sentence">
            {t.before}
            <span className="gap__blank">_____</span>
            {t.after}
          </p>
        ) : (
          <p className="speed__sentence">Which word matches the picture?</p>
        )}
      </div>
      <div className="speed__options">
        {t.options.map((o) => (
          <button key={o} type="button" className="btn btn--big" onClick={() => pick(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
