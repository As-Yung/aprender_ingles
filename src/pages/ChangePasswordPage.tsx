import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../core/auth/AuthContext';
import { AuthError } from '../core/auth/types';
import { checkPassword } from '../core/auth/validation';

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
    if (pw !== pw2) return setError('Las contraseñas no coinciden.');
    if (!check.ok) return setError(check.problems.join(' '));
    setBusy(true);
    try {
      await service!.changeOwnPassword(pw);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>🔑 {forced ? 'Crea tu nueva contraseña' : 'Cambiar contraseña'}</h1>
        {forced && <p>El administrador pidió que cambies tu contraseña antes de continuar.</p>}
        <label className="field">
          <span>Nueva contraseña</span>
          <input className="input" type="password" autoComplete="new-password" maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field">
          <span>Repite la contraseña</span>
          <input className="input" type="password" autoComplete="new-password" maxLength={128} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <ul className="pw-rules small">
          {['Mínimo 12 caracteres.', 'Al menos una letra minúscula.', 'Al menos una letra mayúscula.', 'Al menos un número.', 'Al menos un símbolo (por ejemplo - _ ! @ #).'].map((r) => (
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
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>
        {!forced && (
          <button className="link-btn" type="button" onClick={() => navigate(-1)}>
            Volver
          </button>
        )}
      </form>
    </main>
  );
}
