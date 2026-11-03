-- =============================================================================
-- Game Arcade + leaderboards
--
--   * arcade_games: catalogue of valid game ids and their run rules.
--   * arcade_runs: single-player (PvE) runs. The SERVER computes the score from
--     each answer (points, streak bonus, speed bonus, lives, time limit), so a
--     client can't post an arbitrary score. Clients have no write access.
--   * vocab_duels.game: duels (PvP) now work for every game.
--   * player_ratings: PvP Elo rating per game, updated by a trigger when a duel
--     finishes (clients can't write it).
--   * leaderboard_pve / leaderboard_pvp: top players (AAL2 only).
-- Limitation: whether an answer was correct is reported by the browser (the
-- question bank lives in the app), but pace, order, limits and scoring are
-- enforced here.
-- =============================================================================

create table if not exists public.arcade_games (
  id            text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  max_questions int not null default 20,
  time_limit_s  int not null default 900,
  lives         int not null default 3
);

alter table public.arcade_games enable row level security;
alter table public.arcade_games force row level security;
revoke all on public.arcade_games from anon, authenticated;
grant select on public.arcade_games to authenticated;
drop policy if exists "arcade_games_read" on public.arcade_games;
create policy "arcade_games_read" on public.arcade_games for select to authenticated using (true);

insert into public.arcade_games (id, max_questions, time_limit_s, lives) values
  ('boss', 600, 3600, 9999),
  ('meaning-match', 20, 900, 3),
  ('translate-it', 20, 900, 3),
  ('emoji-guess', 20, 900, 3),
  ('listen-pick', 20, 900, 3),
  ('listen-translate', 20, 900, 3),
  ('gap-fill', 20, 900, 3),
  ('true-false', 25, 900, 3),
  ('speed-sprint', 200, 60, 9999),
  ('spelling-bee', 15, 900, 3),
  ('word-scramble', 15, 900, 3),
  ('missing-letters', 15, 900, 3),
  ('sentence-builder', 12, 900, 3),
  ('dialogue-builder', 12, 900, 3),
  ('category-quiz', 20, 900, 3),
  ('odd-one-out', 20, 900, 3),
  ('first-letter', 15, 900, 3),
  ('hangman', 12, 900, 3),
  ('memory-pairs', 10, 900, 3),
  ('sentence-translate', 15, 900, 3),
  ('phrase-finder', 20, 900, 3),
  ('next-line', 15, 900, 3),
  ('reading-quiz', 15, 900, 3),
  ('topic-quiz', 15, 900, 3),
  ('glossary-hunt', 20, 900, 3),
  ('sound-match', 20, 900, 3),
  ('type-translation', 15, 900, 3),
  ('dictation-dash', 10, 900, 3),
  ('category-rush', 200, 60, 9999),
  ('sentence-meaning', 15, 900, 3),
  ('phrase-builder', 12, 900, 3)
on conflict (id) do update set
  max_questions = excluded.max_questions,
  time_limit_s = excluded.time_limit_s,
  lives = excluded.lives;

-- ---------------------------------------------------------------------------
-- PvE runs
-- ---------------------------------------------------------------------------
create table if not exists public.arcade_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  game         text not null references public.arcade_games (id),
  level        text not null check (level in ('a1', 'a2', 'b1', 'b2', 'c1', 'c2')),
  seed         int not null,
  score        int not null default 0,
  answered     int not null default 0,
  correct      int not null default 0,
  streak       int not null default 0,
  best_streak  int not null default 0,
  lives        int not null,
  status       text not null default 'active' check (status in ('active', 'finished')),
  started_at   timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists arcade_runs_board_idx on public.arcade_runs (game, level, score desc);
create index if not exists arcade_runs_user_idx on public.arcade_runs (user_id, status);

alter table public.arcade_runs enable row level security;
alter table public.arcade_runs force row level security;
revoke all on public.arcade_runs from anon, authenticated;
grant select on public.arcade_runs to authenticated;
drop policy if exists "arcade_runs_select_own" on public.arcade_runs;
create policy "arcade_runs_select_own" on public.arcade_runs
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_fully_authenticated()));

create or replace function public.run_start(p_game text, p_level text)
returns public.arcade_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  g public.arcade_games;
  r public.arcade_runs;
begin
  select * into g from public.arcade_games where id = p_game;
  if not found then
    raise exception 'invalid_game';
  end if;
  if p_level not in ('a1', 'a2', 'b1', 'b2', 'c1', 'c2') then
    raise exception 'invalid_level';
  end if;
  if (select count(*) from public.arcade_runs where user_id = v_uid and started_at > now() - interval '1 hour') >= 120 then
    raise exception 'rate_limited';
  end if;
  -- Only one active run per player.
  update public.arcade_runs set status = 'finished', finished_at = now()
    where user_id = v_uid and status = 'active';
  insert into public.arcade_runs (user_id, game, level, seed, lives)
  values (v_uid, p_game, p_level, floor(random() * 2147483647)::int, g.lives)
  returning * into r;
  return r;
end;
$$;

create or replace function public.run_answer(p_run uuid, p_q int, p_correct boolean)
returns public.arcade_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  r public.arcade_runs;
  g public.arcade_games;
  v_secs numeric;
  v_points int := 0;
  v_over boolean := false;
begin
  select * into r from public.arcade_runs where id = p_run and user_id = v_uid for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.status <> 'active' then
    raise exception 'not_active';
  end if;
  select * into g from public.arcade_games where id = r.game;
  -- Time limit (+3 s of network grace).
  if now() > r.started_at + make_interval(secs => g.time_limit_s + 3) then
    update public.arcade_runs set status = 'finished', finished_at = now() where id = p_run returning * into r;
    return r;
  end if;
  if p_q is distinct from r.answered then
    raise exception 'out_of_order';
  end if;
  v_secs := extract(epoch from (now() - r.last_at));
  if r.answered > 0 and v_secs < 0.6 then
    raise exception 'too_fast';
  end if;

  if p_correct then
    r.streak := r.streak + 1;
    -- 100 per answer + streak bonus (up to +100) + speed bonus (up to +50 within 10 s).
    v_points := 100 + 10 * least(r.streak - 1, 10) + greatest(0, 50 - floor(v_secs * 5)::int);
    r.correct := r.correct + 1;
    r.best_streak := greatest(r.best_streak, r.streak);
  else
    r.streak := 0;
    r.lives := r.lives - 1;
  end if;
  r.answered := r.answered + 1;
  v_over := r.lives <= 0 or r.answered >= g.max_questions;

  update public.arcade_runs set
    score = score + v_points,
    answered = r.answered,
    correct = r.correct,
    streak = r.streak,
    best_streak = r.best_streak,
    lives = r.lives,
    last_at = now(),
    status = case when v_over then 'finished' else 'active' end,
    finished_at = case when v_over then now() else null end
  where id = p_run
  returning * into r;
  return r;
end;
$$;

create or replace function public.run_finish(p_run uuid)
returns public.arcade_runs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
  r public.arcade_runs;
begin
  update public.arcade_runs set status = 'finished', finished_at = coalesce(finished_at, now())
    where id = p_run and user_id = v_uid
  returning * into r;
  if not found then
    raise exception 'not_found';
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- PvP for every game + Elo ratings
-- ---------------------------------------------------------------------------
alter table public.vocab_duels add column if not exists game text not null default 'boss';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_duels_game_fkey') then
    alter table public.vocab_duels add constraint vocab_duels_game_fkey foreign key (game) references public.arcade_games (id);
  end if;
end $$;

drop function if exists public.duel_challenge(uuid, text, text);
create or replace function public.duel_challenge(p_opponent uuid, p_level text, p_char text, p_game text default 'boss')
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
  if not exists (select 1 from public.arcade_games where id = p_game) then
    raise exception 'invalid_game';
  end if;
  v_opp_name := public.duel_username(p_opponent);
  if v_opp_name is null then
    raise exception 'invalid_opponent';
  end if;
  update public.vocab_duels set status = 'cancelled', finished_at = now()
    where challenger = v_uid and status = 'pending';
  if (select count(*) from public.vocab_duels where challenger = v_uid and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.vocab_duels (challenger, opponent, challenger_name, opponent_name, level, challenger_char, game)
  values (v_uid, p_opponent, public.duel_username(v_uid), v_opp_name, p_level, p_char, p_game)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.duel_challenge(uuid, text, text, text) from public, anon;
grant execute on function public.duel_challenge(uuid, text, text, text) to authenticated;

create table if not exists public.player_ratings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  game       text not null references public.arcade_games (id),
  rating     int not null default 1000,
  wins       int not null default 0,
  losses     int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table public.player_ratings enable row level security;
alter table public.player_ratings force row level security;
revoke all on public.player_ratings from anon, authenticated;
-- No direct access: read through leaderboard_pvp().

create or replace function public.duel_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loser uuid;
  ra int;
  rb int;
  ea numeric;
  delta int;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' and new.winner is not null then
    v_loser := case when new.winner = new.challenger then new.opponent else new.challenger end;
    insert into public.player_ratings (user_id, game) values (new.winner, new.game), (v_loser, new.game)
      on conflict do nothing;
    select rating into ra from public.player_ratings where user_id = new.winner and game = new.game for update;
    select rating into rb from public.player_ratings where user_id = v_loser and game = new.game for update;
    ea := 1 / (1 + power(10, (rb - ra) / 400.0));
    delta := greatest(1, round(32 * (1 - ea)));
    update public.player_ratings set rating = rating + delta, wins = wins + 1, updated_at = now()
      where user_id = new.winner and game = new.game;
    update public.player_ratings set rating = greatest(100, rating - delta), losses = losses + 1, updated_at = now()
      where user_id = v_loser and game = new.game;
  end if;
  return new;
end;
$$;
revoke all on function public.duel_rate() from public, anon, authenticated;

drop trigger if exists vocab_duels_rate on public.vocab_duels;
create trigger vocab_duels_rate after update of status on public.vocab_duels
  for each row execute function public.duel_rate();

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_pve(p_game text, p_level text, p_limit int default 20)
returns table (rank bigint, username text, score int, correct int, answered int, best_streak int, played_at timestamptz, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
begin
  return query
  with best as (
    select distinct on (r.user_id) r.user_id, r.score, r.correct, r.answered, r.best_streak, r.started_at
    from public.arcade_runs r
    where r.game = p_game and r.level = p_level and r.score > 0
    order by r.user_id, r.score desc, r.started_at
  )
  select rank() over (order by b.score desc), public.duel_username(b.user_id), b.score, b.correct, b.answered, b.best_streak,
         b.started_at, b.user_id = v_uid
  from best b
  order by b.score desc, b.started_at
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function public.leaderboard_pvp(p_game text, p_limit int default 20)
returns table (rank bigint, username text, rating int, wins int, losses int, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.duel_require_auth();
begin
  return query
  select rank() over (order by p.rating desc), public.duel_username(p.user_id), p.rating, p.wins, p.losses, p.user_id = v_uid
  from public.player_ratings p
  where p.game = p_game
  order by p.rating desc, p.wins desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke all on function public.run_start(text, text) from public, anon;
revoke all on function public.run_answer(uuid, int, boolean) from public, anon;
revoke all on function public.run_finish(uuid) from public, anon;
revoke all on function public.leaderboard_pve(text, text, int) from public, anon;
revoke all on function public.leaderboard_pvp(text, int) from public, anon;
grant execute on function public.run_start(text, text) to authenticated;
grant execute on function public.run_answer(uuid, int, boolean) to authenticated;
grant execute on function public.run_finish(uuid) to authenticated;
grant execute on function public.leaderboard_pve(text, text, int) to authenticated;
grant execute on function public.leaderboard_pvp(text, int) to authenticated;
