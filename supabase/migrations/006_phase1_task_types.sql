-- 叙光 (NarrLight) - 阶段 1 任务类型扩展
-- 迁移版本: 006_phase1_task_types
-- 创建日期: 2026-07-11
-- 目的: 扩展 generation_tasks.task_type CHECK 约束，新增 CHARACTER_PROFILES 与 ACT_STRUCTURE 枚举值
-- 背景: 阶段 1（人物设定 + 分幕结构）Edge Function 需要新的任务类型记录

-- ============================================================
-- 扩展 generation_tasks.task_type CHECK 约束
-- 在 005_story_bible_table.sql 已加入 STORY_BIBLE 的基础上，
-- 追加 CHARACTER_PROFILES 与 ACT_STRUCTURE 两个枚举值
-- ============================================================
ALTER TABLE public.generation_tasks
  DROP CONSTRAINT IF EXISTS generation_tasks_task_type_check;

ALTER TABLE public.generation_tasks
  ADD CONSTRAINT generation_tasks_task_type_check
    CHECK (task_type IN (
      'FULL_SCRIPT',
      'CHARACTER_ADJUST',
      'CLUE_MODIFY',
      'TRICK_REPLACE',
      'STYLE_CHANGE',
      'COMPRESS',
      'COMPLIANCE',
      'ILLUSTRATION',
      'STORY_BIBLE',
      'CHARACTER_PROFILES',
      'ACT_STRUCTURE'
    ));
