-- =============================================================================
-- Vocab Boss Game · duelos en línea (jugador contra jugador)
--
-- Seguridad:
--   * Los clientes NO escriben en las tablas: todo pasa por funciones RPC
--     (security definer) que comprueban sesión AAL2, que el usuario participa
--     en el duelo y el orden de las jugadas.
--   * El combate (vida, daño, esquivas, golpes dobles y críticos) lo calcula el
--     servidor, así ningún jugador puede inventarse daño ni vida.
--   * Solo se permiten los 4 personajes normales (los secretos no van en duelo).
--   * Cada jugador solo puede leer sus propios duelos y jugadas (RLS).
--   * Sala de espera: canal privado de Realtime "vbg-lobby" solo para AAL2.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Estadísticas de los personajes (las mismas del juego; la vida x3 en duelo)
-- ---------------------------------------------------------------------------
create or replace function public.duel_stats(p_char text)
returns table (vida int, ataque int, velocidad int, esquiva int)
language sql
immutable
set search_path = ''
as $$
  select s.vida, s.ataque, s.velocidad, s.esquiva from (values
    ('paladin', 34, 10, 9, 9),
    ('asesino', 26, 10, 13, 13),
    ('mago', 28, 15, 7, 11),
    ('arquero', 28, 12, 11, 9)
  ) as s(c, vida, ataque, velocidad, esquiva)
  where s.c = p_char;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.vocab_duels (
  id               uuid primary key default gen_random_uuid(),
  challenger       uuid not null references auth.users (id) on delete cascade,
  opponent         uuid not null references auth.users (id) on delete cascade,
  challenger_name  text not null,
  opponent_name    text not null,
  level            text not null check (level in ('a1', 'a2', 'b1', 'b2', 'c1', 'c2')),
  challenger_char  text not null check (challenger_char in ('paladin', 'asesino', 'mago', 'arquero')),
  opponent_char    text check (opponent_char in ('paladin', 'asesino', 'mago', 'arquero')),
  status           text not null default 'pending'
                   check (status in ('pending', 'active', 'finished', 'declined', 'cancelled', 'expired')),
  seed             int,
  c_hp             int,
  o_hp             int,
  c_hp_max         int,
  o_hp_max         int,
  c_streak         int not null default 0,
  o_streak         int not null default 0,
  c_q              int not null default 0,
  o_q              int not null default 0,
  c_ok             int not null default 0,
  o_ok             int not null default 0,
  c_last           timestamptz,
  o_last           timestamptz,
  winner           uuid,
  finish_reason    text check (finish_reason in ('ko', 'forfeit', 'abandon')),
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  finished_at      timestamptz,
  constraint vocab_duels_distinct check (challenger <> opponent)
);

create index if not exists vocab_duels_challenger_idx on public.vocab_duels (challenger, status);
create index if not exists vocab_duels_opponent_idx on public.vocab_duels (opponent, status);

create table if not exists public.vocab_duel_moves (
  id          bigint generated always as identity primary key,
  duel_id     uuid not null references public.vocab_duels (id) on delete cascade,
  player      uuid not null,
  q_index     int not null,
  correct     boolean not null,
  dodged      boolean not null default false,
  hits        int not null default 0,
  damage      int not null default 0,
  critical    boolean not null default false,
  target_hp   int not null,
  created_at  timestamptz not null default now(),
  unique (duel_id, player, q_index)
);

create index if not exists vocab_duel_moves_duel_idx on public.vocab_duel_moves (duel_id, id);

alter table public.vocab_duels enable row level security;
alter table public.vocab_duels force row level security;
alter table public.vocab_duel_moves enable row level security;
alter table public.vocab_duel_moves force row level security;

revoke all on public.vocab_duels from anon, authenticated;
revoke all on public.vocab_duel_moves from anon, authenticated;
grant select on public.vocab_duels to authenticated;
grant select on public.vocab_duel_moves to authenticated;

drop policy if exists "duels_select_participant" on public.vocab_duels;
create policy "duels_select_participant" on public.vocab_duels
  for select to authenticated
  using ((select auth.uid()) in (challenger, opponent) and (select public.is_fully_authenticated()));

drop policy if exists "duel_moves_select_participant" on public.vocab_duel_moves;
create policy "duel_moves_select_participant" on public.vocab_duel_moves
  for select to authenticated
  using (
    (select public.is_fully_authenticated())
    and exists (
      select 1 from public.vocab_duels d
      where d.id = duel_id and (select auth.uid()) in (d.challenger, d.opponent)
    )
  );

-- Tiempo real: los jugadores reciben los cambios de sus duelos (se respeta RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vocab_duels') then
      alter publication supabase_realtime add table public.vocab_duels;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vocab_duel_moves') then
      alter publication supabase_realtime add table public.vocab_duel_moves;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.duel_username(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(u.raw_app_meta_data ->> 'username', ''), split_part(u.email, '@', 1))
  from auth.users u
  where u.id = p_user;
$$;
revoke all on function public.duel_username(uuid) from public, anon, authenticated;

create or replace function public.duel_require_auth()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_fully_authenticated() then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create or replace function public.duel_clamp(x numeric, lo numeric, hi numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select greatest(lo, least(hi, x)); $$;

-- ---------------------------------------------------------------------------
-- RPC: desafiar
-- ---------------------------------------------------------------------------
create or replace function public.duel_challenge(p_opponent uuid, p_level text, p_char text)
returns public.vocab_duels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  v_row public.vocab_duels;
  v_opp_name text;
begin
  if p_opponent is null or p_opponent = v_uid then
    raise exception 'invalid_opponent';
  end if;
  if p_level not in ('a1', 'a2', 'b1', 'b2', 'c1', 'c2') then
    raise exception 'invalid_level';
  end if;
  if not exists (select 1 from public.duel_stats(p_char)) then
    raise exception 'invalid_character';
  end if;
  v_opp_name := public.duel_username(p_opponent);
  if v_opp_name is null then
    raise exception 'invalid_opponent';
  end if;
  -- Un solo desafío pendiente a la vez por jugador (anti‑spam).
  update public.vocab_duels set status = 'cancelled', finished_at = now()
    where challenger = v_uid and status = 'pending';
  -- Límite de frecuencia: como mucho 10 desafíos por minuto.
  if (select count(*) from public.vocab_duels where challenger = v_uid and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.vocab_duels (challenger, opponent, challenger_name, opponent_name, level, challenger_char)
  values (v_uid, p_opponent, public.duel_username(v_uid), v_opp_name, p_level, p_char)
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: aceptar o rechazar (solo el desafiado, antes de 60 s)
-- ---------------------------------------------------------------------------
create or replace function public.duel_respond(p_duel uuid, p_accept boolean, p_char text)
returns public.vocab_duels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  v_row public.vocab_duels;
  v_c record;
  v_o record;
begin
  select * into v_row from public.vocab_duels where id = p_duel for update;
  if not found or v_row.opponent <> v_uid then
    raise exception 'not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'not_pending';
  end if;
  if v_row.created_at < now() - interval '60 seconds' then
    update public.vocab_duels set status = 'expired', finished_at = now() where id = p_duel returning * into v_row;
    return v_row;
  end if;
  if not p_accept then
    update public.vocab_duels set status = 'declined', finished_at = now() where id = p_duel returning * into v_row;
    return v_row;
  end if;
  select * into v_o from public.duel_stats(p_char);
  if not found then
    raise exception 'invalid_character';
  end if;
  select * into v_c from public.duel_stats(v_row.challenger_char);
  -- Quien acepta deja de tener otros desafíos pendientes.
  update public.vocab_duels set status = 'cancelled', finished_at = now()
    where status = 'pending' and id <> p_duel and (challenger = v_uid or opponent = v_uid);

  update public.vocab_duels set
    status = 'active',
    opponent_char = p_char,
    seed = floor(random() * 2147483647)::int,
    c_hp_max = v_c.vida * 3, c_hp = v_c.vida * 3,
    o_hp_max = v_o.vida * 3, o_hp = v_o.vida * 3,
    accepted_at = now(), c_last = now(), o_last = now()
  where id = p_duel
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancelar un desafío propio pendiente
-- ---------------------------------------------------------------------------
create or replace function public.duel_cancel(p_duel uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
begin
  update public.vocab_duels set status = 'cancelled', finished_at = now()
    where id = p_duel and challenger = v_uid and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: responder una pregunta. El servidor resuelve el combate.
--   * Acierto: atacas al rival (esquiva base 10 %, golpe doble por velocidad,
--     crítico x1,5 con 3 aciertos seguidos).
--   * Fallo: el rival te contraataca con la mitad de su ataque (esquiva base 25 %).
-- ---------------------------------------------------------------------------
create or replace function public.duel_answer(p_duel uuid, p_q int, p_correct boolean)
returns public.vocab_duel_moves
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  d public.vocab_duels;
  v_move public.vocab_duel_moves;
  is_c boolean;
  me record;
  foe record;
  my_q int; my_last timestamptz; my_streak int;
  foe_hp int; my_hp int;
  v_dodged boolean := false;
  v_hits int := 0;
  v_damage int := 0;
  v_crit boolean := false;
  v_target_hp int;
  v_over boolean := false;
  i int;
begin
  select * into d from public.vocab_duels where id = p_duel for update;
  if not found or v_uid not in (d.challenger, d.opponent) then
    raise exception 'not_found';
  end if;
  if d.status <> 'active' then
    raise exception 'not_active';
  end if;
  is_c := v_uid = d.challenger;
  select * into me from public.duel_stats(case when is_c then d.challenger_char else d.opponent_char end);
  select * into foe from public.duel_stats(case when is_c then d.opponent_char else d.challenger_char end);
  my_q := case when is_c then d.c_q else d.o_q end;
  my_last := case when is_c then d.c_last else d.o_last end;
  my_streak := case when is_c then d.c_streak else d.o_streak end;
  my_hp := case when is_c then d.c_hp else d.o_hp end;
  foe_hp := case when is_c then d.o_hp else d.c_hp end;

  if p_q is distinct from my_q then
    raise exception 'out_of_order';
  end if;
  -- Nadie responde en menos de 0,6 s (evita respuestas automáticas en ráfaga).
  if my_q > 0 and my_last > now() - interval '600 milliseconds' then
    raise exception 'too_fast';
  end if;

  if p_correct then
    my_streak := my_streak + 1;
    v_crit := my_streak >= 3;
    if random() < public.duel_clamp(0.1 + (foe.esquiva - me.esquiva) * 0.02, 0.05, 0.5) then
      v_dodged := true;
    else
      v_hits := case when random() < public.duel_clamp(0.15 + (me.velocidad - foe.velocidad) * 0.03, 0.05, 0.6) then 2 else 1 end;
      v_damage := round(me.ataque * case when v_crit then 1.5 else 1 end);
      for i in 1..v_hits loop
        foe_hp := greatest(0, foe_hp - v_damage);
      end loop;
    end if;
    v_target_hp := foe_hp;
    v_over := foe_hp <= 0;
  else
    my_streak := 0;
    if random() < public.duel_clamp(0.25 + (me.esquiva - foe.esquiva) * 0.02, 0.05, 0.5) then
      v_dodged := true;
    else
      v_hits := 1;
      v_damage := greatest(1, round(foe.ataque * 0.5));
      my_hp := greatest(0, my_hp - v_damage);
    end if;
    v_target_hp := my_hp;
    v_over := my_hp <= 0;
  end if;

  insert into public.vocab_duel_moves (duel_id, player, q_index, correct, dodged, hits, damage, critical, target_hp)
  values (p_duel, v_uid, p_q, p_correct, v_dodged, v_hits, v_damage, v_crit and v_hits > 0, v_target_hp)
  returning * into v_move;

  if is_c then
    update public.vocab_duels set
      c_q = c_q + 1, c_last = now(), c_streak = my_streak, c_ok = c_ok + (case when p_correct then 1 else 0 end),
      c_hp = my_hp, o_hp = foe_hp,
      status = case when v_over then 'finished' else status end,
      winner = case when v_over then (case when foe_hp <= 0 then d.challenger else d.opponent end) else winner end,
      finish_reason = case when v_over then 'ko' else finish_reason end,
      finished_at = case when v_over then now() else finished_at end
    where id = p_duel;
  else
    update public.vocab_duels set
      o_q = o_q + 1, o_last = now(), o_streak = my_streak, o_ok = o_ok + (case when p_correct then 1 else 0 end),
      o_hp = my_hp, c_hp = foe_hp,
      status = case when v_over then 'finished' else status end,
      winner = case when v_over then (case when foe_hp <= 0 then d.opponent else d.challenger end) else winner end,
      finish_reason = case when v_over then 'ko' else finish_reason end,
      finished_at = case when v_over then now() else finished_at end
    where id = p_duel;
  end if;
  return v_move;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: rendirse
-- ---------------------------------------------------------------------------
create or replace function public.duel_forfeit(p_duel uuid)
returns public.vocab_duels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  v_row public.vocab_duels;
begin
  update public.vocab_duels set
    status = 'finished',
    winner = case when challenger = v_uid then opponent else challenger end,
    finish_reason = 'forfeit',
    finished_at = now()
  where id = p_duel and status = 'active' and v_uid in (challenger, opponent)
  returning * into v_row;
  if not found then
    raise exception 'not_active';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reclamar la victoria si el rival lleva 45 s sin responder
-- ---------------------------------------------------------------------------
create or replace function public.duel_claim_abandon(p_duel uuid)
returns public.vocab_duels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  v_row public.vocab_duels;
begin
  update public.vocab_duels set
    status = 'finished',
    winner = v_uid,
    finish_reason = 'abandon',
    finished_at = now()
  where id = p_duel and status = 'active' and v_uid in (challenger, opponent)
    and (case when challenger = v_uid then o_last else c_last end) < now() - interval '45 seconds'
  returning * into v_row;
  if not found then
    raise exception 'not_abandoned';
  end if;
  return v_row;
end;
$$;

revoke all on function public.duel_challenge(uuid, text, text) from public, anon;
revoke all on function public.duel_respond(uuid, boolean, text) from public, anon;
revoke all on function public.duel_cancel(uuid) from public, anon;
revoke all on function public.duel_answer(uuid, int, boolean) from public, anon;
revoke all on function public.duel_forfeit(uuid) from public, anon;
revoke all on function public.duel_claim_abandon(uuid) from public, anon;
grant execute on function public.duel_challenge(uuid, text, text) to authenticated;
grant execute on function public.duel_respond(uuid, boolean, text) to authenticated;
grant execute on function public.duel_cancel(uuid) to authenticated;
grant execute on function public.duel_answer(uuid, int, boolean) to authenticated;
grant execute on function public.duel_forfeit(uuid) to authenticated;
grant execute on function public.duel_claim_abandon(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sala de espera: canal privado de Realtime "vbg-lobby" (presencia) solo AAL2
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "vbg_lobby_read" on realtime.messages';
    execute $p$create policy "vbg_lobby_read" on realtime.messages
      for select to authenticated
      using ((select realtime.topic()) = 'vbg-lobby' and realtime.messages.extension in ('presence') and (select public.is_fully_authenticated()))$p$;
    execute 'drop policy if exists "vbg_lobby_write" on realtime.messages';
    execute $p$create policy "vbg_lobby_write" on realtime.messages
      for insert to authenticated
      with check ((select realtime.topic()) = 'vbg-lobby' and realtime.messages.extension in ('presence') and (select public.is_fully_authenticated()))$p$;
  end if;
end $$;
