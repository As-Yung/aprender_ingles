import { useState } from 'react';
import { readJson, writeJson } from '../security/storage';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ai.theme';
/** El modo oscuro es el predeterminado de la plataforma. */
export const DEFAULT_THEME: Theme = 'dark';
const THEME_COLOR: Record<Theme, string> = { dark: '#0f172a', light: '#4f46e5' };

export function getStoredTheme(): Theme {
  const t = readJson<unknown>('local', STORAGE_KEY, DEFAULT_THEME);
  return t === 'light' || t === 'dark' ? t : DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function setTheme(theme: Theme): void {
  writeJson('local', STORAGE_KEY, theme);
  applyTheme(theme);
}

/** Hook para el botón de cambio de tema. */
export function useTheme(): [Theme, () => void] {
  const [theme, setState] = useState<Theme>(getStoredTheme);
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setState(next);
  };
  return [theme, toggle];
}
