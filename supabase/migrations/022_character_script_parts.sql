alter table public.character_scripts
  add column if not exists part_index integer not null default 1,
  add column if not exists part_label text not null default '完整玩家剧本',
  add column if not exists act_order integer;

alter table public.character_scripts
  drop constraint if exists character_scripts_script_id_character_id_key;

create unique index if not exists character_scripts_script_character_part_uidx
  on public.character_scripts(script_id, character_id, part_index);

create index if not exists idx_character_scripts_part
  on public.character_scripts(script_id, part_index);
