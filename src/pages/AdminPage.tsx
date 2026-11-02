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
  return e instanceof AuthError ? e.message : 'Ocurrió un error inesperado.';
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
      <h1>🛡️ Administración de usuarios</h1>
      <p className="muted">
        Solo existe un administrador. Los usuarios nuevos reciben una contraseña temporal, deben cambiarla al entrar y configurar
        su 2FA obligatoriamente.
      </p>

      {secret && (
        <div className="callout callout--tip" role="alert">
          <strong>Contraseña temporal de “{secret.username}”</strong> (se muestra solo una vez, entrégala por un canal seguro):
          <div className="row">
            <code className="secret">{secret.password}</code>
            <button
              className="btn btn--small"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(secret.password).then(() => setNotice('Copiada al portapapeles.'))}
            >
              Copiar
            </button>
            <button className="btn btn--ghost btn--small" type="button" onClick={() => setSecret(null)}>
              Ocultar
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
          <span>Nuevo usuario</span>
          <input
            className="input"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value.toLowerCase())}
            placeholder="p. ej. maria.lopez"
            maxLength={32}
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <button className="btn" type="submit" disabled={busy || !newUser}>
          ➕ Crear usuario
        </button>
      </form>

      {!users ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th>Acciones</th>
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
                    <td>{u.role === 'admin' ? '👑 Admin' : 'Estudiante'}</td>
                    <td className="small">
                      {u.disabled ? '⛔ Desactivado' : '✅ Activo'}
                      <br />
                      {u.hasMfa ? '🔐 2FA activo' : '⚠️ 2FA pendiente'}
                      {u.mustChangePassword && (
                        <>
                          <br />
                          🔑 Debe cambiar contraseña
                        </>
                      )}
                    </td>
                    <td className="small">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : '—'}</td>
                    <td>
                      {isSelf ? (
                        <span className="muted small">Tu cuenta</span>
                      ) : (
                        <div className="row row--tight">
                          <button
                            className="btn btn--small"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              window.confirm(`¿Asignar una contraseña temporal nueva a ${u.username}?`) &&
                              void run('Contraseña temporal asignada.', async () => {
                                const pw = await service.admin.setTemporaryPassword(u.id);
                                setSecret({ username: u.username, password: pw });
                              })
                            }
                          >
                            🔑 Contraseña temporal
                          </button>
                          <button
                            className="btn btn--small btn--ghost"
                            type="button"
                            disabled={busy || u.mustChangePassword}
                            onClick={() =>
                              void run('Se pedirá cambio de contraseña en el próximo acceso.', () =>
                                service.admin.requirePasswordChange(u.id),
                              )
                            }
                          >
                            🔁 Pedir cambio
                          </button>
                          <button
                            className="btn btn--small btn--ghost"
                            type="button"
                            disabled={busy || !u.hasMfa}
                            onClick={() =>
                              window.confirm(`¿Reiniciar el 2FA de ${u.username}? Deberá configurarlo de nuevo.`) &&
                              void run('2FA reiniciado.', () => service.admin.resetMfa(u.id))
                            }
                          >
                            📱 Reiniciar 2FA
                          </button>
                          <button
                            className={`btn btn--small ${u.disabled ? 'btn--ok' : 'btn--bad'}`}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(u.disabled ? 'Usuario activado.' : 'Usuario desactivado.', () =>
                                service.admin.setDisabled(u.id, !u.disabled),
                              )
                            }
                          >
                            {u.disabled ? 'Activar' : 'Desactivar'}
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
