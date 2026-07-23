create table if not exists public.player_seats (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  seat_no integer not null,
  display_name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(script_id, seat_no)
);

create table if not exists public.player_identity_assignments (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  player_seat_id uuid not null references public.player_seats(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  identity_label text not null default '',
  identity_order integer not null default 1,
  reveal_stage text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(script_id, player_seat_id, identity_order)
);

alter table public.character_scripts
  add column if not exists player_seat_id uuid references public.player_seats(id) on delete set null,
  add column if not exists identity_assignment_id uuid references public.player_identity_assignments(id) on delete set null;

create index if not exists idx_player_seats_script
  on public.player_seats(script_id);

create index if not exists idx_player_identity_assignments_script
  on public.player_identity_assignments(script_id);

create index if not exists idx_player_identity_assignments_seat
  on public.player_identity_assignments(player_seat_id);

create index if not exists idx_character_scripts_player_seat
  on public.character_scripts(player_seat_id);

create index if not exists idx_character_scripts_identity_assignment
  on public.character_scripts(identity_assignment_id);

alter table public.player_seats enable row level security;
alter table public.player_identity_assignments enable row level security;

drop policy if exists "作者可管理自己剧本的玩家座位" on public.player_seats;
create policy "作者可管理自己剧本的玩家座位" on public.player_seats
  for all using (
    exists (select 1 from public.scripts where scripts.id = player_seats.script_id and scripts.author_id = auth.uid())
  );

drop policy if exists "作者可管理自己剧本的玩家身份分配" on public.player_identity_assignments;
create policy "作者可管理自己剧本的玩家身份分配" on public.player_identity_assignments
  for all using (
    exists (select 1 from public.scripts where scripts.id = player_identity_assignments.script_id and scripts.author_id = auth.uid())
  );

drop trigger if exists update_player_seats_updated_at on public.player_seats;
create trigger update_player_seats_updated_at before update on public.player_seats
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_player_identity_assignments_updated_at on public.player_identity_assignments;
create trigger update_player_identity_assignments_updated_at before update on public.player_identity_assignments
  for each row execute function public.update_updated_at_column();

insert into public.player_seats (script_id, seat_no, display_name)
select
  characters.script_id,
  characters.sort_order + 1,
  '玩家' || (characters.sort_order + 1)::text
from public.characters
on conflict (script_id, seat_no) do nothing;

insert into public.player_identity_assignments (
  script_id,
  player_seat_id,
  character_id,
  identity_label,
  identity_order
)
select
  characters.script_id,
  player_seats.id,
  characters.id,
  coalesce(nullif(characters.role_identity, ''), characters.name),
  greatest(1, coalesce(character_scripts.part_index, 1))
from public.characters
join public.player_seats
  on player_seats.script_id = characters.script_id
 and player_seats.seat_no = characters.sort_order + 1
left join public.character_scripts
  on character_scripts.script_id = characters.script_id
 and character_scripts.character_id = characters.id
on conflict (script_id, player_seat_id, identity_order) do nothing;

update public.character_scripts
set
  player_seat_id = resolved.player_seat_id,
  identity_assignment_id = resolved.identity_assignment_id
from (
  select
    character_scripts.id as character_script_id,
    player_seats.id as player_seat_id,
    player_identity_assignments.id as identity_assignment_id
  from public.character_scripts
  join public.characters
    on characters.id = character_scripts.character_id
   and characters.script_id = character_scripts.script_id
  join public.player_seats
    on player_seats.script_id = characters.script_id
   and player_seats.seat_no = characters.sort_order + 1
  join public.player_identity_assignments
    on player_identity_assignments.script_id = characters.script_id
   and player_identity_assignments.player_seat_id = player_seats.id
   and player_identity_assignments.character_id = characters.id
   and player_identity_assignments.identity_order = greatest(1, coalesce(character_scripts.part_index, 1))
) as resolved
where character_scripts.id = resolved.character_script_id
  and character_scripts.player_seat_id is null;
