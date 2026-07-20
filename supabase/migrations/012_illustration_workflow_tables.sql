create table if not exists public.illustration_market_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  task_type text not null check (task_type in ('cover', 'scene', 'clue', 'public', 'char', 'poster')),
  subtitle text not null default '',
  prompt_hint text not null,
  visual_tone text not null default '',
  thumb_url text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.illustration_style_profiles (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  style_name text not null,
  visual_tone text not null,
  master_prompt text not null,
  reference_notes text not null default '',
  market_item_id uuid null references public.illustration_market_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id)
);

create table if not exists public.illustration_tasks (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  style_profile_id uuid not null references public.illustration_style_profiles(id) on delete cascade,
  asset_id uuid null references public.illustration_assets(id) on delete set null,
  market_item_id uuid null references public.illustration_market_items(id) on delete set null,
  task_key text not null,
  task_type text not null check (task_type in ('cover', 'scene', 'clue', 'public', 'char', 'poster')),
  source_type text not null default '',
  source_id text not null default '',
  title text not null,
  subtitle text not null default '',
  prompt text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress_percent integer not null default 0,
  sort_order integer not null default 0,
  selected_model text not null default 'openai',
  selected_ratio text not null default '16:9',
  selected_count integer not null default 1,
  result_image_url text not null default '',
  error_message text not null default '',
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id, task_key),
  unique (asset_id)
);

create index if not exists illustration_market_items_active_sort_idx
  on public.illustration_market_items (is_active, sort_order);

create index if not exists illustration_style_profiles_script_idx
  on public.illustration_style_profiles (script_id);

create index if not exists illustration_tasks_script_sort_idx
  on public.illustration_tasks (script_id, sort_order);

create index if not exists illustration_tasks_script_status_idx
  on public.illustration_tasks (script_id, status);

create unique index if not exists illustration_assets_script_source_key
  on public.illustration_assets (script_id, source_type, source_id);

insert into public.illustration_market_items (title, task_type, subtitle, prompt_hint, visual_tone, thumb_url, sort_order)
values
  ('雨夜码头氛围', 'scene', '适合港口、旧镇、潮湿夜景', '雨夜中的码头与远处灯火，强调潮湿空气、木箱、反光水面和压迫感', '水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围', '', 1),
  ('旧报纸证据', 'clue', '适合线索卡和证物特写', '泛黄旧报纸、折痕、边角污渍和放大后的文字细节，突出证据感', '水墨古风 / 暗调暖光 / 留白构图 / 悬疑氛围', '', 2),
  ('人物半身立绘', 'char', '适合角色一致性立绘', '半身人物立绘，保持五官、发型、服装与气质统一，适合多表情延展', '水墨古风 / 暗调暖光 / 留白构图 / 人物氛围', '', 3),
  ('全剧海报', 'poster', '适合剧本宣传图', '强调标题留白、强视觉中心和悬疑冲击力，形成整剧宣传海报', '水墨古风 / 暗调暖光 / 留白构图 / 宣传氛围', '', 4)
on conflict do nothing;
