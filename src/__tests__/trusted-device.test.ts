/**
 * "Recordar este dispositivo 7 días": solo alumnos; el administrador siempre usa el código 2FA.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Role = 'admin' | 'student';
const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }));

import { SupabaseAuthService } from '../core/auth/supabaseAuthService';
import {
  clearTrustedSessionMark,
  getDeviceToken,
  isMarkedTrustedSession,
  jwtClaim,
  saveDeviceToken,
} from '../core/auth/trustedDevice';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: object) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`;
const SESSION_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'A'.repeat(43);

/** Cliente de Supabase falso con lo mínimo que usa SupabaseAuthService. */
function fakeClient(role: Role, invoke: (name: string, opts: { body: Record<string, unknown> }) => Promise<unknown>) {
  const user = { id: `u-${role}`, email: `${role}@x`, created_at: '', app_metadata: { role, username: role } };
  let signedIn = false;
  return {
    invoke: vi.fn(invoke),
    auth: {
      signInWithPassword: vi.fn(async () => {
        signedIn = true;
        return { error: null };
      }),
      getSession: async () => ({
        data: { session: signedIn ? { user, access_token: jwt({ session_id: SESSION_ID, aal: 'aal1' }) } : null },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => {
        signedIn = false;
      },
      mfa: {
        listFactors: async () => ({ data: { totp: [{ id: 'f', status: 'verified' }], all: [] } }),
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1' } }),
      },
    },
    get functions() {
      return { invoke: this.invoke };
    },
  };
}

function service(role: Role, invoke: Parameters<typeof fakeClient>[1]) {
  const client = fakeClient(role, invoke);
  h.client = client;
  return { svc: new SupabaseAuthService(), client };
}

const future = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => clearTrustedSessionMark());

describe('dispositivo de confianza (Supabase)', () => {
  it('alumno con dispositivo recordado: no pide el código y la sesión cuenta como verificada', async () => {
    saveDeviceToken('u-student', { token: TOKEN, expiresAt: future() });
    const { svc, client } = service('student', async (_n, { body }) => {
      expect(body).toEqual({ action: 'device.claim', token: TOKEN });
      return { data: { ok: true, expiresAt: future() }, error: null };
    });
    expect(await svc.signIn('student', 'Correct-Horse-2026')).toBe('done');
    expect(client.invoke).toHaveBeenCalledTimes(1);
    const s = await svc.getSession();
    expect(s?.aal).toBe('aal2');
    expect(s?.trustedDevice).toBe(true);
  });

  it('administrador: nunca presenta el dispositivo y siempre pide el código', async () => {
    saveDeviceToken('u-admin', { token: TOKEN, expiresAt: future() });
    const { svc, client } = service('admin', async () => ({ data: { ok: true, expiresAt: future() }, error: null }));
    expect(await svc.signIn('admin', 'Correct-Horse-2026')).toBe('mfa-verify');
    expect(client.invoke).not.toHaveBeenCalled();
    expect((await svc.getSession())?.aal).toBe('aal1');
    // Tampoco puede recordarse
    await svc.rememberDevice();
    expect(client.invoke).not.toHaveBeenCalled();
  });

  it('token rechazado por el servidor (revocado o caducado): se olvida y se pide el código', async () => {
    saveDeviceToken('u-student', { token: TOKEN, expiresAt: future() });
    const { svc } = service('student', async () => ({
      data: null,
      error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify({ error: 'no' }), { status: 401 }) },
    }));
    expect(await svc.signIn('student', 'Correct-Horse-2026')).toBe('mfa-verify');
    expect(getDeviceToken('u-student')).toBeNull();
    expect((await svc.getSession())?.aal).toBe('aal1');
  });

  it('fallo de red: se pide el código pero se conserva el dispositivo', async () => {
    saveDeviceToken('u-student', { token: TOKEN, expiresAt: future() });
    const { svc } = service('student', async () => ({ data: null, error: { name: 'FunctionsFetchError' } }));
    expect(await svc.signIn('student', 'Correct-Horse-2026')).toBe('mfa-verify');
    expect(getDeviceToken('u-student')).not.toBeNull();
  });

  it('sin dispositivo recordado: pide el código sin llamar al servidor', async () => {
    const { svc, client } = service('student', async () => ({ data: null, error: null }));
    expect(await svc.signIn('student', 'Correct-Horse-2026')).toBe('mfa-verify');
    expect(client.invoke).not.toHaveBeenCalled();
  });

  it('rememberDevice guarda el token que entrega el servidor', async () => {
    const expiresAt = future();
    const { svc } = service('student', async (_n, { body }) => {
      expect(body).toEqual({ action: 'device.trust' });
      return { data: { token: TOKEN, expiresAt }, error: null };
    });
    await svc.signIn('student', 'Correct-Horse-2026');
    await svc.rememberDevice();
    expect(getDeviceToken('u-student')).toEqual({ token: TOKEN, expiresAt });
  });
});

describe('utilidades', () => {
  it('un token caducado en este navegador se descarta', () => {
    saveDeviceToken('u1', { token: TOKEN, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(getDeviceToken('u1')).toBeNull();
    expect(localStorage.getItem('ai.trust.u1')).toBeNull();
  });

  it('la marca de sesión solo vale para esa sesión concreta', async () => {
    const { markTrustedSession } = await import('../core/auth/trustedDevice');
    markTrustedSession(SESSION_ID, future());
    expect(isMarkedTrustedSession(SESSION_ID)).toBe(true);
    expect(isMarkedTrustedSession('otra')).toBe(false);
    expect(isMarkedTrustedSession('')).toBe(false);
  });

  it('jwtClaim lee claims y tolera tokens rotos', () => {
    expect(jwtClaim(jwt({ session_id: SESSION_ID }), 'session_id')).toBe(SESSION_ID);
    expect(jwtClaim('basura', 'session_id')).toBe('');
  });
});
