create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null unique check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

alter table public.players add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  symbol text not null,
  market text not null default 'TWSE',
  shares numeric not null check (shares > 0),
  avg_cost numeric not null check (avg_cost >= 0),
  current_price numeric not null check (current_price >= 0),
  created_at timestamptz not null default now()
);

create or replace function public.enforce_player_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.players) >= 15 then
    raise exception 'Player limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_player_limit on public.players;
create trigger trg_player_limit
before insert on public.players
for each row execute function public.enforce_player_limit();

alter table public.players enable row level security;
alter table public.holdings enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.players to anon, authenticated;
grant select on public.holdings to anon, authenticated;
grant insert, update, delete on public.players to authenticated;
grant insert, update, delete on public.holdings to authenticated;
revoke insert, update, delete on public.players from anon;
revoke insert, update, delete on public.holdings from anon;

drop policy if exists "public read players" on public.players;
drop policy if exists "public insert players" on public.players;
drop policy if exists "public update players" on public.players;
drop policy if exists "public delete players" on public.players;
drop policy if exists "owner insert player" on public.players;
drop policy if exists "owner update player" on public.players;
drop policy if exists "owner delete player" on public.players;

create policy "public read players" on public.players
for select using (true);

create policy "owner insert player" on public.players
for insert to authenticated
with check (user_id = auth.uid());

create policy "owner update player" on public.players
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "owner delete player" on public.players
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "public read holdings" on public.holdings;
drop policy if exists "public insert holdings" on public.holdings;
drop policy if exists "public update holdings" on public.holdings;
drop policy if exists "public delete holdings" on public.holdings;
drop policy if exists "owner insert holdings" on public.holdings;
drop policy if exists "owner update holdings" on public.holdings;
drop policy if exists "owner delete holdings" on public.holdings;

create policy "public read holdings" on public.holdings
for select using (true);

create policy "owner insert holdings" on public.holdings
for insert to authenticated
with check (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
);

create policy "owner update holdings" on public.holdings
for update to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
);

create policy "owner delete holdings" on public.holdings
for delete to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
);