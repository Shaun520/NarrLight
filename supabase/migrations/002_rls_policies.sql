-- 叙光 (NarrLight) - 行级安全 (RLS) 策略
-- 迁移版本: 002_rls_policies
-- 创建日期: 2026-06-27
-- 说明: 为 10 张子表启用 RLS，通过 script_id → scripts.author_id 联表
--       实现按作者授权的访问控制（scenes 表通过 act_id 联表）。
-- 依赖: 001_initial_schema.sql（users 与 scripts 的 RLS 已在其中启用）

-- ============================================================
-- characters（人物表）
-- ============================================================
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "characters_select" ON public.characters
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "characters_insert" ON public.characters
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "characters_update" ON public.characters
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "characters_delete" ON public.characters
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- acts（幕次表）
-- ============================================================
ALTER TABLE public.acts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acts_select" ON public.acts
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "acts_insert" ON public.acts
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "acts_update" ON public.acts
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "acts_delete" ON public.acts
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- scenes（场景表 - 通过 act_id → acts.script_id → scripts.author_id 联表）
-- ============================================================
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenes_select" ON public.scenes
  FOR SELECT USING (
    act_id IN (
      SELECT a.id FROM public.acts a
      JOIN public.scripts s ON a.script_id = s.id
      WHERE s.author_id = auth.uid()
    )
  );

CREATE POLICY "scenes_insert" ON public.scenes
  FOR INSERT WITH CHECK (
    act_id IN (
      SELECT a.id FROM public.acts a
      JOIN public.scripts s ON a.script_id = s.id
      WHERE s.author_id = auth.uid()
    )
  );

CREATE POLICY "scenes_update" ON public.scenes
  FOR UPDATE USING (
    act_id IN (
      SELECT a.id FROM public.acts a
      JOIN public.scripts s ON a.script_id = s.id
      WHERE s.author_id = auth.uid()
    )
  );

CREATE POLICY "scenes_delete" ON public.scenes
  FOR DELETE USING (
    act_id IN (
      SELECT a.id FROM public.acts a
      JOIN public.scripts s ON a.script_id = s.id
      WHERE s.author_id = auth.uid()
    )
  );

-- ============================================================
-- clues（线索卡表）
-- ============================================================
ALTER TABLE public.clues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clues_select" ON public.clues
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "clues_insert" ON public.clues
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "clues_update" ON public.clues
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "clues_delete" ON public.clues
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- character_relations（人物关系表）
-- ============================================================
ALTER TABLE public.character_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "character_relations_select" ON public.character_relations
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "character_relations_insert" ON public.character_relations
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "character_relations_update" ON public.character_relations
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "character_relations_delete" ON public.character_relations
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- timeline_events（时间线事件表）
-- ============================================================
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timeline_events_select" ON public.timeline_events
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "timeline_events_insert" ON public.timeline_events
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "timeline_events_update" ON public.timeline_events
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "timeline_events_delete" ON public.timeline_events
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- version_snapshots（版本快照表）
-- ============================================================
ALTER TABLE public.version_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "version_snapshots_select" ON public.version_snapshots
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "version_snapshots_insert" ON public.version_snapshots
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "version_snapshots_update" ON public.version_snapshots
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "version_snapshots_delete" ON public.version_snapshots
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- generation_tasks（AI 生成任务表）
-- ============================================================
ALTER TABLE public.generation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generation_tasks_select" ON public.generation_tasks
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "generation_tasks_insert" ON public.generation_tasks
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "generation_tasks_update" ON public.generation_tasks
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "generation_tasks_delete" ON public.generation_tasks
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- validation_reports（校验报告表）
-- ============================================================
ALTER TABLE public.validation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "validation_reports_select" ON public.validation_reports
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "validation_reports_insert" ON public.validation_reports
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "validation_reports_update" ON public.validation_reports
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "validation_reports_delete" ON public.validation_reports
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

-- ============================================================
-- difficulty_assessments（难度评估结果表）
-- ============================================================
ALTER TABLE public.difficulty_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "difficulty_assessments_select" ON public.difficulty_assessments
  FOR SELECT USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "difficulty_assessments_insert" ON public.difficulty_assessments
  FOR INSERT WITH CHECK (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "difficulty_assessments_update" ON public.difficulty_assessments
  FOR UPDATE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );

CREATE POLICY "difficulty_assessments_delete" ON public.difficulty_assessments
  FOR DELETE USING (
    script_id IN (SELECT id FROM public.scripts WHERE author_id = auth.uid())
  );
