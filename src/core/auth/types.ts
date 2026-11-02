/** Contrato común para cualquier proveedor de autenticación (Supabase, local, futuros). */
export type Role = 'admin' | 'student';
export type AssuranceLevel = 'aal1' | 'aal2';

export interface AppUser {
  id: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  disabled?: boolean;
  hasMfa?: boolean;
  createdAt?: string;
  lastSignInAt?: string | null;
}

export interface Session {
  user: AppUser;
  /** aal1 = solo contraseña; aal2 = contraseña + segundo factor (TOTP). */
  aal: AssuranceLevel;
  /** true si el usuario ya tiene un factor TOTP verificado. */
  hasMfa: boolean;
}

export type SignInNext = 'mfa-enroll' | 'mfa-verify' | 'done';

export interface MfaEnrollment {
  factorId: string;
  /** URI otpauth:// para generar el código QR. */
  uri: string;
  /** Secreto en base32, para introducirlo manualmente en la app autenticadora. */
  secret: string;
}

export interface CreatedCredentials {
  user: AppUser;
  temporaryPassword: string;
}

export interface AdminService {
  listUsers(): Promise<AppUser[]>;
  createUser(username: string, temporaryPassword?: string): Promise<CreatedCredentials>;
  setTemporaryPassword(userId: string, temporaryPassword?: string): Promise<string>;
  requirePasswordChange(userId: string): Promise<void>;
  resetMfa(userId: string): Promise<void>;
  setDisabled(userId: string, disabled: boolean): Promise<void>;
}

export interface AuthService {
  readonly mode: 'supabase' | 'local';
  getSession(): Promise<Session | null>;
  subscribe(listener: (session: Session | null) => void): () => void;
  signIn(username: string, password: string): Promise<SignInNext>;
  startMfaEnrollment(): Promise<MfaEnrollment>;
  confirmMfaEnrollment(factorId: string, code: string): Promise<void>;
  verifyMfa(code: string): Promise<void>;
  changeOwnPassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  readonly admin: AdminService;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'auth_error',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
