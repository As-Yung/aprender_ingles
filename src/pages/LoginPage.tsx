import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loading } from '../components/Loading';
import { NotConfigured } from '../components/NotConfigured';
import { config } from '../config/env';
import { useAuth } from '../core/auth/AuthContext';
import { AuthError } from '../core/auth/types';

export default function LoginPage() {
  const { service, session, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!service) return <NotConfigured />;
  if (session?.aal === 'aal2') return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await service.signIn(username, password);
      setPassword('');
      navigate('/mfa');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
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
        <h1>Aprender Inglés</h1>
        <p className="muted">De A1 a C2, de forma visual y didáctica.</p>
        <label className="field">
          <span>Usuario</span>
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
          <span>Contraseña</span>
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
          {busy ? 'Verificando…' : 'Entrar'}
        </button>
        <p className="muted small">
          🔐 Después te pediremos un código de tu app autenticadora (Google Authenticator, Microsoft Authenticator, Authy…).
        </p>
        {config.authMode === 'local' && <p className="dev-banner">🧪 Modo local de desarrollo</p>}
      </form>
    </main>
  );
}
