create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null check (
    category in (
      'structure_rule',
      'character_pattern',
      'clue_pattern',
      'timeline_pattern',
      'dm_flow_rule',
      'anti_novelization_rule',
      'quality_metric',
      'anti_pattern'
    )
  ),
  module_type text not null default 'case_core' check (
    module_type in (
      'case_core',
      'characters',
      'clues',
      'acts',
      'player_script',
      'dm_manual',
      'truth_review',
      'quality_check'
    )
  ),
  stage text not null check (
    stage in (
      'brief',
      'case_core',
      'characters',
      'clues',
      'acts',
      'player_script',
      'dm_manual',
      'review'
    )
  ),
  genre text null check (
    genre is null or genre in ('hardcore','emotion','horror','funny','mechanism')
  ),
  player_count_min integer null check (player_count_min is null or player_count_min between 1 and 12),
  player_count_max integer null check (player_count_max is null or player_count_max between 1 and 12),
  difficulty text null check (
    difficulty is null or difficulty in ('beginner','intermediate','advanced','expert')
  ),
  enabled boolean not null default true,
  weight integer not null default 100,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_items_player_range_check check (
    player_count_min is null
    or player_count_max is null
    or player_count_min <= player_count_max
  )
);

create index if not exists idx_knowledge_items_stage_enabled
  on public.knowledge_items(stage, enabled, weight desc, updated_at desc);
create index if not exists idx_knowledge_items_category
  on public.knowledge_items(category);

alter table public.knowledge_items enable row level security;

drop policy if exists "authenticated users can read enabled knowledge items" on public.knowledge_items;
create policy "authenticated users can read enabled knowledge items"
  on public.knowledge_items
  for select
  using (enabled = true and auth.uid() is not null);

create table if not exists public.generation_knowledge_usages (
  id uuid primary key default gen_random_uuid(),
  generation_task_id uuid null references public.generation_tasks(id) on delete set null,
  script_id uuid null references public.scripts(id) on delete cascade,
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  stage text not null,
  module_type text not null,
  usage_reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_generation_knowledge_usages_task
  on public.generation_knowledge_usages(generation_task_id);
create index if not exists idx_generation_knowledge_usages_script
  on public.generation_knowledge_usages(script_id, created_at desc);

alter table public.generation_knowledge_usages enable row level security;

create table if not exists public.generation_quality_reports (
  id uuid primary key default gen_random_uuid(),
  generation_task_id uuid null references public.generation_tasks(id) on delete set null,
  script_id uuid null references public.scripts(id) on delete cascade,
  stage text not null,
  module_type text not null,
  score integer not null check (score between 0 and 100),
  risk_level text not null check (risk_level in ('low','medium','high')),
  issues jsonb not null default '[]',
  rewrite_required boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_generation_quality_reports_task
  on public.generation_quality_reports(generation_task_id);
create index if not exists idx_generation_quality_reports_script
  on public.generation_quality_reports(script_id, created_at desc);

alter table public.generation_quality_reports enable row level security;
