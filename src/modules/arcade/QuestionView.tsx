import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { speak } from '../../core/speech/speech';
import { barajar } from '../vocab-game/logic';
import { checkTyped, type ArcadeQuestion, type Prompt } from './engine';

/**
 * Draws any arcade question and reports the result once with onAnswer().
 * Mount it with a new `key` for every question.
 */
export function QuestionView({
  q,
  onAnswer,
  disabled,
  autoListen = true,
}: {
  q: ArcadeQuestion;
  onAnswer: (correct: boolean, given: string) => void;
  disabled?: boolean;
  autoListen?: boolean;
}) {
  const [done, setDone] = useState(false);
  const finish = (ok: boolean, given: string) => {
    if (done) return;
    setDone(true);
    onAnswer(ok, given);
  };
  useEffect(() => {
    if (autoListen && q.prompt.listen) void speak(q.prompt.listen);
  }, [q, autoListen]);

  return (
    <div className="arc-q">
      <PromptView p={q.prompt} revealed={done} q={q} />
      {q.kind === 'choice' && <Choice q={q} done={done || !!disabled} onPick={(o) => finish(o === q.answer, o)} />}
      {q.kind === 'type' && <Typing q={q} done={done || !!disabled} onSubmit={(t) => finish(checkTyped(q, t), t)} />}
      {q.kind === 'tiles' && <Tiles q={q} done={done || !!disabled} onSubmit={(ok, given) => finish(ok, given)} />}
      {q.kind === 'hangman' && <Hangman q={q} done={done || !!disabled} onEnd={(ok) => finish(ok, ok ? q.answer : '')} />}
      {q.kind === 'memory' && <Memory q={q} done={done || !!disabled} onEnd={(ok) => finish(ok, '')} />}
    </div>
  );
}

function ListenButton({ text, big }: { text: string; big?: boolean }) {
  return (
    <button type="button" className={`boton-oir ${big ? 'grande' : ''}`} onClick={() => void speak(text)} aria-label={`Listen: ${text}`}>
      🔊
    </button>
  );
}

function PromptView({ p, revealed, q }: { p: Prompt; revealed: boolean; q: ArcadeQuestion }) {
  const answerText = q.kind === 'choice' ? q.answer : q.kind === 'tiles' ? q.answer.join(q.joiner) : 'answer' in q ? q.answer : '';
  return (
    <div className="arc-prompt">
      {p.emoji && !p.text && !p.gap && (
        <p className="arc-emoji" aria-hidden="true">
          {p.emoji}
        </p>
      )}
      {p.listen && p.hidden && (
        <div className="palabra nueva">
          <ListenButton text={p.listen} big />
        </div>
      )}
      {p.listen && p.hidden && revealed && (
        <p className="pista" lang="en">
          {p.listen}
        </p>
      )}
      {p.text && (
        <p className={`palabra nueva ${p.text.length > 28 ? 'arc-long' : ''}`} lang={p.textLang}>
          {p.emoji && (
            <span className="emoji" aria-hidden="true">
              {p.emoji}
            </span>
          )}
          {p.text}
          {p.textLang === 'en' && !p.listen && <ListenButton text={p.text.replace(/[“”]/g, '')} />}
        </p>
      )}
      {p.gap && (
        <p className="frase nueva" lang="en">
          {p.gap.before}
          <span className="hueco">{revealed ? answerText : '?'}</span>
          {p.gap.after}
        </p>
      )}
      {p.hint && <p className="pista">{p.hint}</p>}
    </div>
  );
}

/* ---------- Multiple choice ---------- */

function Choice({ q, done, onPick }: { q: Extract<ArcadeQuestion, { kind: 'choice' }>; done: boolean; onPick: (o: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const i = parseInt(e.key, 10);
      const o = q.options[i - 1];
      if (o && !done && !picked) {
        setPicked(o);
        onPick(o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [q, done, picked, onPick]);
  const two = q.options.length === 2;
  return (
    <div className={`opciones texto ${two ? 'arc-two' : ''}`}>
      {q.options.map((o, i) => {
        const cls = picked ? (o === q.answer ? 'correcta' : o === picked ? 'incorrecta' : '') : '';
        return (
          <button
            key={o}
            type="button"
            className={`opcion ${cls}`}
            lang={q.optionsLang}
            disabled={done || !!picked}
            onClick={() => {
              setPicked(o);
              onPick(o);
            }}
          >
            <span className="tecla">{i + 1}</span>
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Typing ---------- */

function Typing({ q, done, onSubmit }: { q: Extract<ArcadeQuestion, { kind: 'type' }>; done: boolean; onSubmit: (t: string) => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState<boolean | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (done || sent !== null || !text.trim()) return;
    const ok = checkTyped(q, text);
    setSent(ok);
    onSubmit(text);
  };
  return (
    <form className="arc-type" onSubmit={submit} autoComplete="off">
      <input
        ref={ref}
        className={sent === null ? '' : sent ? 'ok' : 'bad'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={done || sent !== null}
        placeholder={q.fuzzy ? 'Type what you hear…' : 'Type here…'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={200}
        lang="en"
        aria-label="Your answer"
      />
      <button type="submit" className="boton" disabled={done || sent !== null || !text.trim()}>
        Check
      </button>
      {sent === false && (
        <p className="arc-correct" lang="en">
          Correct answer: <b>{q.answer}</b>
        </p>
      )}
    </form>
  );
}

/* ---------- Tiles (letters or words in order) ---------- */

function Tiles({ q, done, onSubmit }: { q: Extract<ArcadeQuestion, { kind: 'tiles' }>; done: boolean; onSubmit: (ok: boolean, given: string) => void }) {
  const [used, setUsed] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const built = used.map((i) => q.tiles[i]!);
  useEffect(() => {
    if (result !== null || used.length !== q.tiles.length) return;
    const given = built.join(q.joiner);
    const ok = given.toLowerCase() === q.answer.join(q.joiner).toLowerCase();
    setResult(ok);
    onSubmit(ok, given);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used]);
  const locked = done || result !== null;
  return (
    <div className="arc-tiles">
      <div className={`arc-built ${result === null ? '' : result ? 'ok' : 'bad'} ${q.joiner === '' ? 'letters' : ''}`} lang="en" aria-live="polite">
        {built.length === 0 ? <span className="arc-placeholder">Tap the tiles below</span> : null}
        {used.map((i, k) => (
          <button key={`${i}-${k}`} type="button" className="arc-tile on" disabled={locked} onClick={() => setUsed((u) => u.filter((x) => x !== i))}>
            {q.tiles[i]}
          </button>
        ))}
      </div>
      <div className="arc-pool" lang="en">
        {q.tiles.map((t, i) => (
          <button key={i} type="button" className="arc-tile" disabled={locked || used.includes(i)} onClick={() => setUsed((u) => [...u, i])}>
            {t}
          </button>
        ))}
      </div>
      {result === false && (
        <p className="arc-correct" lang="en">
          Correct answer: <b>{q.answer.join(q.joiner)}</b>
        </p>
      )}
    </div>
  );
}

/* ---------- Hangman ---------- */

const MAX_MISSES = 6;
const ABC = 'abcdefghijklmnopqrstuvwxyz'.split('');

function Hangman({ q, done, onEnd }: { q: Extract<ArcadeQuestion, { kind: 'hangman' }>; done: boolean; onEnd: (ok: boolean) => void }) {
  const [tried, setTried] = useState<string[]>([]);
  const word = q.answer.toLowerCase();
  const letters = new Set(word.replace(/[^a-z]/g, '').split(''));
  const misses = tried.filter((l) => !letters.has(l)).length;
  const solved = [...letters].every((l) => tried.includes(l));
  const over = solved || misses >= MAX_MISSES;
  const ended = useRef(false);
  useEffect(() => {
    if (over && !ended.current) {
      ended.current = true;
      onEnd(solved);
    }
  }, [over, solved, onEnd]);
  const guess = (l: string) => {
    if (!over && !done && !tried.includes(l)) setTried((t) => [...t, l]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[a-z]$/i.test(e.key)) guess(e.key.toLowerCase());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  return (
    <div className="arc-hangman">
      <p className="arc-lives-left" aria-live="polite">
        {'❤️'.repeat(MAX_MISSES - misses)}
        {'🖤'.repeat(misses)}
      </p>
      <p className="palabra arc-word" lang="en" aria-label="Word">
        {word.split('').map((ch, i) => (
          <span key={i} className={/[a-z]/.test(ch) ? 'arc-slot' : 'arc-sep'}>
            {/[a-z]/.test(ch) ? (tried.includes(ch) || over ? ch : '_') : ch}
          </span>
        ))}
      </p>
      <div className="arc-keys">
        {ABC.map((l) => (
          <button
            key={l}
            type="button"
            className={`arc-key ${tried.includes(l) ? (letters.has(l) ? 'hit' : 'miss') : ''}`}
            disabled={over || done || tried.includes(l)}
            onClick={() => guess(l)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Memory ---------- */

function Memory({ q, done, onEnd }: { q: Extract<ArcadeQuestion, { kind: 'memory' }>; done: boolean; onEnd: (ok: boolean) => void }) {
  const cards = useMemo(
    () =>
      barajar(
        Math.random,
        q.pairs.flatMap((p, i) => [
          { id: `a${i}`, pair: i, text: p.a, lang: 'en' },
          { id: `b${i}`, pair: i, text: p.b, lang: 'es' },
        ]),
      ),
    [q],
  );
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const ended = useRef(false);
  const flip = (id: string) => {
    if (done || open.length === 2 || open.includes(id)) return;
    const card = cards.find((c) => c.id === id)!;
    if (matched.includes(card.pair)) return;
    const next = [...open, id];
    setOpen(next);
    if (next.length === 2) {
      const [a, b] = next.map((x) => cards.find((c) => c.id === x)!);
      if (a!.pair === b!.pair) {
        if (a!.lang === 'en') void speak(a!.text);
        else void speak(b!.text);
        setTimeout(() => {
          setMatched((m) => [...m, a!.pair]);
          setOpen([]);
        }, 350);
      } else {
        setMistakes((m) => m + 1);
        setTimeout(() => setOpen([]), 800);
      }
    }
  };
  useEffect(() => {
    if (!ended.current && matched.length === q.pairs.length) {
      ended.current = true;
      onEnd(mistakes <= 2);
    }
  }, [matched, q.pairs.length, mistakes, onEnd]);
  return (
    <div className="arc-memory">
      <p className="pista">Mistakes: {mistakes} (2 or fewer to win the round)</p>
      <div className="arc-grid">
        {cards.map((c) => {
          const shown = open.includes(c.id) || matched.includes(c.pair);
          return (
            <button key={c.id} type="button" className={`arc-card ${shown ? 'up' : ''} ${matched.includes(c.pair) ? 'matched' : ''}`} onClick={() => flip(c.id)} lang={c.lang} disabled={done}>
              {shown ? c.text : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
