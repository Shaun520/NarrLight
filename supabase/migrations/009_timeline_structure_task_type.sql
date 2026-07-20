-- ============================================================
-- 目的: 扩展 generation_tasks.task_type 枚举，支持 timeline-structure 阶段
-- 变更: 在 008_phase3_tables.sql 基础上追加 TIMELINE_STRUCTURE
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
      'ACT_STRUCTURE',
      'CHARACTER_SCRIPT',
      'CLUES',
      'ORGANIZER_MANUAL',
      'TRUTH_REVIEW',
      'TIMELINE_STRUCTURE'
    ));
