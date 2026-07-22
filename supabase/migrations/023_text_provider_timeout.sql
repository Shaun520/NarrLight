update public.system_configs
set
  value = jsonb_set(
    jsonb_set(value, '{providers,deepseek,timeout}', '180'::jsonb, true),
    '{providers,glm,timeout}',
    '180'::jsonb,
    true
  ),
  updated_at = now()
where key = 'text_provider';
