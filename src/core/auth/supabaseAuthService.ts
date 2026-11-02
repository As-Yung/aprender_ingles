/**
 * Proveedor de autenticación de PRODUCCIÓN basado en Supabase Auth.
 *
 * - Contraseñas: gestionadas por Supabase (bcrypt en el servidor).
 * - 2FA: TOTP nativo de Supabase (AAL2). Es OBLIGATORIO para todos los usuarios.
 * - Rol y "debe cambiar contraseña" viven en app_metadata (solo el servidor puede escribirlo).
 * - Operaciones de administración: Edge Function "admin-users" (usa la service role key, que
 *   nunca llega al navegador) y verifica rol admin + AAL2 en cada llamada.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { config } from '../../config/env';
import {
  AuthError,
  type AdminService,
  type AppUser,
  type AuthService,
  type CreatedCredentials,
  type MfaEnrollment,
  type Session,
  type SignInNext,
} from './types';
import { checkPassword, isValidTotpCode, normalizeUsername, validateUsername } from './validation';

const FUNCTION_NAME = 'admin-users';

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${config.usernameEmailDomain}`;
}

function toAppUser(u: User): AppUser {
  const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id,
    username: typeof meta.username === 'string' ? meta.username : (u.email ?? '').split('@')[0] ?? '',
    role: meta.role === 'admin' ? 'admin' : 'student',
    mustChangePassword: meta.must_change_password === true,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

export class SupabaseAuthService implements AuthService {
  readonly mode = 'supabase' as const;
  readonly client: SupabaseClient;

  readonly admin: AdminService = {
    listUsers: async () => (await this.call<{ users: AppUser[] }>('admin.list')).users,
    createUser: async (username, temporaryPassword) => {
      const err = validateUsername(username);
      if (err) throw new AuthError(err, 'invalid_username');
      return this.call<CreatedCredentials>('admin.create', { username: normalizeUsername(username), temporaryPassword });
    },
    setTemporaryPassword: async (userId, temporaryPassword) =>
      (await this.call<{ temporaryPassword: string }>('admin.setTemporaryPassword', { userId, temporaryPassword }))
        .temporaryPassword,
    requirePasswordChange: async (userId) => {
      await this.call('admin.requirePasswordChange', { userId });
    },
    resetMfa: async (userId) => {
      await this.call('admin.resetMfa', { userId });
    },
    setDisabled: async (userId, disabled) => {
      await this.call('admin.setDisabled', { userId, disabled });
    },
  };

  constructor() {
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // no usamos enlaces mágicos ni OAuth
        // sessionStorage: la sesión se cierra al cerrar la pestaña y reduce exposición ante XSS persistente
        storage: window.sessionStorage,
        storageKey: 'ai.sb.session',
      },
    });
  }

  private async call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.functions.invoke(FUNCTION_NAME, {
      body: { action, ...payload },
    });
    if (error) {
      let message = 'No se pudo completar la operación.';
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) {
        try {
          const body = (await ctx.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* respuesta sin JSON */
        }
      }
      throw new AuthError(message, 'function_error');
    }
    return data as T;
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return null;
    const [{ data: aal }, { data: factors }] = await Promise.all([
      this.client.auth.mfa.getAuthenticatorAssuranceLevel(),
      this.client.auth.mfa.listFactors(),
    ]);
    const hasMfa = (factors?.totp ?? []).some((f) => f.status === 'verified');
    return {
      user: { ...toAppUser(data.session.user), hasMfa },
      aal: aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
      hasMfa,
    };
  }

  subscribe(listener: (session: Session | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange(() => {
      // Se difiere para no llamar a la API dentro del callback (recomendación de supabase-js)
      setTimeout(() => void this.getSession().then(listener), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(username: string, password: string): Promise<SignInNext> {
    if (validateUsername(username)) throw new AuthError('Usuario o contraseña incorrectos.', 'invalid_credentials');
    const { error } = await this.client.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) {
      if (error.status === 429) throw new AuthError('Demasiados intentos. Espera unos minutos.', 'rate_limited');
      if (!error.status || error.name === 'AuthRetryableFetchError') {
        throw new AuthError('No se pudo conectar con el servidor. Revisa tu conexión.', 'network');
      }
      if (/banned/i.test(error.message)) throw new AuthError('Esta cuenta está desactivada.', 'disabled');
      throw new AuthError('Usuario o contraseña incorrectos.', 'invalid_credentials');
    }
    const { data: factors } = await this.client.auth.mfa.listFactors();
    return (factors?.totp ?? []).some((f) => f.status === 'verified') ? 'mfa-verify' : 'mfa-enroll';
  }

  async startMfaEnrollment(): Promise<MfaEnrollment> {
    // Limpia factores sin verificar de intentos anteriores
    const { data: factors } = await this.client.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status === 'unverified') await this.client.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await this.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Aprender Ingles ${new Date().toISOString().slice(0, 10)}`,
      issuer: 'Aprender Ingles',
    });
    if (error || !data) throw new AuthError('No se pudo iniciar la configuración del 2FA.', 'enroll_failed');
    return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<void> {
    if (!isValidTotpCode(code)) throw new AuthError('El código debe tener 6 dígitos.', 'invalid_code');
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) throw new AuthError('Código incorrecto. Revisa la hora de tu teléfono.', 'invalid_code');
  }

  async verifyMfa(code: string): Promise<void> {
    if (!isValidTotpCode(code)) throw new AuthError('El código debe tener 6 dígitos.', 'invalid_code');
    const { data: factors } = await this.client.auth.mfa.listFactors();
    const factor = (factors?.totp ?? []).find((f) => f.status === 'verified');
    if (!factor) throw new AuthError('No tienes 2FA configurado.', 'no_factor');
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) {
      if (error.status === 429) throw new AuthError('Demasiados intentos. Espera unos minutos.', 'rate_limited');
      throw new AuthError('Código incorrecto o ya utilizado.', 'invalid_code');
    }
  }

  async changeOwnPassword(newPassword: string): Promise<void> {
    const session = await this.getSession();
    const check = checkPassword(newPassword, session?.user.username);
    if (!check.ok) throw new AuthError(check.problems.join(' '), 'weak_password');
    await this.call('me.changePassword', { newPassword });
    // Nuevo JWT con app_metadata actualizado (must_change_password = false)
    await this.client.auth.refreshSession();
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
