// Edge Function "admin-users" (Deno) — operaciones privilegiadas de cuentas.
//
// Seguridad:
//   * La service role key SOLO existe aquí (variable de entorno del servidor), nunca en el navegador.
//   * Cada petición verifica el JWT del usuario con Supabase Auth (getUser) y exige AAL2 (2FA).
//   * Las acciones "admin.*" exigen además app_metadata.role === "admin" leído de la base de datos.
//   * Ninguna acción puede asignar el rol admin: solo existe un administrador (creado por el script de semilla).
//   * Validación estricta de entrada, CORS restringido a orígenes permitidos y registro de auditoría.
import { createClient, type User } from 'npm:@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const USERNAME_EMAIL_DOMAIN = Deno.env.get('USERNAME_EMAIL_DOMAIN') ?? 'usuarios.aprender-ingles.app';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase().replace(/\/$/, ''))
  .filter(Boolean);

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = '876000h'; // ~100 años

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function checkPassword(pw: unknown, username?: string): string {
  if (typeof pw !== 'string') throw new HttpError(400, 'Contraseña no válida.');
  const problems: string[] = [];
  if (pw.length < 12) problems.push('Mínimo 12 caracteres.');
  if (pw.length > 128) problems.push('Máximo 128 caracteres.');
  if (!/[a-z]/.test(pw)) problems.push('Al menos una letra minúscula.');
  if (!/[A-Z]/.test(pw)) problems.push('Al menos una letra mayúscula.');
  if (!/[0-9]/.test(pw)) problems.push('Al menos un número.');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('Al menos un símbolo.');
  if (username && pw.toLowerCase().includes(username.toLowerCase())) problems.push('No debe contener el nombre de usuario.');
  if (problems.length) throw new HttpError(400, problems.join(' '));
  return pw;
}

/** Entero aleatorio uniforme en [0, n) sin sesgo de módulo (muestreo por rechazo). */
function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % n;
}

function generateTemporaryPassword(length = 16): string {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '-_!@#%*+=?'];
  const all = sets.join('');
  const rnd = randomInt;
  const chars = sets.map((s) => s[rnd(s.length)]!);
  while (chars.length < length) chars.push(all[rnd(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new HttpError(401, 'Token no válido.');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(b64));
}

function requireUuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID_PATTERN.test(v)) throw new HttpError(400, 'Identificador no válido.');
  return v;
}

function toAppUser(u: User) {
  const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
  const bannedUntil = (u as User & { banned_until?: string | null }).banned_until;
  return {
    id: u.id,
    username: typeof meta.username === 'string' ? meta.username : (u.email ?? '').split('@')[0],
    role: meta.role === 'admin' ? 'admin' : 'student',
    mustChangePassword: meta.must_change_password === true,
    disabled: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
    hasMfa: (u.factors ?? []).some((f) => f.status === 'verified'),
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

async function getTarget(userId: string): Promise<User> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) throw new HttpError(404, 'Usuario no encontrado.');
  return data.user;
}

function assertNotAdminTarget(target: User, actorId: string) {
  if (target.id === actorId || target.app_metadata?.role === 'admin') {
    throw new HttpError(403, 'Esta acción no se puede aplicar a la cuenta de administrador.');
  }
}

async function audit(actorId: string, action: string, targetId?: string) {
  await admin.from('admin_audit_log').insert({ actor_id: actorId, action, target_id: targetId ?? null });
}

// ------------------------- dispositivos de confianza -------------------------
const TRUSTED_DEVICE_DAYS = 7;
const MAX_TRUSTED_DEVICES = 10;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url sin relleno

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isAdmin(u: User): boolean {
  return u.app_metadata?.role === 'admin';
}

/** ¿Esta sesión concreta fue validada con un dispositivo de confianza vigente? (nunca para el admin) */
async function isTrustedSession(user: User, sessionId: string): Promise<boolean> {
  if (isAdmin(user) || !UUID_PATTERN.test(sessionId)) return false;
  const { data, error } = await admin
    .from('trusted_sessions')
    .select('session_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return !error && Boolean(data);
}

async function revokeTrustedDevices(userId: string) {
  // trusted_sessions se borra en cascada
  const { error } = await admin.from('trusted_devices').delete().eq('user_id', userId);
  if (error) throw new HttpError(500, 'No se pudieron revocar los dispositivos de confianza.');
}

async function authenticate(req: Request): Promise<{ user: User; aal: string; sessionId: string }> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'No autenticado.');
  // getUser valida la firma y la sesión contra Supabase Auth.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesión no válida o expirada.');
  const claims = decodeJwtPayload(token);
  return { user: data.user, aal: String(claims.aal ?? 'aal1'), sessionId: String(claims.session_id ?? '') };
}

Deno.serve(async (req) => {
  // Los navegadores envían el origen en minúsculas (https://as-yung.github.io)
  const origin = req.headers.get('Origin')?.toLowerCase() ?? null;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (origin && ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: 'Origen no permitido.' }, 403, origin);
  }
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin);

  try {
    const contentLength = Number(req.headers.get('Content-Length') ?? '0');
    if (contentLength > 10_000) throw new HttpError(413, 'Petición demasiado grande.');
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    const { user: actor, aal, sessionId } = await authenticate(req);

    // -------- presentar un dispositivo de confianza (sesión solo con contraseña) --------
    if (action === 'device.claim') {
      if (isAdmin(actor)) throw new HttpError(403, 'El administrador siempre debe usar el código 2FA.');
      if (!UUID_PATTERN.test(sessionId)) throw new HttpError(401, 'Sesión no válida.');
      const token = typeof body.token === 'string' ? body.token : '';
      if (!TOKEN_PATTERN.test(token)) throw new HttpError(401, 'Dispositivo no reconocido.');
      const { data: device, error } = await admin
        .from('trusted_devices')
        .select('id, expires_at')
        .eq('token_hash', await sha256Hex(token))
        .eq('user_id', actor.id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error) {
        console.error('device.claim select', error.code, error.message);
        throw new HttpError(500, 'No se pudo comprobar el dispositivo.');
      }
      if (!device) throw new HttpError(401, 'Dispositivo no reconocido o caducado.');
      const { error: insErr } = await admin.from('trusted_sessions').upsert({
        session_id: sessionId,
        user_id: actor.id,
        device_id: device.id,
        expires_at: device.expires_at,
      });
      if (insErr) {
        console.error('device.claim upsert', insErr.code, insErr.message);
        throw new HttpError(500, 'No se pudo registrar la sesión.');
      }
      await admin.from('trusted_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id);
      return json({ ok: true, expiresAt: device.expires_at }, 200, origin);
    }

    const fullyAuthenticated = aal === 'aal2' || (await isTrustedSession(actor, sessionId));
    if (!fullyAuthenticated) throw new HttpError(403, 'Se requiere verificación en dos pasos.');

    // -------- recordar este dispositivo 7 días (solo justo tras verificar el código) --------
    if (action === 'device.trust') {
      if (isAdmin(actor)) throw new HttpError(403, 'El administrador siempre debe usar el código 2FA.');
      if (aal !== 'aal2') throw new HttpError(403, 'Verifica primero el código 2FA.');
      const nowIso = new Date().toISOString();
      await admin.from('trusted_devices').delete().eq('user_id', actor.id).lte('expires_at', nowIso);
      const { data: existing } = await admin
        .from('trusted_devices')
        .select('id')
        .eq('user_id', actor.id)
        .order('created_at', { ascending: false });
      const extra = (existing ?? []).slice(MAX_TRUSTED_DEVICES - 1).map((d) => d.id);
      if (extra.length) await admin.from('trusted_devices').delete().in('id', extra);
      const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86_400_000).toISOString();
      const { error } = await admin
        .from('trusted_devices')
        .insert({ user_id: actor.id, token_hash: await sha256Hex(token), expires_at: expiresAt });
      if (error) {
        console.error('device.trust insert', error.code, error.message);
        throw new HttpError(500, 'No se pudo recordar el dispositivo.');
      }
      return json({ token, expiresAt }, 200, origin);
    }

    // --------------------------- acciones propias ---------------------------
    if (action === 'me.changePassword') {
      const username = String(actor.app_metadata?.username ?? '');
      const newPassword = checkPassword(body.newPassword, username);
      const { error } = await admin.auth.admin.updateUserById(actor.id, {
        password: newPassword,
        app_metadata: { ...actor.app_metadata, must_change_password: false },
      });
      if (error) throw new HttpError(400, 'No se pudo cambiar la contraseña. Prueba con otra diferente.');
      await audit(actor.id, action, actor.id);
      return json({ ok: true }, 200, origin);
    }

    // --------------------------- acciones de admin ---------------------------
    if (!action.startsWith('admin.')) throw new HttpError(400, 'Acción desconocida.');
    if (actor.app_metadata?.role !== 'admin') throw new HttpError(403, 'Acción reservada al administrador.');

    switch (action) {
      case 'admin.list': {
        const users: User[] = [];
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
          if (error) throw new HttpError(500, 'No se pudo obtener la lista de usuarios.');
          users.push(...data.users);
          if (data.users.length < 500) break;
        }
        return json({ users: users.map(toAppUser).sort((a, b) => a.username.localeCompare(b.username)) }, 200, origin);
      }

      case 'admin.create': {
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!USERNAME_PATTERN.test(username) || username === 'admin') throw new HttpError(400, 'Nombre de usuario no válido.');
        const temporaryPassword = body.temporaryPassword
          ? checkPassword(body.temporaryPassword, username)
          : generateTemporaryPassword();
        const { data, error } = await admin.auth.admin.createUser({
          email: `${username}@${USERNAME_EMAIL_DOMAIN}`,
          password: temporaryPassword,
          email_confirm: true,
          app_metadata: { role: 'student', username, must_change_password: true },
        });
        if (error || !data.user) {
          const exists = /already|registered|exists/i.test(error?.message ?? '');
          throw new HttpError(exists ? 409 : 400, exists ? 'Ese usuario ya existe.' : 'No se pudo crear el usuario.');
        }
        await audit(actor.id, action, data.user.id);
        return json({ user: toAppUser(data.user), temporaryPassword }, 200, origin);
      }

      case 'admin.setTemporaryPassword': {
        const target = await getTarget(requireUuid(body.userId));
        assertNotAdminTarget(target, actor.id);
        const username = String(target.app_metadata?.username ?? '');
        const temporaryPassword = body.temporaryPassword
          ? checkPassword(body.temporaryPassword, username)
          : generateTemporaryPassword();
        const { error } = await admin.auth.admin.updateUserById(target.id, {
          password: temporaryPassword,
          app_metadata: { ...target.app_metadata, must_change_password: true },
        });
        if (error) throw new HttpError(400, 'No se pudo asignar la contraseña temporal.');
        await revokeTrustedDevices(target.id);
        await audit(actor.id, action, target.id);
        return json({ temporaryPassword }, 200, origin);
      }

      case 'admin.requirePasswordChange': {
        const target = await getTarget(requireUuid(body.userId));
        assertNotAdminTarget(target, actor.id);
        const { error } = await admin.auth.admin.updateUserById(target.id, {
          app_metadata: { ...target.app_metadata, must_change_password: true },
        });
        if (error) throw new HttpError(400, 'No se pudo solicitar el cambio.');
        await audit(actor.id, action, target.id);
        return json({ ok: true }, 200, origin);
      }

      case 'admin.resetMfa': {
        const target = await getTarget(requireUuid(body.userId));
        assertNotAdminTarget(target, actor.id);
        const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: target.id });
        if (error) throw new HttpError(500, 'No se pudieron leer los factores.');
        for (const f of data.factors) {
          await admin.auth.admin.mfa.deleteFactor({ userId: target.id, id: f.id });
        }
        await revokeTrustedDevices(target.id);
        await audit(actor.id, action, target.id);
        return json({ ok: true }, 200, origin);
      }

      case 'admin.setDisabled': {
        const target = await getTarget(requireUuid(body.userId));
        assertNotAdminTarget(target, actor.id);
        if (typeof body.disabled !== 'boolean') throw new HttpError(400, 'Parámetro no válido.');
        const { error } = await admin.auth.admin.updateUserById(target.id, {
          ban_duration: body.disabled ? BAN_FOREVER : 'none',
        });
        if (error) throw new HttpError(400, 'No se pudo actualizar el estado.');
        if (body.disabled) await revokeTrustedDevices(target.id);
        await audit(actor.id, `${action}:${body.disabled}`, target.id);
        return json({ ok: true }, 200, origin);
      }

      default:
        throw new HttpError(400, 'Acción desconocida.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, origin);
    console.error('admin-users error', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'Error interno.' }, 500, origin);
  }
});
