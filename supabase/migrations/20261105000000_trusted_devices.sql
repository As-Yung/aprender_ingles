-- =============================================================================
-- Dispositivos de confianza: el 2FA se pide como mucho cada 7 días a los alumnos.
--
-- Flujo:
--   1. Tras verificar el código TOTP (sesión AAL2), la Edge Function "admin-users"
--      (acción device.trust) genera un token aleatorio de 256 bits, guarda SOLO su
--      hash SHA-256 en trusted_devices con caducidad fija de 7 días y devuelve el
--      token al navegador, que lo guarda en ese dispositivo.
--   2. En el siguiente inicio de sesión con contraseña (sesión AAL1), el navegador
--      presenta el token (acción device.claim). Si es válido, la sesión concreta
--      (claim session_id del JWT) se apunta en trusted_sessions hasta la misma
--      caducidad del dispositivo.
--   3. is_fully_authenticated() acepta AAL2 o una sesión de confianza vigente.
--
-- Seguridad:
--   * El administrador NUNCA puede usar dispositivos de confianza (doble control:
--     la Edge Function lo rechaza y la función SQL lo excluye por rol).
--   * Hace falta la contraseña siempre: el token solo sustituye al código TOTP.
--   * La caducidad no se renueva con el uso: a los 7 días del último código
--     verificado se vuelve a pedir el 2FA.
--   * Ningún cliente puede leer ni escribir estas tablas (solo la service role).
--   * Reiniciar el 2FA, asignar contraseña temporal o desactivar al usuario
--     revoca todos sus dispositivos y sesiones de confianza.
-- =============================================================================

create table if not exists public.trusted_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_used_at timestamptz,
  constraint trusted_devices_max_7_days check (expires_at <= created_at + interval '7 days 1 minute')
);
create index if not exists trusted_devices_user_idx on public.trusted_devices (user_id, expires_at);

create table if not exists public.trusted_sessions (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  device_id   uuid not null references public.trusted_devices (id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists trusted_sessions_user_idx on public.trusted_sessions (user_id);

alter table public.trusted_devices enable row level security;
alter table public.trusted_devices force row level security;
alter table public.trusted_sessions enable row level security;
alter table public.trusted_sessions force row level security;
revoke all on public.trusted_devices from anon, authenticated;
revoke all on public.trusted_sessions from anon, authenticated;
-- Sin políticas: solo la service role (que omite RLS) puede leer/escribir.

-- ¿La sesión del JWT actual es una sesión de confianza vigente de un alumno?
-- security definer: consulta una tabla que los clientes no pueden leer.
create or replace function public.is_trusted_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') <> 'admin'
    and exists (
      select 1
      from public.trusted_sessions t
      where t.session_id::text = coalesce((select auth.jwt()) ->> 'session_id', '')
        and t.user_id = (select auth.uid())
        and t.expires_at > now()
    );
$$;

revoke all on function public.is_trusted_session() from public, anon;
grant execute on function public.is_trusted_session() to authenticated;

-- Sesión con 2FA (o dispositivo de confianza de un alumno) y sin contraseña temporal pendiente.
create or replace function public.is_fully_authenticated()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or (select public.is_trusted_session())
    )
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'must_change_password')::boolean, false) = false;
$$;
