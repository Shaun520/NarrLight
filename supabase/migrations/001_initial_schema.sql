-- 叙光 (NarrLight) - 核心数据库 Schema
-- 迁移版本: 001_initial_schema
-- 创建日期: 2026-06-22

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  nickname VARCHAR(50) DEFAULT '',
  avatar_url TEXT DEFAULT NULL,
  free_quota_used INTEGER NOT NULL DEFAULT 0,
  free_quota_limit INTEGER NOT NULL DEFAULT 10,
  plan_type VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 用户只能查看和修改自己的数据
CREATE POLICY "用户可查看自己的数据" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "用户可更新自己的数据" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 剧本表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  genre VARCHAR(30) NOT NULL CHECK (genre IN ('hardcore','emotion','horror','funny','mechanism')),
  player_count INTEGER NOT NULL DEFAULT 6 CHECK (player_count BETWEEN 2 AND 12),
  duration_hours INTEGER NOT NULL DEFAULT 5 CHECK (duration_hours BETWEEN 1 AND 12),
  difficulty VARCHAR(20) NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner','intermediate','advanced')),
  background_setting VARCHAR(100) DEFAULT '',
  core_theme VARCHAR(200) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generating','completed','archived')),
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scripts_author ON public.scripts(author_id);
CREATE INDEX idx_scripts_status ON public.scripts(status);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "作者可管理自己的剧本" ON public.scripts
  FOR ALL USING (auth.uid() = author_id);

-- ============================================================
-- 人物表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  role_identity VARCHAR(100) DEFAULT '',
  gender VARCHAR(10) DEFAULT '' CHECK (gender IN ('male','female','unknown','')),
  age INTEGER DEFAULT NULL,
  personality TEXT DEFAULT '',
  background_story TEXT DEFAULT '',
  personal_task TEXT DEFAULT '',
  is_murderer BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_characters_script ON public.characters(script_id);

-- ============================================================
-- 幕次表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_acts_script ON public.acts(script_id);

-- ============================================================
-- 场景表（幕次下的具体场景）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id UUID NOT NULL REFERENCES public.acts(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  location VARCHAR(100) DEFAULT '',
  content TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenes_act ON public.scenes(act_id);

-- ============================================================
-- 线索卡表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  clue_type VARCHAR(30) NOT NULL DEFAULT 'physical'
    CHECK (clue_type IN ('physical','testimony','deep','hidden')),
  search_round INTEGER DEFAULT 1,
  location VARCHAR(100) DEFAULT '',
  related_character_ids UUID[] DEFAULT '{}',
  is_distractor BOOLEAN NOT NULL DEFAULT FALSE,
  is_key_clue BOOLEAN NOT NULL DEFAULT FALSE,
  unlock_condition TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clues_script ON public.clues(script_id);
CREATE INDEX idx_clues_type ON public.clues(clue_type);

-- ============================================================
-- 人物关系表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.character_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  source_character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  target_character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  relation_type VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (relation_type IN ('family','friend','lover','enemy','colleague','conspiracy','other')),
  label VARCHAR(100) NOT NULL DEFAULT '',
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_hidden_relation BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_label VARCHAR(100) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_relations_script ON public.character_relations(script_id);

-- ============================================================
-- 时间线事件表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  event_time VARCHAR(50) DEFAULT '',
  event_description TEXT NOT NULL,
  location VARCHAR(100) DEFAULT '',
  act_order INTEGER DEFAULT NULL,
  is_narrative_trick BOOLEAN NOT NULL DEFAULT FALSE,
  trick_type VARCHAR(30) DEFAULT ''
    CHECK (trick_type IN ('time','identity','perspective','other','')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timeline_script ON public.timeline_events(script_id);
CREATE INDEX idx_timeline_character ON public.timeline_events(character_id);

-- ============================================================
-- 版本快照表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.version_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL DEFAULT '{}',
  change_summary VARCHAR(500) DEFAULT '',
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_version_snapshots_script ON public.version_snapshots(script_id);

-- ============================================================
-- AI 生成任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  task_type VARCHAR(30) NOT NULL
    CHECK (task_type IN ('FULL_SCRIPT','CHARACTER_ADJUST','CLUE_MODIFY','TRICK_REPLACE','STYLE_CHANGE','COMPRESS','COMPLIANCE','ILLUSTRATION')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  params JSONB NOT NULL DEFAULT '{}',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  result_data JSONB DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gen_tasks_script ON public.generation_tasks(script_id);
CREATE INDEX idx_gen_tasks_status ON public.generation_tasks(status);

-- ============================================================
-- 校验报告表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.validation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  report_type VARCHAR(30) NOT NULL
    CHECK (report_type IN ('TIMELINE','LOGIC','DIFFICULTY','FULL')),
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('in_progress','completed','cancelled')),
  result_data JSONB NOT NULL DEFAULT '{}',
  issue_count_severe INTEGER NOT NULL DEFAULT 0,
  issue_count_warning INTEGER NOT NULL DEFAULT 0,
  issue_count_hint INTEGER NOT NULL DEFAULT 0,
  script_version_ref INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validation_reports_script ON public.validation_reports(script_id);

-- ============================================================
-- 难度评估结果表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.difficulty_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE UNIQUE,
  overall_score INTEGER NOT NULL DEFAULT 0,
  overall_level VARCHAR(20) DEFAULT ''
    CHECK (overall_level IN ('easy','normal','hard','extreme','')),
  clue_count INTEGER NOT NULL DEFAULT 0,
  distractor_ratio DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  trick_complexity INTEGER NOT NULL DEFAULT 0,
  genre_weighted_score INTEGER NOT NULL DEFAULT 0,
  detail_breakdown JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 自动更新时间戳触发器函数
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scripts_updated_at BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clues_updated_at BEFORE UPDATE ON public.clues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_difficulty_assessments_updated_at BEFORE UPDATE ON public.difficulty_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
