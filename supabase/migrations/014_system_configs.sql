-- 系统配置表：由 admin 端写入，web 端只读消费
-- 仅存放非敏感运行时配置：主/备用模型、启用开关、重试次数、超时等
-- 敏感凭据（API Key）继续使用环境变量，不写入本表
create table if not exists public.system_configs (
  key varchar(100) primary key,
  value jsonb not null default '{}'::jsonb,
  description text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.system_configs enable row level security;

-- web 端服务端通过 service role client 绕过 RLS 读取，不开放前端访问策略
-- admin 端通过 service role client 绕过 RLS 写入

-- 初始化默认配置（仅当表为空时插入）
insert into public.system_configs (key, value, description)
values
  (
    'text_provider',
    '{
      "primary": "deepseek",
      "fallback": "glm",
      "providers": {
        "deepseek": { "enabled": true, "model": "deepseek-chat", "timeout": 60, "retries": 2 },
        "glm": { "enabled": true, "model": "glm-5.1", "timeout": 60, "retries": 2 }
      }
    }'::jsonb,
    '文本生成 provider 路由（剧本生成 / 校验 / 润色）'
  ),
  (
    'image_provider',
    '{
      "primary": "openai-image",
      "fallback": "seedream",
      "providers": {
        "openai-image": { "enabled": true, "model": "gpt-image-1.5", "size": "1024x1024", "timeout": 60, "retries": 3 },
        "seedream": { "enabled": true, "model": "", "size": "1024x1024", "timeout": 60, "retries": 3 },
        "glm": { "enabled": true, "model": "cogview-3-plus", "size": "1024x1024", "timeout": 60, "retries": 3 }
      }
    }'::jsonb,
    '插画生成 provider 路由（封面 / 场景 / 线索卡 / 人物）'
  ),
  (
    'content_safety',
    '{
      "enabled": true,
      "manual_review": false
    }'::jsonb,
    '内容安全开关与人工复核策略'
  ),
  (
    'quota_defaults',
    '{
      "free_quota_limit": 10,
      "pro_monthly_quota": 500,
      "max_script_words": 150000
    }'::jsonb,
    '配额默认值（新用户与各套餐）'
  )
on conflict (key) do nothing;
