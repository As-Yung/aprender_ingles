import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LEVELS, loadLevel } from '../../content';
import type { LevelId } from '../../content/types';
import { useProgress } from '../../core/progress/ProgressContext';
import { speak, stopSpeaking } from '../../core/speech/speech';
import { FiltroTiza } from '../vocab-game/drawings';
import { confeti, sonar } from '../vocab-game/fx';
import type { PalabraJuego } from '../vocab-game/logic';
import { useServerRun } from './api';
import { buildCtx, findGame, pointsFor, rulesFor, type ArcadeQuestion, type Ctx } from './engine';
import { Leaderboard } from './Leaderboard';
import { QuestionView } from './QuestionView';
import { Es } from '../../components/Es';
import { readArcadePrefs, writeArcadePrefs } from './prefs';
import '../vocab-game/vocab-game.css';
import './arcade.css';

interface Stats {
  q: number;
  score: number;
  lives: number;
  streak: number;
  best: number;
  correct: number;
}

const PRAISE = ['Nice!', 'Great job!', 'Correct!', 'Awesome!', 'Spot on!', 'You got it!'];

export default function PlayPage() {
  const { gameId } = useParams();
  const game = findGame(gameId);
  const { reviewWord } = useProgress();
  const server = useServerRun();
  const [prefs, setPrefs] = useState(readArcadePrefs);
  const level = prefs.level;
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [phase, setPhase] = useState<'intro' | 'play' | 'end'>('intro');
  const [seed, setSeed] = useState(0);
  const [stats, setStats] = useState<Stats>({ q: 0, score: 0, lives: 3, streak: 0, best: 0, correct: 0 });
  const [question, setQuestion] = useState<ArcadeQuestion | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [missed, setMissed] = useState<PalabraJuego[]>([]);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [boardKey, setBoardKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [qn, setQn] = useState(0);
  const lastAt = useRef(Date.now());
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sound = prefs.sound;

  useEffect(() => {
    let off = false;
    setCtx(null);
    void loadLevel(level).then((l) => !off && setCtx(buildCtx(l)));
    return () => {
      off = true;
    };
  }, [level]);

  useEffect(() => () => stopSpeaking(), []);

  const end = useCallback(async () => {
    if (phaseRef.current === 'end') return;
    setPhase('end');
    setDeadline(null);
    const r = await server.finish();
    if (r) setStats((s) => ({ ...s, score: r.score }));
    setBoardKey((k) => k + 1);
    if (statsRef.current.correct >= statsRef.current.q * 0.8 && statsRef.current.q > 0) {
      sonar('victoria', sound);
      if (rootRef.current) confeti(confettiRef.current, rootRef.current, 120, 2500);
    } else sonar('nivel', sound);
  }, [server, sound]);

  // Countdown for timed games.
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) void end();
    }, 250);
    return () => clearInterval(t);
  }, [deadline, end]);

  if (!game) {
    return (
      <div className="vbg">
        <h1 className="titulo">Game not found</h1>
        <Link to="/arcade" className="boton arc-link">
          Back to the arcade
        </Link>
      </div>
    );
  }
  const rules = rulesFor(game.id);
  const available = !ctx || !game.available || game.available(ctx);

  async function start() {
    if (!ctx || starting) return;
    setStarting(true);
    const run = await server.start(game!.id, level);
    const s = run?.seed ?? Math.floor(Math.random() * 2147483647);
    setSeed(s);
    setStats({ q: 0, score: 0, lives: rules.lives, streak: 0, best: 0, correct: 0 });
    setMissed([]);
    setFeedback(null);
    setQuestion(game!.generate(ctx, s, 0));
    setQn((n) => n + 1);
    lastAt.current = Date.now();
    setDeadline(game!.timeLimit ? Date.now() + game!.timeLimit * 1000 : null);
    setPhase('play');
    setStarting(false);
    sonar('nivel', sound);
  }

  function onAnswer(ok: boolean) {
    if (!ctx || !question) return;
    const s = statsRef.current;
    const secs = (Date.now() - lastAt.current) / 1000;
    const streak = ok ? s.streak + 1 : 0;
    const next: Stats = {
      q: s.q + 1,
      score: s.score + (ok ? pointsFor(streak, secs) : 0),
      lives: ok ? s.lives : s.lives - 1,
      streak,
      best: Math.max(s.best, streak),
      correct: s.correct + (ok ? 1 : 0),
    };
    setStats(next);
    sonar(ok ? 'acierto' : 'error', sound);
    setFeedback({ ok, text: ok ? `${PRAISE[next.q % PRAISE.length]} ${question.reveal}` : question.reveal });
    if (question.word) {
      reviewWord(`${level}/${question.word.topicId}/${question.word.item.term}`, ok);
      if (!ok) setMissed((m) => (m.some((w) => w.item.term === question.word!.item.term) ? m : [...m, question.word!]));
    }
    if (prefs.voice && question.say) setTimeout(() => void speak(question.say!), 200);
    void server.answer(s.q, ok).then((r) => {
      if (r) setStats((cur) => ({ ...cur, score: r.score }));
      if (r?.status === 'finished') void end();
    });
    const over = next.lives <= 0 || next.q >= rules.maxQuestions;
    const timed = !!game!.timeLimit;
    setTimeout(
      () => {
        if (phaseRef.current !== 'play') return;
        if (over) {
          void end();
          return;
        }
        setFeedback(null);
        setQuestion(game!.generate(ctx, seed, next.q));
        setQn((n) => n + 1);
        lastAt.current = Date.now();
      },
      ok ? (timed ? 350 : 900) : timed ? 900 : question.kind === 'choice' ? 1800 : 2400,
    );
  }

  const left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  return (
    <div className="vbg arc" ref={rootRef}>
      <FiltroTiza />
      <header className="cabecera">
        <h1 className="titulo">
          <span aria-hidden="true">{game.emoji}</span> {game.name}
        </h1>
        <div className="botones-cabecera">
          <button
            type="button"
            className="boton-sonido"
            aria-pressed={prefs.sound}
            onClick={() => setPrefs(writeArcadePrefs({ sound: !prefs.sound }))}
          >
            Sound: {prefs.sound ? 'on' : 'off'}
          </button>
          <button type="button" className="boton-sonido" aria-pressed={prefs.voice} onClick={() => setPrefs(writeArcadePrefs({ voice: !prefs.voice }))}>
            Voice: {prefs.voice ? 'on' : 'off'}
          </button>
          <Link to="/arcade" className="boton-sonido arc-link">
            ← Arcade
          </Link>
        </div>
      </header>

      {phase === 'intro' && (
        <main className="pantalla">
          <p className="lema">{game.blurb}</p>
          <ul className="arc-rules">
            <li>
              {game.timeLimit ? `⏱️ ${game.timeLimit} seconds` : `❓ Up to ${rules.maxQuestions} questions`} ·{' '}
              {rules.lives > 99 ? 'no lives to lose' : `❤️ ${rules.lives} lives`}
            </li>
            <li>⭐ 100 points per right answer + streak bonus + speed bonus</li>
            <li>⚔️ You can also play it against someone in Duels</li>
          </ul>
          <section className="bloque" aria-labelledby="arc-level">
            <h2 id="arc-level" className="subtitulo">
              Level
            </h2>
            <div className="dificultades niveles" role="radiogroup" aria-labelledby="arc-level">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={level === l.id}
                  className="dificultad"
                  onClick={() => setPrefs(writeArcadePrefs({ level: l.id }))}
                >
                  <b>{l.name}</b>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </section>
          {!available && <p className="mensaje">This game needs more content than this level has. Try another level.</p>}
          <div>
            <button type="button" className="boton arc-start" disabled={!ctx || !available || starting} onClick={() => void start()}>
              {ctx ? (starting ? 'Starting…' : '▶ Start') : 'Loading…'}
            </button>
          </div>
          <section className="bloque">
            <h2 className="subtitulo">🏆 Leaderboard</h2>
            <Leaderboard game={game.id} level={level} onLevel={(l: LevelId) => setPrefs(writeArcadePrefs({ level: l }))} refreshKey={boardKey} />
          </section>
        </main>
      )}

      {phase === 'play' && question && (
        <main className="pantalla">
          <div className="arc-hud" aria-live="polite">
            <span title="Score">⭐ {stats.score.toLocaleString('en')}</span>
            <span title="Streak">🔥 {stats.streak}</span>
            {rules.lives <= 99 && <span title="Lives">{'❤️'.repeat(Math.max(0, stats.lives))}{'🖤'.repeat(Math.max(0, rules.lives - stats.lives))}</span>}
            {left !== null ? (
              <span className={left <= 10 ? 'arc-hurry' : ''}>⏱️ {left}s</span>
            ) : (
              <span>
                {Math.min(stats.q + 1, rules.maxQuestions)}/{rules.maxQuestions}
              </span>
            )}
          </div>
          {left !== null && (
            <div className="barra barra-exp" aria-hidden="true">
              <span style={{ width: `${(left / game.timeLimit!) * 100}%` }} />
            </div>
          )}
          <section className="pregunta" aria-label="Question">
            <div className="pregunta-cabecera">
              <p className="tipo-pregunta">
                {question.prompt.ask} · {level.toUpperCase()}
              </p>
            </div>
            <QuestionView key={qn} q={question} onAnswer={(ok) => onAnswer(ok)} disabled={!!feedback} />
            <p className={`respuesta-mensaje ${feedback ? (feedback.ok ? 'bien' : 'mal') : ''}`} role="status" lang="en">
              {feedback?.text}
            </p>
          </section>
          <div className="pie-batalla">
            <span className="nota">{server.online ? 'Your score is saved on the leaderboard.' : 'Offline mode: scores are not saved.'}</span>
            <button type="button" className="boton boton-secundario" onClick={() => void end()}>
              Finish
            </button>
          </div>
        </main>
      )}

      {phase === 'end' && (
        <main className="pantalla">
          <section className="ventana ventana-fin arc-end">
            <h2 className="subtitulo">{stats.correct >= stats.q * 0.8 && stats.q > 0 ? '🏆 Excellent!' : stats.correct >= stats.q * 0.5 ? '👏 Well done!' : '💪 Keep practicing!'}</h2>
            <dl className="resumen">
              <div>
                <dt>Score</dt>
                <dd>{stats.score.toLocaleString('en')}</dd>
              </div>
              <div>
                <dt>Right answers</dt>
                <dd>
                  {stats.correct}/{stats.q}
                </dd>
              </div>
              <div>
                <dt>Best streak</dt>
                <dd>{stats.best}</dd>
              </div>
            </dl>
            {missed.length > 0 && (
              <>
                <p className="etiqueta">Words to review</p>
                <ul className="repaso">
                  {missed.map((w) => (
                    <li key={w.item.term}>
                      <button type="button" className="boton-sonido" onClick={() => void speak(w.item.term)} aria-label={`Listen: ${w.item.term}`}>
                        🔊
                      </button>
                      <span aria-hidden="true">{w.item.emoji}</span>
                      <b lang="en">{w.item.term}</b>
                      <Es text={w.item.es} level={level} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="acciones">
              <Link to="/arcade" className="boton boton-secundario arc-link">
                All games
              </Link>
              <button type="button" className="boton" onClick={() => void start()}>
                Play again
              </button>
            </div>
          </section>
          <section className="bloque">
            <h2 className="subtitulo">🏆 Leaderboard</h2>
            <Leaderboard game={game.id} level={level} refreshKey={boardKey} />
          </section>
        </main>
      )}
      <canvas className="confeti" ref={confettiRef} aria-hidden="true" />
    </div>
  );
}
