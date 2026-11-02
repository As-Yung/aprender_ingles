import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loading } from '../components/Loading';
import { useAuth } from '../core/auth/AuthContext';
import { AuthError, type AppUser } from '../core/auth/types';
import { validateUsername } from '../core/auth/validation';

interface Secret {
  username: string;
  password: string;
}

function errMsg(e: unknown): string {
  return e instanceof AuthError ? e.message : 'An unexpected error occurred.';
}

export default function AdminPage() {
  const { service, session } = useAuth();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState<Secret | null>(null);
  const [newUser, setNewUser] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!service) return;
    try {
      setUsers(await service.admin.listUsers());
    } catch (e) {
      setError(errMsg(e));
    }
  }, [service]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!service || !session) return null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
      setNotice(label);
      await reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const v = validateUsername(newUser);
    if (v) return setError(v);
    void run('Usuario creado.', async () => {
      const res = await service.admin.createUser(newUser);
      setSecret({ username: res.user.username, password: res.temporaryPassword });
      setNewUser('');
    });
  };

  return (
    <div>
      <h1>🛡️ User management</h1>
      <p className="muted">
        There is only one administrator. New users get a temporary password; they must change it when they sign in and set up
        2FA (required).
      </p>

      {secret && (
        <div className="callout callout--tip" role="alert">
          <strong>Temporary password for “{secret.username}”</strong> (shown only once, share it through a secure channel):
          <div className="row">
            <code className="secret">{secret.password}</code>
            <button
              className="btn btn--small"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(secret.password).then(() => setNotice('Copied to clipboard.'))}
            >
              Copy
            </button>
            <button className="btn btn--ghost btn--small" type="button" onClick={() => setSecret(null)}>
              Hide
            </button>
          </div>
        </div>
      )}
      {notice && <div className="feedback feedback--ok">{notice}</div>}
      {error && (
        <div className="feedback feedback--bad" role="alert">
          {error}
        </div>
      )}

      <form className="card row" onSubmit={create}>
        <label className="field field--inline">
          <span>New user</span>
          <input
            className="input"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value.toLowerCase())}
            placeholder="e.g. maria.lopez"
            maxLength={32}
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <button className="btn" type="submit" disabled={busy || !newUser}>
          ➕ Create user
        </button>
      </form>

      {!users ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === session.user.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.username}</strong>
                    </td>
                    <td>{u.role === 'admin' ? '👑 Admin' : 'Student'}</td>
                    <td className="small">
                      {u.disabled ? '⛔ Disabled' : '✅ Active'}
                      <br />
                      {u.hasMfa ? '🔐 2FA on' : '⚠️ 2FA pending'}
                      {u.mustChangePassword && (
                        <>
                          <br />
                          🔑 Must change password
                        </>
                      )}
                    </td>
                    <td className="small">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : '—'}</td>
                    <td>
                      {isSelf ? (
                        <span className="muted small">Your account</span>
                      ) : (
                        <div className="row row--tight">
                          <button
                            className="btn btn--small"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              window.confirm(`Assign a new temporary password to ${u.username}?`) &&
                              void run('Temporary password assigned.', async () => {
                                const pw = await service.admin.setTemporaryPassword(u.id);
                                setSecret({ username: u.username, password: pw });
                              })
                            }
                          >
                            🔑 Temporary password
                          </button>
                          <button
                            className="btn btn--small btn--ghost"
                            type="button"
                            disabled={busy || u.mustChangePassword}
                            onClick={() =>
                              void run('A password change will be required at next sign-in.', () =>
                                service.admin.requirePasswordChange(u.id),
                              )
                            }
                          >
                            🔁 Require change
                          </button>
                          <button
                            className="btn btn--small btn--ghost"
                            type="button"
                            disabled={busy || !u.hasMfa}
                            onClick={() =>
                              window.confirm(`Reset 2FA for ${u.username}? They will need to set it up again.`) &&
                              void run('2FA reset.', () => service.admin.resetMfa(u.id))
                            }
                          >
                            📱 Reset 2FA
                          </button>
                          <button
                            className={`btn btn--small ${u.disabled ? 'btn--ok' : 'btn--bad'}`}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(u.disabled ? 'User enabled.' : 'User disabled.', () =>
                                service.admin.setDisabled(u.id, !u.disabled),
                              )
                            }
                          >
                            {u.disabled ? 'Enable' : 'Disable'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
