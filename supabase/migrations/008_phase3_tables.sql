-- 叙光 (NarrLight) - 阶段 3 表迁移
-- 迁移版本: 008_phase3_tables
-- 创建日期: 2026-07-11
-- 目的: 创建 organizer_manuals 与 truth_reviews 表，并扩展 generation_tasks.task_type 枚举
-- 背景: 阶段 3（线索卡 + 组织者手册 + 真相复盘）三个 Edge Function 并行产出
--       线索卡复用现有 clues 表，组织者手册与真相复盘需新建表

-- ============================================================
-- 组织者手册表 (organizer_manuals)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizer_manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL UNIQUE REFERENCES public.scripts(id) ON DELETE CASCADE,
  opening_flow JSONB NOT NULL,
  duration_control JSONB NOT NULL,
  pacing_hints TEXT NOT NULL DEFAULT '',
  npc_guide TEXT NOT NULL DEFAULT '',
  mechanism_rules TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizer_manuals_script ON public.organizer_manuals(script_id);

-- ============================================================
-- 行级安全 (RLS)
-- ============================================================
ALTER TABLE public.organizer_manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "作者可管理自己剧本的组织者手册" ON public.organizer_manuals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = organizer_manuals.script_id AND scripts.author_id = auth.uid())
  );

-- ============================================================
-- 自动更新时间戳触发器（复用 001 中已定义的 update_updated_at_column 函数）
-- ============================================================
CREATE TRIGGER update_organizer_manuals_updated_at BEFORE UPDATE ON public.organizer_manuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 真相复盘表 (truth_reviews)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.truth_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL UNIQUE REFERENCES public.scripts(id) ON DELETE CASCADE,
  full_summary TEXT NOT NULL,
  method_detail TEXT NOT NULL,
  motive_detail TEXT NOT NULL,
  character_endings JSONB NOT NULL DEFAULT '[]',
  foreshadowing_resolution JSONB NOT NULL DEFAULT '[]',
  timeline_full TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_truth_reviews_script ON public.truth_reviews(script_id);

-- ============================================================
-- 行级安全 (RLS)
-- ============================================================
ALTER TABLE public.truth_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "作者可管理自己剧本的真相复盘" ON public.truth_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = truth_reviews.script_id AND scripts.author_id = auth.uid())
  );

-- ============================================================
-- 自动更新时间戳触发器（复用 001 中已定义的 update_updated_at_column 函数）
-- ============================================================
CREATE TRIGGER update_truth_reviews_updated_at BEFORE UPDATE ON public.truth_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 扩展 generation_tasks.task_type CHECK 约束（新增 CLUES、ORGANIZER_MANUAL、TRUTH_REVIEW）
-- 在 007_character_scripts_table.sql 已加入 CHARACTER_SCRIPT 的基础上，
-- 追加 CLUES、ORGANIZER_MANUAL、TRUTH_REVIEW 三个枚举值
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
      'TRUTH_REVIEW'
    ));
