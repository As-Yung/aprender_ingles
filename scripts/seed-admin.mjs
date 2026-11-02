#!/usr/bin/env node
/**
 * Crea (una sola vez) la cuenta del ÚNICO administrador en Supabase.
 *
 * Variables de entorno (en GitHub Actions vienen de Secrets, nunca del código):
 *   SUPABASE_URL                 https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    clave secreta (service_role)
 *   ADMIN_INITIAL_PASSWORD       contraseña inicial del usuario "admin"
 *   USERNAME_EMAIL_DOMAIN        (opcional) dominio interno, por defecto usuarios.aprender-ingles.app
 *   ADMIN_FORCE_PASSWORD_CHANGE  (opcional) "true" para obligar a cambiarla en el primer acceso
 *   ADMIN_RECOVERY               (opcional) "true" para RESTABLECER contraseña y 2FA del admin existente
 */
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_INITIAL_PASSWORD,
  USERNAME_EMAIL_DOMAIN = 'usuarios.aprender-ingles.app',
  ADMIN_FORCE_PASSWORD_CHANGE = 'false',
  ADMIN_RECOVERY = 'false',
} = process.env;

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) fail('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
if (!ADMIN_INITIAL_PASSWORD) fail('Falta ADMIN_INITIAL_PASSWORD.');
const pw = ADMIN_INITIAL_PASSWORD;
if (pw.length < 12 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
  fail('ADMIN_INITIAL_PASSWORD no cumple la política (12+ caracteres, mayúscula, minúscula, número y símbolo).');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAdmins() {
  const admins = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 500 });
    if (error) fail(`No se pudo listar usuarios: ${error.message}`);
    admins.push(...data.users.filter((u) => u.app_metadata?.role === 'admin'));
    if (data.users.length < 500) break;
  }
  return admins;
}

const admins = await findAdmins();
if (admins.length > 1) fail('Hay más de un administrador. Revísalo manualmente en el panel de Supabase.');

if (admins.length === 1) {
  const existing = admins[0];
  if (ADMIN_RECOVERY !== 'true') {
    console.log('✔ El administrador ya existe. No se hace nada (usa ADMIN_RECOVERY=true para restablecerlo).');
    process.exit(0);
  }
  const { error } = await supabase.auth.admin.updateUserById(existing.id, {
    password: pw,
    ban_duration: 'none',
    app_metadata: { ...existing.app_metadata, must_change_password: true },
  });
  if (error) fail(`No se pudo restablecer: ${error.message}`);
  const { data: factors } = await supabase.auth.admin.mfa.listFactors({ userId: existing.id });
  for (const f of factors?.factors ?? []) await supabase.auth.admin.mfa.deleteFactor({ userId: existing.id, id: f.id });
  console.log('✔ Administrador restablecido: nueva contraseña (cambio obligatorio) y 2FA reiniciado.');
  process.exit(0);
}

const { error } = await supabase.auth.admin.createUser({
  email: `admin@${USERNAME_EMAIL_DOMAIN}`,
  password: pw,
  email_confirm: true,
  app_metadata: { role: 'admin', username: 'admin', must_change_password: ADMIN_FORCE_PASSWORD_CHANGE === 'true' },
});
if (error) fail(`No se pudo crear el administrador: ${error.message}`);
console.log('✔ Administrador "admin" creado. En el primer acceso deberá configurar su 2FA.');
