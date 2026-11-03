/**
 * Proveedor de autenticación LOCAL — solo para desarrollo y pruebas en Codespaces.
 *
 * Guarda los usuarios en localStorage del navegador (contraseñas con PBKDF2 y TOTP real).
 * NO es seguro para producción: en un sitio estático cualquier persona controla su navegador.
 * config/env.ts impide activarlo en un build de producción.
 */
import { config } from '../../config/env';
import { hashPassword, randomBytes, randomId, toBase64, verifyPassword } from '../security/crypto';
import { readJson, removeKey, writeJson } from '../security/storage';
import { buildTotp, createTotpSecret, validateTotp } from './totp';
import { clearDeviceToken, getDeviceToken, saveDeviceToken, TRUSTED_DEVICE_DAYS } from './trustedDevice';
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
  checkPassword,
  generateTemporaryPassword,
  isValidTotpCode,
  normalizeUsername,
  validateUsername,
} from './validation';

const USERS_KEY = 'ai.local.users.v1';
const SESSION_KEY = 'ai.local.session.v1';
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface StoredUser {
  id: string;
  username: string;
  role: 'admin' | 'student';
  password: { hash: string; salt: string; iterations: number };
  mustChangePassword: boolean;
  disabled: boolean;
  totpSecret?: string;
  totpPending?: { factorId: string; secret: string };
  totpLastCounter?: number;
  /** Hashes SHA-256 de los tokens de dispositivos de confianza (solo alumnos). */
  trustedDevices?: { hash: string; expiresAt: number }[];
  failedAttempts: number;
  lockedUntil?: number;
  createdAt: string;
  lastSignInAt: string | null;
}

interface StoredSession {
  userId: string;
  aal: 'aal1' | 'aal2';
  expiresAt: number;
  trustedDevice?: boolean;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toAppUser(u: StoredUser): AppUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    disabled: u.disabled,
    hasMfa: Boolean(u.totpSecret),
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt,
  };
}

export class LocalAuthService implements AuthService {
  readonly mode = 'local' as const;
  private listeners = new Set<(s: Session | null) => void>();

  readonly admin: AdminService = {
    listUsers: async () => {
      this.requireAdmin();
      return this.users().map(toAppUser);
    },
    createUser: async (rawUsername, temporaryPassword) => {
      this.requireAdmin();
      const err = validateUsername(rawUsername);
      if (err) throw new AuthError(err, 'invalid_username');
      const username = normalizeUsername(rawUsername);
      if (this.users().some((u) => u.username === username)) {
        throw new AuthError('That username already exists.', 'user_exists');
      }
      const pw = temporaryPassword || generateTemporaryPassword();
      const check = checkPassword(pw, username);
      if (!check.ok) throw new AuthError(check.problems.join(' '), 'weak_password');
      const user: StoredUser = {
        id: randomId(),
        username,
        role: 'student', // el rol admin NUNCA se asigna desde la app: solo existe un administrador
        password: await hashPassword(pw),
        mustChangePassword: true,
        disabled: false,
        failedAttempts: 0,
        createdAt: new Date().toISOString(),
        lastSignInAt: null,
      };
      this.save([...this.users(), user]);
      const result: CreatedCredentials = { user: toAppUser(user), temporaryPassword: pw };
      return result;
    },
    setTemporaryPassword: async (userId, temporaryPassword) => {
      this.requireAdmin();
      const pw = temporaryPassword || generateTemporaryPassword();
      const target = this.findById(userId);
      const check = checkPassword(pw, target.username);
      if (!check.ok) throw new AuthError(check.problems.join(' '), 'weak_password');
      const password = await hashPassword(pw);
      this.update(userId, { password, mustChangePassword: true, failedAttempts: 0, lockedUntil: undefined, trustedDevices: [] });
      return pw;
    },
    requirePasswordChange: async (userId) => {
      this.requireAdmin();
      this.update(userId, { mustChangePassword: true });
    },
    resetMfa: async (userId) => {
      const me = this.requireAdmin();
      if (me.id === userId) throw new AuthError('You cannot reset your own 2FA from here.', 'self_action');
      this.update(userId, { totpSecret: undefined, totpPending: undefined, totpLastCounter: undefined, trustedDevices: [] });
    },
    setDisabled: async (userId, disabled) => {
      const me = this.requireAdmin();
      if (me.id === userId) throw new AuthError('You cannot disable your own account.', 'self_action');
      this.update(userId, disabled ? { disabled, trustedDevices: [] } : { disabled });
    },
  };

  constructor() {
    window.addEventListener('storage', (e) => {
      if (e.key === SESSION_KEY || e.key === USERS_KEY) void this.emit();
    });
  }

  // ---------- almacenamiento ----------
  private users(): StoredUser[] {
    return readJson<StoredUser[]>('local', USERS_KEY, []);
  }
  private save(users: StoredUser[]) {
    writeJson('local', USERS_KEY, users);
  }
  private findById(id: string): StoredUser {
    const u = this.users().find((x) => x.id === id);
    if (!u) throw new AuthError('User not found.', 'not_found');
    return u;
  }
  private update(id: string, patch: Partial<StoredUser>) {
    const users = this.users();
    const i = users.findIndex((u) => u.id === id);
    if (i < 0) throw new AuthError('User not found.', 'not_found');
    users[i] = { ...users[i]!, ...patch };
    this.save(users);
  }
  private rawSession(): StoredSession | null {
    const s = readJson<StoredSession | null>('session', SESSION_KEY, null);
    if (!s || s.expiresAt < Date.now()) return null;
    return s;
  }
  private setSession(s: StoredSession | null) {
    if (s) writeJson('session', SESSION_KEY, s);
    else removeKey('session', SESSION_KEY);
    void this.emit();
  }
  private currentUser(): StoredUser | null {
    const s = this.rawSession();
    if (!s) return null;
    const u = this.users().find((x) => x.id === s.userId);
    return u && !u.disabled ? u : null;
  }
  private requireAdmin(): StoredUser {
    const s = this.rawSession();
    const u = this.currentUser();
    if (!s || !u || s.aal !== 'aal2' || u.role !== 'admin') {
      throw new AuthError('Only a 2FA-verified administrator can do this.', 'forbidden');
    }
    return u;
  }

  /** Crea el administrador único la primera vez, usando la contraseña de .env.local. */
  private async ensureAdminSeeded(): Promise<void> {
    if (this.users().some((u) => u.role === 'admin')) return;
    const pw = config.localAdminPassword;
    if (!pw) {
      throw new AuthError(
        'Local mode has no administrator: set VITE_LOCAL_ADMIN_PASSWORD in .env.local (or the ADMIN_INITIAL_PASSWORD secret in Codespaces) and restart "npm run dev".',
        'admin_not_seeded',
      );
    }
    const admin: StoredUser = {
      id: randomId(),
      username: 'admin',
      role: 'admin',
      password: await hashPassword(pw),
      mustChangePassword: false,
      disabled: false,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      lastSignInAt: null,
    };
    this.save([...this.users(), admin]);
  }

  private async emit() {
    const s = await this.getSession();
    this.listeners.forEach((l) => l(s));
  }

  // ---------- API pública ----------
  async getSession(): Promise<Session | null> {
    const s = this.rawSession();
    const u = this.currentUser();
    if (!s || !u) return null;
    return { user: toAppUser(u), aal: s.aal, hasMfa: Boolean(u.totpSecret), trustedDevice: Boolean(s.trustedDevice) };
  }

  subscribe(listener: (session: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signIn(rawUsername: string, password: string): Promise<SignInNext> {
    await this.ensureAdminSeeded();
    const username = normalizeUsername(rawUsername);
    const generic = new AuthError('Incorrect username or password.', 'invalid_credentials');
    const user = this.users().find((u) => u.username === username);
    if (!user) {
      // Coste similar al de un usuario real para no revelar qué usuarios existen
      await hashPassword(password);
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      const min = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      throw new AuthError(`Account temporarily locked. Try again in ${min} min.`, 'locked');
    }
    const ok = await verifyPassword(password, user.password);
    if (!ok) {
      const failed = user.failedAttempts + 1;
      this.update(user.id, {
        failedAttempts: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? Date.now() + LOCK_MS : user.lockedUntil,
      });
      throw generic;
    }
    if (user.disabled) throw new AuthError('This account is disabled. Contact the administrator.', 'disabled');
    this.update(user.id, { failedAttempts: 0, lockedUntil: undefined });
    if (user.totpSecret && user.role !== 'admin' && (await this.isTrustedDevice(user))) {
      this.setSession({ userId: user.id, aal: 'aal2', expiresAt: Date.now() + SESSION_TTL_MS, trustedDevice: true });
      return 'done';
    }
    this.setSession({ userId: user.id, aal: 'aal1', expiresAt: Date.now() + SESSION_TTL_MS });
    return user.totpSecret ? 'mfa-verify' : 'mfa-enroll';
  }

  async startMfaEnrollment(): Promise<MfaEnrollment> {
    const u = this.currentUser();
    if (!u) throw new AuthError('Invalid session.', 'no_session');
    if (u.totpSecret) throw new AuthError('You already have 2FA set up.', 'already_enrolled');
    const secret = createTotpSecret();
    const factorId = randomId();
    this.update(u.id, { totpPending: { factorId, secret } });
    return { factorId, secret, uri: buildTotp(secret, u.username).toString() };
  }

  async confirmMfaEnrollment(factorId: string, code: string): Promise<void> {
    const u = this.currentUser();
    const s = this.rawSession();
    if (!u || !s) throw new AuthError('Invalid session.', 'no_session');
    if (!u.totpPending || u.totpPending.factorId !== factorId) {
      throw new AuthError('Please restart the 2FA setup.', 'no_pending_factor');
    }
    if (!isValidTotpCode(code)) throw new AuthError('The code must have 6 digits.', 'invalid_code');
    const counter = validateTotp(u.totpPending.secret, code);
    if (counter === null) throw new AuthError('Wrong code. Check the time on your phone.', 'invalid_code');
    this.update(u.id, {
      totpSecret: u.totpPending.secret,
      totpPending: undefined,
      totpLastCounter: counter,
      lastSignInAt: new Date().toISOString(),
    });
    this.setSession({ ...s, aal: 'aal2' });
  }

  async verifyMfa(code: string): Promise<void> {
    const u = this.currentUser();
    const s = this.rawSession();
    if (!u || !s || !u.totpSecret) throw new AuthError('Invalid session.', 'no_session');
    if (!isValidTotpCode(code)) throw new AuthError('The code must have 6 digits.', 'invalid_code');
    const counter = validateTotp(u.totpSecret, code, u.totpLastCounter);
    if (counter === null) {
      const failed = u.failedAttempts + 1;
      this.update(u.id, {
        failedAttempts: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? Date.now() + LOCK_MS : u.lockedUntil,
      });
      if (failed >= MAX_FAILED) this.setSession(null);
      throw new AuthError('Wrong or already used code.', 'invalid_code');
    }
    this.update(u.id, { totpLastCounter: counter, failedAttempts: 0, lastSignInAt: new Date().toISOString() });
    this.setSession({ ...s, aal: 'aal2' });
  }

  async changeOwnPassword(newPassword: string): Promise<void> {
    const u = this.currentUser();
    const s = this.rawSession();
    if (!u || !s || s.aal !== 'aal2') throw new AuthError('You must verify 2FA first.', 'aal2_required');
    const check = checkPassword(newPassword, u.username);
    if (!check.ok) throw new AuthError(check.problems.join(' '), 'weak_password');
    if (await verifyPassword(newPassword, u.password)) {
      throw new AuthError('The new password must be different from the current one.', 'same_password');
    }
    this.update(u.id, { password: await hashPassword(newPassword), mustChangePassword: false });
    void this.emit();
  }

  private async isTrustedDevice(user: StoredUser): Promise<boolean> {
    const device = getDeviceToken(user.id);
    if (!device) return false;
    const hash = await sha256Hex(device.token);
    const ok = (user.trustedDevices ?? []).some((d) => d.hash === hash && d.expiresAt > Date.now());
    if (!ok) clearDeviceToken(user.id);
    return ok;
  }

  async rememberDevice(): Promise<void> {
    const u = this.currentUser();
    const s = this.rawSession();
    if (!u || !s || u.role === 'admin') return;
    if (s.aal !== 'aal2' || s.trustedDevice) throw new AuthError('Verify the 2FA code first.', 'aal2_required');
    const token = toBase64(randomBytes(32));
    const expiresAt = Date.now() + TRUSTED_DEVICE_DAYS * 86_400_000;
    const kept = (u.trustedDevices ?? []).filter((d) => d.expiresAt > Date.now()).slice(-9);
    this.update(u.id, { trustedDevices: [...kept, { hash: await sha256Hex(token), expiresAt }] });
    saveDeviceToken(u.id, { token, expiresAt: new Date(expiresAt).toISOString() });
  }

  async signOut(): Promise<void> {
    this.setSession(null);
  }
}
