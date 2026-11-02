import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { config } from '../config/env';
import { useAuth } from '../core/auth/AuthContext';
import { SPANISH_HELP_LABEL, setSpanishHelp, useSpanishHelp, type SpanishHelp } from '../core/i18n/spanishHelp';
import { isMastered } from '../core/progress/misses';
import { useProgress } from '../core/progress/ProgressContext';
import '../styles/game-banner.css';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
  badge?: number;
}

export function Layout() {
  const { service, session } = useAuth();
  const { data } = useProgress();
  const navigate = useNavigate();
  const location = useLocation();
  const spanish = useSpanishHelp();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const bugs = Object.values(data.misses).filter((r) => !isMastered(r)).length;

  // Close the account menu and scroll to the top on every navigation.
  useEffect(() => {
    menuRef.current?.removeAttribute('open');
    window.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  const items: NavItem[] = [
    { to: '/', icon: '🏠', label: 'Home', end: true },
    { to: '/arcade', icon: '🕹️', label: 'Games' },
    { to: '/duelo', icon: '🤺', label: 'Duel' },
    { to: '/repaso', icon: '🐛', label: 'Bug Hunt', badge: bugs },
    { to: '/voz', icon: '🔊', label: 'Voice' },
  ];
  const isAdmin = session?.user.role === 'admin';
  const username = session?.user.username ?? '';

  const navLinks = (cls: string) =>
    items.map((it) => (
      <NavLink key={it.to} to={it.to} end={it.end} className={cls}>
        <span className={`${cls}-icon`} aria-hidden="true">
          {it.icon}
        </span>
        <span className={`${cls}-label`}>{it.label}</span>
        {!!it.badge && (
          <span className="nav-badge" aria-label={`${it.badge} to review`}>
            {it.badge}
          </span>
        )}
      </NavLink>
    ));

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Tech Talk English, home">
          <span className="brand__logo" aria-hidden="true">
            EN
          </span>
          <span className="brand__name">
            Tech Talk <span className="brand__accent">English</span>
          </span>
        </NavLink>
        <nav className="topnav" aria-label="Main">
          {navLinks('topnav__link')}
          {isAdmin && (
            <NavLink to="/admin" className="topnav__link">
              <span className="topnav__link-icon" aria-hidden="true">
                🛡️
              </span>
              <span className="topnav__link-label">Admin</span>
            </NavLink>
          )}
        </nav>
        <div className="topbar__user">
          {data.streak.count > 0 && (
            <span className="streak-chip" title="Day streak">
              🔥 {data.streak.count}
            </span>
          )}
          <ThemeToggle />
          <details className="menu" ref={menuRef}>
            <summary className="menu__trigger" aria-label="Account menu">
              <span className="avatar" aria-hidden="true">
                {username.slice(0, 1).toUpperCase() || '?'}
              </span>
              <span className="menu__name">{username}</span>
              <span aria-hidden="true" className="menu__caret">
                ▾
              </span>
            </summary>
            <div className="menu__panel" role="menu">
              <p className="menu__heading">
                Signed in as <strong>{username}</strong>
              </p>
              <label className="menu__field">
                <span>🇪🇸 Spanish help</span>
                <select
                  className="input input--small"
                  value={spanish}
                  onChange={(e) => setSpanishHelp(e.target.value as SpanishHelp)}
                >
                  {(Object.keys(SPANISH_HELP_LABEL) as SpanishHelp[]).map((k) => (
                    <option key={k} value={k}>
                      {SPANISH_HELP_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin && (
                <button className="menu__item" type="button" role="menuitem" onClick={() => navigate('/admin')}>
                  🛡️ Admin
                </button>
              )}
              <button className="menu__item" type="button" role="menuitem" onClick={() => navigate('/cambiar-contrasena')}>
                🔑 Change password
              </button>
              <button
                className="menu__item menu__item--danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  void service?.signOut().then(() => navigate('/login'));
                }}
              >
                ↩️ Sign out
              </button>
            </div>
          </details>
        </div>
      </header>
      {config.authMode === 'local' && (
        <div className="dev-banner">🧪 Local development mode: users are stored in this browser only.</div>
      )}
      <main className="content" id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer muted">
        Tech Talk English · Casual, spoken English for systems, IoT, security, AI, data and servers · Levels A1–C2
      </footer>
      <nav className="tabbar" aria-label="Main (mobile)">
        {navLinks('tabbar__link')}
      </nav>
    </div>
  );
}
