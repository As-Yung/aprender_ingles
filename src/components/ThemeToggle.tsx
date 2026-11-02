import { useTheme } from '../core/theme/theme';

/** Botón para alternar entre modo oscuro (predeterminado) y modo claro. */
export function ThemeToggle({ className = 'btn btn--ghost btn--small' }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  return (
    <button className={className} type="button" onClick={toggle} title={label} aria-label={label}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
