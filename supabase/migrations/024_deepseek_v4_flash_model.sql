update public.system_configs
set
  value = jsonb_set(
    value,
    '{providers,deepseek,model}',
    '"deepseek-v4-flash"'::jsonb,
    true
  ),
  updated_at = now()
where key = 'text_provider'
  and value #>> '{providers,deepseek,model}' = 'deepseek-chat';
