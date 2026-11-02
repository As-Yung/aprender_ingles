import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config.usernameEmailDomain', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('usa el dominio por defecto si la variable llega vacía (caso GitHub Actions)', async () => {
    vi.stubEnv('VITE_USERNAME_EMAIL_DOMAIN', '');
    const { config, DEFAULT_EMAIL_DOMAIN } = await import('../config/env');
    expect(config.usernameEmailDomain).toBe(DEFAULT_EMAIL_DOMAIN);
  });

  it('respeta un dominio configurado', async () => {
    vi.stubEnv('VITE_USERNAME_EMAIL_DOMAIN', ' ejemplo.org ');
    const { config } = await import('../config/env');
    expect(config.usernameEmailDomain).toBe('ejemplo.org');
  });
});
