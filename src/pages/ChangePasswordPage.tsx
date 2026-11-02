import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../core/auth/AuthContext';
import { AuthError } from '../core/auth/types';
import { checkPassword, PASSWORD_RULES } from '../core/auth/validation';

export default function ChangePasswordPage() {
  const { service, session, refresh } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = checkPassword(pw, session?.user.username);
  const forced = session?.user.mustChangePassword;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw !== pw2) return setError('Passwords do not match.');
    if (!check.ok) return setError(check.problems.join(' '));
    setBusy(true);
    try {
      await service!.changeOwnPassword(pw);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>🔑 {forced ? 'Create your new password' : 'Change password'}</h1>
        {forced && <p>The administrator asked you to change your password before continuing.</p>}
        <label className="field">
          <span>New password</span>
          <input className="input" type="password" autoComplete="new-password" maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field">
          <span>Repeat password</span>
          <input className="input" type="password" autoComplete="new-password" maxLength={128} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <ul className="pw-rules small">
          {PASSWORD_RULES.map((r) => (
            <li key={r} className={pw && !check.problems.includes(r) ? 'ok' : ''}>
              {pw && !check.problems.includes(r) ? '✅' : '▫️'} {r}
            </li>
          ))}
        </ul>
        {error && (
          <div className="feedback feedback--bad" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--block" type="submit" disabled={busy || !check.ok || pw !== pw2}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {!forced && (
          <button className="link-btn" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        )}
      </form>
    </main>
  );
}
