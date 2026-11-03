#!/usr/bin/env node
/**
 * Prueba de humo del inicio de sesión contra el Supabase REAL (se ejecuta desde GitHub Actions).
 *
 * Crea un alumno temporal, recorre el flujo completo y lo borra al final:
 *   contraseña → alta del 2FA → código → "recordar dispositivo" → cerrar sesión →
 *   contraseña otra vez → presentar el dispositivo → acceso a datos sin código.
 * Comprueba también que sin dispositivo NO hay acceso y que el admin no puede usarlo.
 *
 * No imprime secretos, contraseñas ni tokens.
 * Entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, USERNAME_EMAIL_DOMAIN
 */
import { createClient } from '@supabase/supabase-js';
import { Secret, TOTP } from 'otpauth';
import { randomBytes } from 'node:crypto';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const DOMAIN = process.env.USERNAME_EMAIL_DOMAIN || 'usuarios.aprender-ingles.app';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('✖ Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, opts);

let failures = 0;
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => {
  failures++;
  console.log(`  ✖ ${msg}`);
};
const check = (cond, msg, detail = '') => (cond ? ok(msg) : bad(`${msg}${detail ? ` → ${detail}` : ''}`));

async function invoke(client, body) {
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (!error) return { status: 200, data };
  let status = 0;
  let text = error.message;
  const ctx = error.context;
  if (ctx && typeof ctx.status === 'number') {
    status = ctx.status;
    try {
      text = (await ctx.json()).error ?? text;
    } catch {
      /* sin JSON */
    }
  }
  return { status, error: `${error.name}: ${text}` };
}

const jwtClaims = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());

const username = `smoke-${randomBytes(4).toString('hex')}`;
const password = `Sm0ke-${randomBytes(9).toString('base64url')}!`;
const email = `${username}@${DOMAIN}`;
let userId;

try {
  console.log(`▶ Alumno temporal: ${username}`);
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'student', username, must_change_password: false },
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  userId = created.data.user.id;

  console.log('▶ 1. Primer acceso: contraseña + alta del 2FA');
  const a = newClient();
  const s1 = await a.auth.signInWithPassword({ email, password });
  check(!s1.error, 'contraseña aceptada', s1.error?.message);
  const en = await a.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'smoke' });
  check(!en.error, 'alta TOTP iniciada', en.error?.message);
  const totp = new TOTP({ secret: Secret.fromBase32(en.data.totp.secret), digits: 6, period: 30 });
  const v = await a.auth.mfa.challengeAndVerify({ factorId: en.data.id, code: totp.generate() });
  check(!v.error, 'código TOTP verificado', v.error?.message);
  const sessA = (await a.auth.getSession()).data.session;
  check(jwtClaims(sessA.access_token).aal === 'aal2', 'sesión AAL2');

  console.log('▶ 2. Recordar este dispositivo (device.trust)');
  const trust = await invoke(a, { action: 'device.trust' });
  check(trust.status === 200 && typeof trust.data?.token === 'string', 'token de dispositivo recibido', `${trust.status} ${trust.error ?? ''}`);
  const { count: devCount, error: devErr } = await service
    .from('trusted_devices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  check(!devErr && devCount === 1, 'dispositivo guardado en la base de datos', devErr?.message ?? `count=${devCount}`);
  await a.auth.signOut();

  console.log('▶ 3. Segundo acceso solo con contraseña');
  const b = newClient();
  const s2 = await b.auth.signInWithPassword({ email, password });
  check(!s2.error, 'contraseña aceptada', s2.error?.message);
  const sessB = (await b.auth.getSession()).data.session;
  check(jwtClaims(sessB.access_token).aal === 'aal1', 'sesión AAL1 (sin código todavía)');
  const before = await b.from('user_progress').upsert({ user_id: userId, data: { smoke: 1 } });
  check(Boolean(before.error), 'SIN dispositivo: la base de datos rechaza escribir', 'se permitió escribir sin 2FA');

  const wrong = await invoke(b, { action: 'device.claim', token: 'A'.repeat(43) });
  check(wrong.status === 401, 'token falso rechazado', `${wrong.status} ${wrong.error ?? ''}`);

  if (trust.data?.token) {
    const claim = await invoke(b, { action: 'device.claim', token: trust.data.token });
    check(claim.status === 200, 'dispositivo aceptado (device.claim)', `${claim.status} ${claim.error ?? ''}`);
    const after = await b.from('user_progress').upsert({ user_id: userId, data: { smoke: 2 } });
    check(!after.error, 'CON dispositivo: la base de datos permite escribir sin código', after.error?.message);
    const me = await invoke(b, { action: 'admin.list' });
    check(me.status === 403, 'un alumno sigue sin poder usar acciones de admin', `${me.status}`);
  }

  console.log('▶ 4. Revocación al reiniciar el 2FA');
  await service.from('trusted_devices').delete().eq('user_id', userId);
  const revoked = await b.from('user_progress').upsert({ user_id: userId, data: { smoke: 3 } });
  check(Boolean(revoked.error), 'tras revocar, la sesión vuelve a necesitar el código');
} catch (e) {
  bad(`error inesperado: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  if (userId) {
    const del = await service.auth.admin.deleteUser(userId);
    console.log(del.error ? `⚠ no se pudo borrar el alumno temporal: ${del.error.message}` : '▶ Alumno temporal borrado');
  }
}

if (failures) {
  console.log(`\n✖ ${failures} comprobación(es) fallaron`);
  process.exit(1);
}
console.log('\n✔ Todo correcto');
