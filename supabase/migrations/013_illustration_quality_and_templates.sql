alter table public.illustration_tasks
  add column if not exists quality_status text not null default 'unchecked'
    check (quality_status in ('unchecked', 'passed', 'warning')),
  add column if not exists quality_message text not null default '';

insert into public.illustration_market_items (title, task_type, subtitle, prompt_hint, visual_tone, thumb_url, sort_order)
values
  ('线索卡成品模板', 'clue', '卡框 / 标题 / 图文区', '竖向纸质线索卡成品，顶部标题栏，中部证物图，底部简短说明文字，必须像可打印卡片而不是单独物件图', '民国旧纸 / 暗调暖光 / 卡片构图 / 证物氛围', '', 20),
  ('留白封面模板', 'cover', '书封 / 平面排版', '竖版剧本封面成品，大面积留白，人物与核心意象服务标题排版，整体像书封而不是横向场景图', '水墨悬疑 / 暗调暖光 / 留白构图 / 封面氛围', '', 21),
  ('人物立绘模板', 'char', '单人 / 干净背景', '单人人物立绘，半身或全身，干净背景，五官、发型、服饰清晰，避免复杂场景和多人同框', '水墨悬疑 / 柔和侧光 / 居中构图 / 人物氛围', '', 22)
on conflict do nothing;
