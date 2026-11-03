import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loading } from '../components/Loading';
import { NotConfigured } from '../components/NotConfigured';
import { config } from '../config/env';
import { useAuth } from '../core/auth/AuthContext';
import { AuthError } from '../core/auth/types';

export default function LoginPage() {
  const { service, session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!service) return <NotConfigured />;
  if (session?.aal === 'aal2') return <Navigate to="/" replace />;
  // Contraseña ya validada pero falta el 2FA (p. ej. tras recargar): continuar en el paso del código
  if (session && !busy) return <Navigate to="/mfa" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await service.signIn(username, password);
      // Publica la sesión nueva en el contexto ANTES de navegar. Si no, la página del 2FA podía
      // montarse con la sesión aún vacía y devolver al login (había que escribir las credenciales dos veces).
      await refresh();
      setPassword('');
      navigate('/mfa', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-card__logo" aria-hidden="true">
          EN
        </div>
        <h1>Tech Talk English</h1>
        <p className="muted">Casual English for tech, from A1 to C2. Visual, playful and hands-on.</p>
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            name="username"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={32}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <div className="feedback feedback--bad" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--block" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <p className="muted small">
          🔐 Next, we'll ask for a code from your authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).
        </p>
        {config.authMode === 'local' && <p className="dev-banner">🧪 Local development mode</p>}
      </form>
    </main>
  );
}
