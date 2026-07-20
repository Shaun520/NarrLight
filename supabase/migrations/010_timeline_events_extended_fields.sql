-- ============================================================
-- 目的: 扩展 timeline_events 表，支持多维度时间线建模
-- 变更: 新增 5 个字段（day / event_type / participants / thread / causes）
-- 兼容: 所有字段带默认值，不破坏现有数据
-- 依赖: 001_initial_schema.sql 中的 timeline_events 表
-- ============================================================

-- 1. 事件所属日（1=第一天，2=第二天...），用于跨天剧本
ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS day INTEGER NOT NULL DEFAULT 1;

-- 2. 事件类型（normal/murder/search/flashback/monologue/revelation）
ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(30) NOT NULL DEFAULT 'normal'
    CHECK (event_type IN ('normal','murder','search','flashback','monologue','revelation'));

-- 3. 参与角色 name 数组（jsonb，主角仍在 character_id）
ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS participants JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. 叙事线（main=主线/subplot=支线/trick=诡计线）
ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS thread VARCHAR(30) NOT NULL DEFAULT 'main'
    CHECK (thread IN ('main','subplot','trick'));

-- 5. 前置事件引用数组（格式 `${day}-${time}-${characterName}`，jsonb）
ALTER TABLE public.timeline_events
  ADD COLUMN IF NOT EXISTS causes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 索引：按日查询优化
CREATE INDEX IF NOT EXISTS idx_timeline_day ON public.timeline_events(day);
-- 索引：按事件类型查询优化
CREATE INDEX IF NOT EXISTS idx_timeline_event_type ON public.timeline_events(event_type);
