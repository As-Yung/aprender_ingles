/**
 * Configuración de la aplicación leída en tiempo de build (variables VITE_*).
 * Todo lo que llega aquí es PÚBLICO: nunca pongas secretos en variables VITE_.
 */
export type AuthMode = 'supabase' | 'local' | 'unconfigured';

export interface AppConfig {
  authMode: AuthMode;
  supabaseUrl: string;
  supabaseAnonKey: string;
  usernameEmailDomain: string;
  localAdminPassword: string;
  isDev: boolean;
}

export const DEFAULT_EMAIL_DOMAIN = 'usuarios.aprender-ingles.app';

function readConfig(): AppConfig {
  const env = import.meta.env;
  const isDev = Boolean(env.DEV);
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  const requested = (env.VITE_AUTH_MODE ?? '').trim();

  let authMode: AuthMode = 'unconfigured';
  if (supabaseUrl && supabaseAnonKey && requested !== 'local') {
    authMode = 'supabase';
  } else if (requested === 'local' || (isDev && !supabaseUrl)) {
    // El modo local guarda usuarios en el navegador: SOLO se permite en desarrollo.
    authMode = isDev ? 'local' : 'unconfigured';
  }

  if (authMode === 'supabase' && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl) && !isDev) {
    authMode = 'unconfigured';
  }

  return {
    authMode,
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    supabaseAnonKey,
    // `||` y no `??`: en GitHub Actions una variable sin definir llega como cadena vacía
    usernameEmailDomain: (env.VITE_USERNAME_EMAIL_DOMAIN ?? '').trim() || DEFAULT_EMAIL_DOMAIN,
    localAdminPassword: isDev ? (env.VITE_LOCAL_ADMIN_PASSWORD ?? '') : '',
    isDev,
  };
}

export const config: AppConfig = readConfig();
