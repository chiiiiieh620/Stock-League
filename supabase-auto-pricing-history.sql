-- Stock League: automatic pricing + weekly/monthly champion snapshots
-- Run this once in Supabase SQL Editor.

alter table public.holdings add column if not exists stock_name text;
alter table public.holdings alter column current_price set default 0;

create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('weekly','monthly')),
  period_key text not null,
  winner_player_id uuid not null references public.players(id) on delete cascade,
  winner_roi numeric not null,
  created_at timestamptz not null default now(),
  unique(period_type, period_key)
);

alter table public.ranking_snapshots enable row level security;
grant usage on schema public to service_role;
grant select, update on public.holdings to service_role;
grant select on public.players to service_role;
grant select, insert on public.ranking_snapshots to service_role;

grant select on public.ranking_snapshots to anon, authenticated;
revoke insert, update, delete on public.ranking_snapshots from anon, authenticated;

drop policy if exists "public read ranking snapshots" on public.ranking_snapshots;
create policy "public read ranking snapshots"
on public.ranking_snapshots
for select
using (true);

create or replace function public.capture_champion(p_period_type text, p_period_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winner uuid;
  v_roi numeric;
begin
  if p_period_type not in ('weekly','monthly') then
    raise exception 'Invalid period type';
  end if;

  if exists (
    select 1 from public.ranking_snapshots
    where period_type = p_period_type and period_key = p_period_key
  ) then
    return jsonb_build_object('status','exists');
  end if;

  select p.id,
         case when sum(h.shares * h.avg_cost) > 0
              then ((sum(h.shares * h.current_price) - sum(h.shares * h.avg_cost)) / sum(h.shares * h.avg_cost)) * 100
              else 0 end
    into v_winner, v_roi
  from public.players p
  left join public.holdings h on h.player_id = p.id
  group by p.id
  order by 2 desc, p.created_at asc
  limit 1;

  if v_winner is null then
    return jsonb_build_object('status','no_players');
  end if;

  insert into public.ranking_snapshots(period_type, period_key, winner_player_id, winner_roi)
  values (p_period_type, p_period_key, v_winner, coalesce(v_roi,0));

  return jsonb_build_object('status','created','winner_player_id',v_winner,'winner_roi',coalesce(v_roi,0));
end;
$$;

revoke all on function public.capture_champion(text,text) from public, anon, authenticated;
grant execute on function public.capture_champion(text,text) to service_role;

-- The scheduled GitHub job uses the Supabase service role key, updates prices,
-- then calls capture_champion. The unique(period_type, period_key) constraint
-- makes weekly/monthly snapshots idempotent.
