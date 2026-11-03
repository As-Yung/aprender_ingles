import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Es } from '../../components/Es';
import { useAuth } from '../../core/auth/AuthContext';
import { SYSTEM_PROMPT } from '../../core/ai/context';
import { keyLooksValid, PROVIDER_IDS, PROVIDERS, streamChat, type ProviderId } from '../../core/ai/providers';
import { connectAi, disconnectAi, getPreferredProvider, openAskAi, useAiConnection, type AiMode } from '../../core/ai/store';
import './ai-tutor.css';

/** Connect the learner's favourite AI (Claude, ChatGPT or Gemini) for live questions. */
export default function AiTutorPage() {
  const { session } = useAuth();
  const conn = useAiConnection();
  const [provider, setProvider] = useState<ProviderId>(conn?.provider ?? getPreferredProvider());
  const [mode, setMode] = useState<AiMode>(conn?.mode ?? 'chat');
  const [model, setModel] = useState(conn?.model ?? PROVIDERS[provider].defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const info = PROVIDERS[provider];
  const ownerId = session?.user.id ?? '';

  const pick = (p: ProviderId) => {
    setProvider(p);
    setModel(PROVIDERS[p].defaultModel);
    setError('');
  };

  async function connect() {
    setError('');
    if (mode === 'chat') {
      connectAi({ provider, mode, apiKey: '', model, ownerId });
      return;
    }
    const key = apiKey.trim();
    if (!key) return setError('Paste your API key first.');
    if (!keyLooksValid(provider, key)) {
      return setError(`That doesn't look like a ${info.name} API key (it usually starts with “${info.keyPrefix}”).`);
    }
    setChecking(true);
    try {
      // Tiny test request: proves the key and model work before we say "connected".
      await streamChat({
        provider,
        apiKey: key,
        model,
        system: SYSTEM_PROMPT,
        turns: [{ role: 'user', text: 'Reply with the single word: ready' }],
        maxTokens: 400,
        onText: () => {},
      });
      connectAi({ provider, mode, apiKey: key, model, ownerId });
      setApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="ai-page">
      <nav className="breadcrumb">
        <Link to="/">Home</Link> › AI tutor
      </nav>
      <section className="hero">
        <p className="eyebrow">Live help</p>
        <h1>🤖 Your AI tutor</h1>
        <p className="hero__lead">
          Connect <strong>Claude</strong>, <strong>ChatGPT</strong> or <strong>Gemini</strong>. Then press <strong>Ask AI</strong> on any page
          and ask about what you see: a word, a grammar rule, an exercise or a game.
        </p>
        <Es text="Conecta tu IA favorita y pregúntale en tiempo real sobre lo que ves en pantalla." />
      </section>

      {conn ? (
        <div className="card ai-connected">
          <div className="ai-connected__info">
            <span className="ai-connected__icon" aria-hidden="true">
              {PROVIDERS[conn.provider].icon}
            </span>
            <div>
              <h3>Connected to {PROVIDERS[conn.provider].name}</h3>
              <p className="muted">
                {conn.mode === 'key'
                  ? `Answers appear right here in the app · ${PROVIDERS[conn.provider].models.find((m) => m.id === conn.model)?.label ?? conn.model}`
                  : `Your question opens in your own ${PROVIDERS[conn.provider].name} chat`}
              </p>
            </div>
          </div>
          <div className="ai-connected__actions">
            <button type="button" className="btn" onClick={() => openAskAi()}>
              💬 Ask AI now
            </button>
            <button type="button" className="btn btn--ghost" onClick={disconnectAi}>
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="section-title">1 · Choose your AI</h2>
          <div className="ai-providers" role="radiogroup" aria-label="AI provider">
            {PROVIDER_IDS.map((id) => {
              const p = PROVIDERS[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={provider === id}
                  className={`ai-provider${provider === id ? ' ai-provider--on' : ''}`}
                  onClick={() => pick(id)}
                >
                  <span className="ai-provider__icon" aria-hidden="true">
                    {p.icon}
                  </span>
                  <strong>{p.name}</strong>
                  <span className="muted">by {p.company}</span>
                </button>
              );
            })}
          </div>

          <h2 className="section-title">2 · Choose how to connect</h2>
          <div className="ai-modes" role="radiogroup" aria-label="Connection type">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'chat'}
              className={`ai-mode${mode === 'chat' ? ' ai-mode--on' : ''}`}
              onClick={() => setMode('chat')}
            >
              <span className="ai-mode__tag">Easiest · free</span>
              <strong>💬 Use my {info.name} account</strong>
              <span>
                Your question + what's on your screen open in {info.name} in a new tab. Works with your normal (free or paid) account. Nothing
                to paste here.
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'key'}
              className={`ai-mode${mode === 'key' ? ' ai-mode--on' : ''}`}
              onClick={() => setMode('key')}
            >
              <span className="ai-mode__tag">Best experience</span>
              <strong>⚡ Answers inside the app (API key)</strong>
              <span>
                Paste a personal API key and the answers appear right here, live. The provider bills your API account (usually cents per
                month).
              </span>
            </button>
          </div>

          <div className="card ai-form">
            {mode === 'key' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void connect();
                }}
              >
                <ol className="ai-steps">
                  <li>
                    Open{' '}
                    <a href={info.keyUrl} target="_blank" rel="noopener noreferrer">
                      {info.company}'s API keys page ↗
                    </a>{' '}
                    and create a key.
                  </li>
                  <li>Paste it below and press Connect.</li>
                </ol>
                <label className="field">
                  <span>{info.name} API key</span>
                  <div className="ai-key">
                    <input
                      className="input"
                      type={showKey ? 'text' : 'password'}
                      name="ai-api-key"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-ai-private
                      placeholder={`${info.keyPrefix}…`}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowKey((s) => !s)}>
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="field">
                  <span>Model</span>
                  <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                    {info.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {error && (
                  <p className="feedback feedback--bad" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className="btn btn--block" disabled={checking}>
                  {checking ? 'Checking your key…' : `🔌 Connect ${info.name}`}
                </button>
              </form>
            ) : (
              <>
                <p>
                  When you ask a question, the app prepares a message with your question and the text on your screen, and opens{' '}
                  {info.name}.{' '}
                  {info.prefills ? 'The message is filled in for you.' : 'The message is copied: just paste it (Ctrl+V / ⌘V).'}
                </p>
                <p className="muted">Sign in to {info.name} in this browser first if you haven't.</p>
                <button type="button" className="btn btn--block" onClick={() => void connect()}>
                  🔌 Connect {info.name}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <div className="card ai-safety">
        <h3>🔒 How your data is protected</h3>
        <ul>
          <li>
            <strong>Your key stays in this tab's memory only.</strong> It is never saved in the browser, sent to our servers or stored in your
            account.
          </li>
          <li>
            <strong>You reconnect every time you sign in.</strong> Signing out, closing the tab, reloading or 30 minutes without activity
            disconnects your AI.
          </li>
          <li>
            The app talks <strong>directly</strong> to {conn ? PROVIDERS[conn.provider].name : info.name} over a secure connection. Only the
            text of the page you are on is shared, and you can switch it off or preview it before sending.
          </li>
          <li>Passwords, 2FA codes and the admin area are never shared.</li>
          <li>Tip: give your key a monthly spending limit on the provider's website, and delete it there if you ever think it leaked.</li>
        </ul>
        <Es text="Tu clave solo vive en la memoria de esta pestaña: nunca se guarda ni se envía a nuestros servidores. Cada vez que inicias sesión vuelves a conectar tu IA." />
      </div>
    </div>
  );
}
