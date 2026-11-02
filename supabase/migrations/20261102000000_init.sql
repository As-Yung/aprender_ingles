-- =============================================================================
-- Aprender Inglés · esquema inicial
-- Seguridad:
--   * El rol (admin/student) y "must_change_password" viven en auth.users.app_metadata,
--     que SOLO puede modificar la service role (Edge Function / script de semilla).
--   * Toda tabla de datos de usuario tiene RLS y exige AAL2 (contraseña + TOTP).
-- =============================================================================

-- Nota: el esquema "auth" lo gestiona Supabase y no admite índices propios.
--   * Unicidad del usuario: el usuario se mapea a un email único (usuario@dominio-interno).
--   * Administrador único: ninguna ruta del sistema permite asignar role=admin salvo el
--     script de semilla, que se niega a crear un segundo administrador.

-- ---------------------------------------------------------------------------
-- Progreso de aprendizaje (un documento JSON por usuario)
-- ---------------------------------------------------------------------------
create table if not exists public.user_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_progress_size check (pg_column_size(data) < 512000),
  constraint user_progress_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.user_progress enable row level security;
alter table public.user_progress force row level security;

-- Función auxiliar: sesión con 2FA verificado y sin contraseña temporal pendiente.
create or replace function public.is_fully_authenticated()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'must_change_password')::boolean, false) = false;
$$;

revoke all on public.user_progress from anon;
revoke all on public.user_progress from authenticated;
grant select, insert, update on public.user_progress to authenticated;

drop policy if exists "progress_select_own" on public.user_progress;
create policy "progress_select_own" on public.user_progress
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_fully_authenticated()));

drop policy if exists "progress_insert_own" on public.user_progress;
create policy "progress_insert_own" on public.user_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_fully_authenticated()));

drop policy if exists "progress_update_own" on public.user_progress;
create policy "progress_update_own" on public.user_progress
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_fully_authenticated()))
  with check (user_id = (select auth.uid()) and (select public.is_fully_authenticated()));

-- ---------------------------------------------------------------------------
-- Registro de auditoría de acciones administrativas (solo escribe la service role)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null,
  action      text not null,
  target_id   uuid,
  created_at  timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;
revoke all on public.admin_audit_log from anon, authenticated;
-- Sin políticas: ni anon ni authenticated pueden leer/escribir; la service role omite RLS.
