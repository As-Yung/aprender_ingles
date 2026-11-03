import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  buildChatPrompt,
  buildUserTurn,
  captureScreen,
  isSensitivePath,
  levelFromPath,
  MAX_QUESTION_CHARS,
  pageLabel,
  SYSTEM_PROMPT,
} from '../../core/ai/context';
import { PROVIDERS, streamChat, type ChatTurn } from '../../core/ai/providers';
import { closeAskAi, openAskAi, takeAskAiDraft, useAiConnection, useAskAiOpen } from '../../core/ai/store';
import './ai-tutor.css';

interface Bubble {
  role: 'user' | 'assistant';
  /** What the learner sees in the bubble. */
  shown: string;
  /** What was actually sent to the AI (question + screen snapshot). */
  sent: string;
  error?: boolean;
}

const MAX_HISTORY = 10;

const SUGGESTIONS = [
  'Explain this to me in simple words',
  'Give me a hint for this exercise',
  'How do I pronounce the key words here?',
  'Give me 3 more examples',
];

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Floating "Ask AI" button + side panel, available on every page of the app. */
export function AskAiPanel() {
  const open = useAskAiOpen();
  const conn = useAiConnection();
  const location = useLocation();
  const path = location.pathname;
  const [question, setQuestion] = useState('');
  const [includeScreen, setIncludeScreen] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sensitive = isSensitivePath(path);

  // Disconnected (sign-out, other user…): forget the conversation too.
  useEffect(() => {
    if (!conn) {
      abortRef.current?.abort();
      setBubbles([]);
    }
  }, [conn]);

  useEffect(() => {
    if (!open) return;
    const d = takeAskAiDraft();
    if (d) setQuestion(d);
    setNotice('');
    setPreview(null);
    window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAskAi();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [bubbles]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (sensitive) return null;

  const snapshot = () => (includeScreen ? captureScreen(document.getElementById('main'), path) : '');
  const input = (q: string) => ({ question: q, screen: snapshot(), page: pageLabel(path), level: levelFromPath(path) });

  async function ask(q: string) {
    if (!conn || !q.trim() || busy) return;
    const info = PROVIDERS[conn.provider];

    if (conn.mode === 'chat') {
      const prompt = buildChatPrompt(input(q));
      const copied = await copyText(prompt);
      window.open(info.chatUrl(prompt), '_blank', 'noopener,noreferrer');
      setNotice(
        info.prefills
          ? `Opened ${info.name} in a new tab with your question and what's on your screen.${copied ? ' (Also copied, in case you need to paste it.)' : ''}`
          : copied
            ? `Copied! Paste it in ${info.name} (Ctrl+V / ⌘V) in the tab that just opened.`
            : `Opened ${info.name}. Your browser blocked copying: use "Preview" to copy the text by hand.`,
      );
      setQuestion('');
      return;
    }

    const sent = buildUserTurn(input(q));
    const history: ChatTurn[] = bubbles
      .filter((b) => !b.error)
      .slice(-MAX_HISTORY)
      .map((b) => ({ role: b.role, text: b.sent }));
    const turns: ChatTurn[] = [...history, { role: 'user', text: sent }];
    setBubbles((b) => [...b, { role: 'user', shown: q.trim(), sent }, { role: 'assistant', shown: '', sent: '' }]);
    setQuestion('');
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let answer = '';
    const update = (patch: Partial<Bubble>) =>
      setBubbles((b) => {
        const copy = b.slice();
        const last = copy[copy.length - 1];
        if (last) copy[copy.length - 1] = { ...last, ...patch };
        return copy;
      });
    try {
      const { refused } = await streamChat({
        provider: conn.provider,
        apiKey: conn.apiKey,
        model: conn.model,
        system: SYSTEM_PROMPT,
        turns,
        signal: ctrl.signal,
        onText: (t) => {
          answer += t;
          update({ shown: answer, sent: answer });
        },
      });
      if (!answer) update({ shown: refused ? 'The AI declined to answer this. Try asking in another way.' : '(No answer.)', error: true });
    } catch (e) {
      if (ctrl.signal.aborted) update({ shown: answer || 'Stopped.', sent: answer, error: !answer });
      else update({ shown: e instanceof Error ? e.message : 'Something went wrong.', error: true });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const info = conn ? PROVIDERS[conn.provider] : null;

  return (
    <>
      {!open && (
        <button type="button" className="ask-ai-fab" onClick={() => openAskAi()} aria-label="Ask AI about this screen">
          <span aria-hidden="true">{info?.icon ?? '🤖'}</span>
          <span className="ask-ai-fab__label">Ask AI</span>
          {conn && <span className="ask-ai-fab__dot" aria-hidden="true" />}
        </button>
      )}
      {open && (
        <aside className="ask-ai" role="dialog" aria-modal="false" aria-label="Ask AI">
          <header className="ask-ai__head">
            <div>
              <p className="eyebrow">Ask AI · live help</p>
              <h2 className="ask-ai__title">
                {info ? (
                  <>
                    {info.icon} {info.name}
                    <span className="ask-ai__status">{conn?.mode === 'key' ? 'connected' : 'via your chat app'}</span>
                  </>
                ) : (
                  '🤖 Your AI tutor'
                )}
              </h2>
            </div>
            <button type="button" className="icon-btn" onClick={closeAskAi} aria-label="Close">
              ✕
            </button>
          </header>

          {!conn ? (
            <div className="ask-ai__empty">
              <p>
                Connect <strong>Claude</strong>, <strong>ChatGPT</strong> or <strong>Gemini</strong> and ask questions about whatever is on your
                screen: a lesson, an exercise, a game…
              </p>
              <p className="muted">For your security, you connect again every time you sign in.</p>
              <Link to="/ia" className="btn btn--block" onClick={closeAskAi}>
                🔌 Connect my AI
              </Link>
            </div>
          ) : (
            <>
              <div className="ask-ai__list" ref={listRef} aria-live="polite">
                {bubbles.length === 0 && (
                  <div className="ask-ai__hello">
                    <p>
                      Ask me anything about <strong>{pageLabel(path)}</strong>. I can see the text on your screen.
                    </p>
                    <div className="ask-ai__chips">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} type="button" className="chip" onClick={() => void ask(s)} disabled={busy}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {bubbles.map((b, i) => (
                  <div key={i} className={`ask-ai__bubble ask-ai__bubble--${b.role}${b.error ? ' ask-ai__bubble--error' : ''}`}>
                    {b.shown || (busy && i === bubbles.length - 1 ? <span className="ask-ai__typing">Thinking…</span> : '')}
                  </div>
                ))}
              </div>

              {notice && (
                <p className="ask-ai__notice" role="status">
                  {notice}
                </p>
              )}

              <form
                className="ask-ai__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(question);
                }}
              >
                <textarea
                  ref={inputRef}
                  className="input ask-ai__input"
                  rows={2}
                  maxLength={MAX_QUESTION_CHARS}
                  placeholder="e.g. What does “deploy” mean here?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void ask(question);
                    }
                  }}
                />
                <div className="ask-ai__row">
                  <label className="toggle ask-ai__toggle">
                    <input type="checkbox" checked={includeScreen} onChange={(e) => setIncludeScreen(e.target.checked)} /> Include my screen
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => setPreview((p) => (p === null ? snapshot() || '(nothing will be shared)' : null))}
                  >
                    👁️ Preview
                  </button>
                  {busy ? (
                    <button type="button" className="btn btn--small btn--bad" onClick={() => abortRef.current?.abort()}>
                      ■ Stop
                    </button>
                  ) : (
                    <button type="submit" className="btn btn--small" disabled={!question.trim()}>
                      {conn.mode === 'chat' ? `Open ${PROVIDERS[conn.provider].name} ↗` : 'Send ➤'}
                    </button>
                  )}
                </div>
                {preview !== null && (
                  <details open className="ask-ai__preview">
                    <summary>What the AI will see</summary>
                    <pre>{preview}</pre>
                  </details>
                )}
              </form>
              <footer className="ask-ai__foot muted">
                {bubbles.length > 0 && (
                  <button type="button" className="linklike" onClick={() => setBubbles([])} disabled={busy}>
                    New chat
                  </button>
                )}
                <Link to="/ia" onClick={closeAskAi}>
                  AI settings
                </Link>
              </footer>
            </>
          )}
        </aside>
      )}
    </>
  );
}
