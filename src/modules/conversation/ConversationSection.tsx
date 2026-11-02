import { useMemo, useRef, useState } from 'react';
import { Es } from '../../components/Es';
import { SpeakButton } from '../../components/SpeakButton';
import { getSpanishHelp, showSpanishFor } from '../../core/i18n/spanishHelp';
import { canListen, listenOnce, similarity, speak, stopSpeaking } from '../../core/speech/speech';
import type { SectionProps } from '../types';

type Mode = 'escuchar' | 'roles';

export default function ConversationSection({ level, topic, onComplete }: SectionProps) {
  const conv = topic.conversation;
  const speakers = useMemo(() => [...new Set(conv.lines.map((l) => l.speaker))], [conv]);
  const [mode, setMode] = useState<Mode>('escuchar');
  const [showEs, setShowEs] = useState(() => showSpanishFor(getSpanishHelp(), level.id));
  const [playing, setPlaying] = useState<number | null>(null);
  const stopRef = useRef(false);
  const voiceOf = (name: string): 0 | 1 => (speakers.indexOf(name) % 2 ? 1 : 0);

  const playAll = async () => {
    stopRef.current = false;
    for (let i = 0; i < conv.lines.length; i++) {
      if (stopRef.current) break;
      setPlaying(i);
      const line = conv.lines[i]!;
      await speak(line.en, { speaker: voiceOf(line.speaker) });
    }
    setPlaying(null);
  };

  return (
    <div>
      <div className="card">
        <h3>💬 {conv.title}</h3>
        <p className="muted">{conv.context}</p>
      </div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'escuchar'} className={`tab ${mode === 'escuchar' ? 'is-active' : ''}`} onClick={() => setMode('escuchar')}>
          🎧 Listen & read
        </button>
        <button type="button" role="tab" aria-selected={mode === 'roles'} className={`tab ${mode === 'roles' ? 'is-active' : ''}`} onClick={() => setMode('roles')}>
          🎭 Role-play
        </button>
      </div>

      {mode === 'escuchar' ? (
        <>
          <div className="row">
            {playing === null ? (
              <button className="btn" type="button" onClick={() => void playAll()}>
                ▶️ Play dialogue
              </button>
            ) : (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  stopRef.current = true;
                  stopSpeaking();
                  setPlaying(null);
                }}
              >
                ⏹️ Stop
              </button>
            )}
            <label className="toggle">
              <input type="checkbox" checked={showEs} onChange={(e) => setShowEs(e.target.checked)} /> Show Spanish
            </label>
          </div>
          <ol className="chat">
            {conv.lines.map((l, i) => (
              <li key={i} className={`chat__line ${speakers.indexOf(l.speaker) % 2 ? 'chat__line--right' : ''} ${playing === i ? 'is-playing' : ''}`}>
                <span className="chat__speaker">{l.speaker}</span>
                <span className="chat__bubble">
                  {l.en} <SpeakButton text={l.en} small speaker={voiceOf(l.speaker)} />
                  {showEs && (
                    <small className="chat__es" lang="es">
                      {l.es}
                    </small>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <RolePlay key={topic.id} levelId={level.id} onComplete={onComplete} speakers={speakers} lines={conv.lines} />
      )}

      <div className="card">
        <h3>🗣️ Useful phrases</h3>
        <ul className="phrases">
          {conv.usefulPhrases.map((p) => (
            <li key={p.en}>
              <span className="en">{p.en}</span> <SpeakButton text={p.en} small />
              <Es text={p.es} level={level.id} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RolePlay({
  speakers,
  lines,
  onComplete,
  levelId,
}: {
  levelId: string;
  speakers: string[];
  lines: SectionProps['topic']['conversation']['lines'];
  onComplete: SectionProps['onComplete'];
}) {
  const [role, setRole] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState<{ text: string; score: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [scores, setScores] = useState<number[]>([]);
  const listen = canListen();
  const voiceOf = (name: string): 0 | 1 => (speakers.indexOf(name) % 2 ? 1 : 0);

  if (!role) {
    return (
      <div className="card">
        <p>Pick your character. The app says the other character's lines and you answer out loud {listen ? '(with your microphone)' : '(read it out loud, then check)'}.</p>
        <div className="row">
          {speakers.map((s) => (
            <button
              key={s}
              className="btn"
              type="button"
              onClick={() => {
                setRole(s);
                setStep(0);
                if (lines[0] && lines[0].speaker !== s) void speak(lines[0].en, { speaker: voiceOf(lines[0].speaker) });
              }}
            >
              I'm {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const line = lines[step];
  if (!line) {
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 100;
    return (
      <div className="card center">
        <p className="big">🎭</p>
        <p>Conversation complete! Average accuracy: {avg}%</p>
        <button className="btn" type="button" onClick={() => { setRole(null); setScores([]); }}>
          Try again
        </button>
      </div>
    );
  }

  const isMine = line.speaker === role;
  const advance = () => {
    setAttempt(null);
    setRevealed(false);
    setError('');
    const nextStep = step + 1;
    setStep(nextStep);
    const next = lines[nextStep];
    if (next && next.speaker !== role) void speak(next.en, { speaker: voiceOf(next.speaker) });
    if (!next) onComplete(scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : undefined);
  };

  return (
    <div className="card roleplay">
      <div className="srs__meta">
        Turn {step + 1}/{lines.length} · You are <strong>{role}</strong>
      </div>
      {isMine ? (
        <>
          <p className="quiz__prompt">Your turn. Say it in English:</p>
          <p className="roleplay__hint" lang="es">
            🇪🇸 {line.es}
          </p>
          {(revealed || attempt) && (
            <p className="roleplay__answer">
              🇬🇧 {line.en} <SpeakButton text={line.en} small />
            </p>
          )}
          {attempt && (
            <div className={attempt.score >= 0.7 ? 'feedback feedback--ok' : 'feedback feedback--bad'}>
              You said: “{attempt.text || '…'}” — {Math.round(attempt.score * 100)}% match
            </div>
          )}
          {error && <div className="feedback feedback--bad">{error}</div>}
          <div className="row">
            {listen && (
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  setError('');
                  try {
                    const heard = await listenOnce();
                    const sc = similarity(line.en, heard);
                    setAttempt({ text: heard, score: sc });
                    setScores((s) => [...s, sc]);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                🎙️ Speak
              </button>
            )}
            {!revealed && !attempt && (
              <button className="btn btn--ghost" type="button" onClick={() => setRevealed(true)}>
                Show answer
              </button>
            )}
            <button className="btn btn--ghost" type="button" onClick={advance}>
              Continue ➜
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="chat__speaker">{line.speaker} says:</p>
          <p className="roleplay__answer">
            {line.en} <SpeakButton text={line.en} small speaker={voiceOf(line.speaker)} />
          </p>
          <Es text={line.es} level={levelId} className="muted es" block />
          <div className="row">
            <button className="btn" type="button" onClick={advance}>
              Continue ➜
            </button>
          </div>
        </>
      )}
    </div>
  );
}
