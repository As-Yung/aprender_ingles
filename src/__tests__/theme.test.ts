import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME, getStoredTheme, setTheme } from '../core/theme/theme';

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('el modo oscuro es el predeterminado', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
    applyTheme(getStoredTheme());
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('recuerda el modo claro elegido', () => {
    setTheme('light');
    expect(getStoredTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignora valores guardados inválidos', () => {
    localStorage.setItem('ai.theme', JSON.stringify('rosa'));
    expect(getStoredTheme()).toBe('dark');
  });
});
