import { useMemo, useRef, useState } from 'react';
import { SpeakButton } from '../../components/SpeakButton';
import { canListen, listenOnce, similarity, speak, stopSpeaking } from '../../core/speech/speech';
import type { SectionProps } from '../types';

type Mode = 'escuchar' | 'roles';

export default function ConversationSection({ topic, onComplete }: SectionProps) {
  const conv = topic.conversation;
  const speakers = useMemo(() => [...new Set(conv.lines.map((l) => l.speaker))], [conv]);
  const [mode, setMode] = useState<Mode>('escuchar');
  const [showEs, setShowEs] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const stopRef = useRef(false);

  const playAll = async () => {
    stopRef.current = false;
    for (let i = 0; i < conv.lines.length; i++) {
      if (stopRef.current) break;
      setPlaying(i);
      await speak(conv.lines[i]!.en, { rate: 0.92 });
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
          🎧 Escuchar y leer
        </button>
        <button type="button" role="tab" aria-selected={mode === 'roles'} className={`tab ${mode === 'roles' ? 'is-active' : ''}`} onClick={() => setMode('roles')}>
          🎭 Juego de roles
        </button>
      </div>

      {mode === 'escuchar' ? (
        <>
          <div className="row">
            {playing === null ? (
              <button className="btn" type="button" onClick={() => void playAll()}>
                ▶️ Reproducir diálogo
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
                ⏹️ Detener
              </button>
            )}
            <label className="toggle">
              <input type="checkbox" checked={showEs} onChange={(e) => setShowEs(e.target.checked)} /> Mostrar traducción
            </label>
          </div>
          <ol className="chat">
            {conv.lines.map((l, i) => (
              <li key={i} className={`chat__line ${speakers.indexOf(l.speaker) % 2 ? 'chat__line--right' : ''} ${playing === i ? 'is-playing' : ''}`}>
                <span className="chat__speaker">{l.speaker}</span>
                <span className="chat__bubble">
                  {l.en} <SpeakButton text={l.en} small />
                  {showEs && <small className="chat__es">{l.es}</small>}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <RolePlay key={topic.id} onComplete={onComplete} speakers={speakers} lines={conv.lines} />
      )}

      <div className="card">
        <h3>🗣️ Frases útiles</h3>
        <ul className="phrases">
          {conv.usefulPhrases.map((p) => (
            <li key={p.en}>
              <span className="en">{p.en}</span> <SpeakButton text={p.en} small />
              <span className="es">{p.es}</span>
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
}: {
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

  if (!role) {
    return (
      <div className="card">
        <p>Elige tu personaje. La app dirá las frases del otro personaje y tú responderás en voz alta {listen ? '(con micrófono)' : '(lee en voz alta y luego comprueba)'}.</p>
        <div className="row">
          {speakers.map((s) => (
            <button
              key={s}
              className="btn"
              type="button"
              onClick={() => {
                setRole(s);
                setStep(0);
                if (lines[0] && lines[0].speaker !== s) void speak(lines[0].en);
              }}
            >
              Soy {s}
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
        <p>¡Conversación completada! Precisión media: {avg}%</p>
        <button className="btn" type="button" onClick={() => { setRole(null); setScores([]); }}>
          Repetir
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
    if (next && next.speaker !== role) void speak(next.en);
    if (!next) onComplete(scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : undefined);
  };

  return (
    <div className="card roleplay">
      <div className="srs__meta">
        Turno {step + 1}/{lines.length} · Tú eres <strong>{role}</strong>
      </div>
      {isMine ? (
        <>
          <p className="quiz__prompt">Tu turno. Dilo en inglés:</p>
          <p className="roleplay__hint">🇪🇸 {line.es}</p>
          {(revealed || attempt) && (
            <p className="roleplay__answer">
              🇬🇧 {line.en} <SpeakButton text={line.en} small />
            </p>
          )}
          {attempt && (
            <div className={attempt.score >= 0.7 ? 'feedback feedback--ok' : 'feedback feedback--bad'}>
              Dijiste: “{attempt.text || '…'}” — coincidencia {Math.round(attempt.score * 100)}%
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
                🎙️ Hablar
              </button>
            )}
            {!revealed && !attempt && (
              <button className="btn btn--ghost" type="button" onClick={() => setRevealed(true)}>
                Ver respuesta
              </button>
            )}
            <button className="btn btn--ghost" type="button" onClick={advance}>
              Continuar ➜
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="chat__speaker">{line.speaker} dice:</p>
          <p className="roleplay__answer">
            {line.en} <SpeakButton text={line.en} small />
          </p>
          <small className="muted">{line.es}</small>
          <div className="row">
            <button className="btn" type="button" onClick={advance}>
              Continuar ➜
            </button>
          </div>
        </>
      )}
    </div>
  );
}
