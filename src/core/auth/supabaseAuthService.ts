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
import {
  clearDeviceToken,
  clearTrustedSessionMark,
  getDeviceToken,
  isMarkedTrustedSession,
  jwtClaim,
  markTrustedSession,
  saveDeviceToken,
  type DeviceToken,
} from './trustedDevice';
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
      let message = 'The operation could not be completed.';
      if ((error as { name?: string }).name === 'FunctionsFetchError') {
        throw new AuthError('Could not reach the server. Check your connection.', 'network');
      }
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
    const user = { ...toAppUser(data.session.user), hasMfa };
    const realAal2 = aal?.currentLevel === 'aal2';
    const trustedDevice =
      !realAal2 && user.role !== 'admin' && isMarkedTrustedSession(jwtClaim(data.session.access_token, 'session_id'));
    return { user, aal: realAal2 || trustedDevice ? 'aal2' : 'aal1', hasMfa, trustedDevice };
  }

  subscribe(listener: (session: Session | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange(() => {
      // Se difiere para no llamar a la API dentro del callback (recomendación de supabase-js)
      setTimeout(() => void this.getSession().then(listener), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(username: string, password: string): Promise<SignInNext> {
    if (validateUsername(username)) throw new AuthError('Incorrect username or password.', 'invalid_credentials');
    const { error } = await this.client.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) {
      if (error.status === 429) throw new AuthError('Too many attempts. Wait a few minutes.', 'rate_limited');
      if (!error.status || error.name === 'AuthRetryableFetchError') {
        throw new AuthError('Could not reach the server. Check your connection.', 'network');
      }
      const code = (error as { code?: string }).code ?? '';
      if (code === 'user_banned' || /banned/i.test(error.message)) {
        throw new AuthError('This account is disabled.', 'disabled');
      }
      if (code === 'invalid_credentials') throw new AuthError('Incorrect username or password.', 'invalid_credentials');
      if (code === 'email_provider_disabled' || /logins are disabled/i.test(error.message)) {
        throw new AuthError(
          'Password sign-in is disabled in Supabase (Authentication → Sign In / Providers → Email).',
          'config',
        );
      }
      if (code === 'email_not_confirmed') throw new AuthError('The account is not confirmed in Supabase.', 'config');
      if (error.status === 401 || /api key/i.test(error.message)) {
        throw new AuthError('The Supabase public key is invalid. Check VITE_SUPABASE_ANON_KEY.', 'config');
      }
      // Error inesperado: se muestra el código para poder diagnosticarlo (no revela si el usuario existe)
      throw new AuthError(`Could not sign in (${code || error.status || 'unknown'}).`, 'unknown');
    }
    const { data: factors } = await this.client.auth.mfa.listFactors();
    const hasMfa = (factors?.totp ?? []).some((f) => f.status === 'verified');
    if (hasMfa && (await this.claimTrustedDevice())) return 'done';
    return hasMfa ? 'mfa-verify' : 'mfa-enroll';
  }

  /** Si este navegador está recordado (alumno, < 7 días), el servidor marca la sesión como de confianza. */
  private async claimTrustedDevice(): Promise<boolean> {
    const { data } = await this.client.auth.getSession();
    const s = data.session;
    if (!s || toAppUser(s.user).role === 'admin') return false;
    const device = getDeviceToken(s.user.id);
    if (!device) return false;
    try {
      const res = await this.call<{ expiresAt: string }>('device.claim', { token: device.token });
      markTrustedSession(jwtClaim(s.access_token, 'session_id'), res.expiresAt);
      return true;
    } catch (e) {
      // Token revocado o caducado en el servidor: se olvida. Si es un fallo de red, se pide el código.
      if (!(e instanceof AuthError && e.code === 'network')) clearDeviceToken(s.user.id);
      return false;
    }
  }

  async rememberDevice(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    const s = data.session;
    if (!s || toAppUser(s.user).role === 'admin') return;
    const device = await this.call<DeviceToken>('device.trust');
    saveDeviceToken(s.user.id, device);
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
    if (error || !data) throw new AuthError('Could not start the 2FA setup.', 'enroll_failed');
    return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<void> {
    if (!isValidTotpCode(code)) throw new AuthError('The code must have 6 digits.', 'invalid_code');
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) throw new AuthError('Wrong code. Check the time on your phone.', 'invalid_code');
  }

  async verifyMfa(code: string): Promise<void> {
    if (!isValidTotpCode(code)) throw new AuthError('The code must have 6 digits.', 'invalid_code');
    const { data: factors } = await this.client.auth.mfa.listFactors();
    const factor = (factors?.totp ?? []).find((f) => f.status === 'verified');
    if (!factor) throw new AuthError('You do not have 2FA set up.', 'no_factor');
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) {
      if (error.status === 429) throw new AuthError('Too many attempts. Wait a few minutes.', 'rate_limited');
      throw new AuthError('Wrong or already used code.', 'invalid_code');
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
    clearTrustedSessionMark();
    await this.client.auth.signOut();
  }
}
