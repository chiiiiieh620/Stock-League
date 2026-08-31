create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  symbol text not null,
  market text not null default 'TW',
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

drop policy if exists "public read players" on public.players;
create policy "public read players" on public.players for select using (true);

drop policy if exists "public insert players" on public.players;
create policy "public insert players" on public.players for insert with check (true);

drop policy if exists "public delete players" on public.players;
create policy "public delete players" on public.players for delete using (true);

drop policy if exists "public read holdings" on public.holdings;
create policy "public read holdings" on public.holdings for select using (true);

drop policy if exists "public insert holdings" on public.holdings;
create policy "public insert holdings" on public.holdings for insert with check (true);

drop policy if exists "public update holdings" on public.holdings;
create policy "public update holdings" on public.holdings for update using (true) with check (true);

drop policy if exists "public delete holdings" on public.holdings;
create policy "public delete holdings" on public.holdings for delete using (true);
