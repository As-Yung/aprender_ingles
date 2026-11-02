import { config } from '../../config/env';
import type { AuthService } from './types';

let instance: Promise<AuthService | null> | null = null;

/** Fábrica: carga perezosamente el proveedor configurado (separa el código de cada uno). */
export function getAuthService(): Promise<AuthService | null> {
  if (!instance) {
    instance = (async () => {
      if (config.authMode === 'supabase') {
        const { SupabaseAuthService } = await import('./supabaseAuthService');
        return new SupabaseAuthService();
      }
      if (import.meta.env.DEV && config.authMode === 'local') {
        const { LocalAuthService } = await import('./localAuthService');
        return new LocalAuthService();
      }
      return null;
    })();
  }
  return instance;
}

export * from './types';
