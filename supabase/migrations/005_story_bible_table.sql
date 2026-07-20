-- 叙光 (NarrLight) - 设定本表迁移
-- 迁移版本: 002_story_bible_table
-- 创建日期: 2026-07-11
-- 目的: 创建 story_bibles 表持久化阶段 0 设定本产出，并扩展 generation_tasks.task_type 枚举

-- ============================================================
-- 设定本表 (story_bibles)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.story_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL UNIQUE REFERENCES public.scripts(id) ON DELETE CASCADE,
  murderer_character_name VARCHAR(50) NOT NULL,
  murder_method TEXT NOT NULL,
  core_trick TEXT NOT NULL,
  motive_chain TEXT NOT NULL,
  character_skeleton JSONB NOT NULL,
  timeline_outline TEXT NOT NULL,
  truth_summary TEXT NOT NULL,
  foreshadowing_plan JSONB NOT NULL DEFAULT '[]',
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_story_bibles_script ON public.story_bibles(script_id);

-- ============================================================
-- 行级安全 (RLS)
-- ============================================================
ALTER TABLE public.story_bibles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "作者可管理自己剧本的设定本" ON public.story_bibles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = story_bibles.script_id AND scripts.author_id = auth.uid())
  );

-- ============================================================
-- 自动更新时间戳触发器（复用 001 中已定义的 update_updated_at_column 函数）
-- ============================================================
CREATE TRIGGER update_story_bibles_updated_at BEFORE UPDATE ON public.story_bibles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 扩展 generation_tasks.task_type CHECK 约束（新增 STORY_BIBLE）
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
      'STORY_BIBLE'
    ));
