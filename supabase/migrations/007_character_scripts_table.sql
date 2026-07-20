-- 叙光 (NarrLight) - 角色剧本表迁移
-- 迁移版本: 007_character_scripts_table
-- 创建日期: 2026-07-11
-- 目的: 创建 character_scripts 表持久化阶段 2 角色剧本产出，并扩展 generation_tasks.task_type 枚举
-- 背景: 阶段 2（角色剧本）每个角色独立一次调用，需独立表存储每个角色的完整剧本

-- ============================================================
-- 角色剧本表 (character_scripts)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.character_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  act_scripts JSONB NOT NULL,
  personal_arc TEXT NOT NULL DEFAULT '',
  visible_clue_titles TEXT[] NOT NULL DEFAULT '{}',
  perspective_note TEXT NOT NULL DEFAULT '',
  is_murderer_script BOOLEAN NOT NULL DEFAULT FALSE,
  word_count INTEGER NOT NULL DEFAULT 0,
  generation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (generation_status IN ('pending','running','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(script_id, character_id)
);

CREATE INDEX idx_character_scripts_script ON public.character_scripts(script_id);
CREATE INDEX idx_character_scripts_character ON public.character_scripts(character_id);

-- ============================================================
-- 行级安全 (RLS)
-- ============================================================
ALTER TABLE public.character_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "作者可管理自己剧本的角色剧本" ON public.character_scripts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.scripts WHERE scripts.id = character_scripts.script_id AND scripts.author_id = auth.uid())
  );

-- ============================================================
-- 自动更新时间戳触发器（复用 001 中已定义的 update_updated_at_column 函数）
-- ============================================================
CREATE TRIGGER update_character_scripts_updated_at BEFORE UPDATE ON public.character_scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 扩展 generation_tasks.task_type CHECK 约束（新增 CHARACTER_SCRIPT）
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
