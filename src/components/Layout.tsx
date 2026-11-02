import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { config } from '../config/env';
import { useAuth } from '../core/auth/AuthContext';
import { isMastered } from '../core/progress/misses';
import { useProgress } from '../core/progress/ProgressContext';
import '../styles/game-banner.css';
import { ThemeToggle } from './ThemeToggle';

export function Layout() {
  const { service, session } = useAuth();
  const { data } = useProgress();
  const navigate = useNavigate();
  const bugs = Object.values(data.misses).filter((r) => !isMastered(r)).length;
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand__logo" aria-hidden="true">
            EN
          </span>
          <span>Aprender Inglés · Tech Talk</span>
        </NavLink>
        <nav className="topbar__nav" aria-label="Principal">
          <NavLink to="/">Inicio</NavLink>
          <NavLink to="/juego">⚔️ Juego</NavLink>
          <NavLink to="/repaso">
            🐛 Repaso{bugs > 0 && <span className="nav-badge">{bugs}</span>}
          </NavLink>
          <NavLink to="/voz">🔊 Voz</NavLink>
          {session?.user.role === 'admin' && <NavLink to="/admin">Administración</NavLink>}
        </nav>
        <div className="topbar__user">
          {data.streak.count > 0 && (
            <span className="streak" title="Días seguidos estudiando">
              🔥 {data.streak.count}
            </span>
          )}
          <span className="muted">{session?.user.username}</span>
          <ThemeToggle />
          <button className="btn btn--ghost btn--small" type="button" onClick={() => navigate('/cambiar-contrasena')}>
            Contraseña
          </button>
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={() => {
              void service?.signOut().then(() => navigate('/login'));
            }}
          >
            Salir
          </button>
        </div>
      </header>
      {config.authMode === 'local' && (
        <div className="dev-banner">🧪 Modo local de desarrollo: los usuarios se guardan solo en este navegador.</div>
      )}
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer muted">Aprender Inglés · Inglés hablado y casual para sistemas, IoT, ciberseguridad, IA, datos y servidores · Niveles A1–C2</footer>
    </div>
  );
}
