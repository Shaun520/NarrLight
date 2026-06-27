/**
 * 概览页（视图1）
 *
 * 严格对齐原型 docs/prototype/workbench2.html #view-overview 结构：
 *   1. .resume-hero  继续创作英雄区（SVG 环形进度 + ri-pill + CTA + AI 建议）
 *   2. .stat-grid    4 张行动型统计卡
 *   3. .overview-grid 主区（工作流 + 侧栏待办/活动流）
 *   4. .quick-row    5 个快捷入口
 *
 * 服务端组件：调用 OverviewService 聚合数据，渲染子组件。
 * Layout 已注入 <div className="view active"> 包裹，本页直接输出概览结构。
 *
 * 性能优化（T418）：
 * - 通过 React `cache()` 共享 layout 已查的 `getUser()` 与 scripts 列表，
 *   避免重复 DB 往返（详见 `lib/queries/dashboard-queries.ts`）；
 * - 将 scripts 列表传入 `overviewService.getOverviewData(userId, scripts)`，
 *   使 service 跳过 scripts 表查询，仅查 validation_reports / generation_tasks。
 */
import { overviewService } from '@/lib/services/overview-service';
import { redirect } from 'next/navigation';
import {
  getCachedUser,
  getCachedScripts,
} from '@/lib/queries/dashboard-queries';
import { ResumeHero } from '@/components/overview/resume-hero';
import { StatCardList } from '@/components/overview/stat-card';
import { WorkflowList } from '@/components/overview/workflow-list';
import { TodoPanel } from '@/components/overview/todo-panel';
import { ActivityStream } from '@/components/overview/activity-stream';
import { QuickActions } from '@/components/overview/quick-actions';
import './overview.css';

/** 工作流 tabs：基于数据进行中/已完成/草稿计数 */
function buildWorkflowTabs(
  total: number,
  done: number,
  draft: number,
): { active?: boolean; label: string }[] {
  const inProgress = Math.max(0, total - done - draft);
  return [
    { active: true, label: `进行中 ${inProgress}` },
    { active: false, label: `已完成 ${done}` },
    { active: false, label: `草稿 ${draft}` },
  ];
}

export default async function OverviewPage() {
  // 复用 layout 已查的 user（React cache 命中，无重复 getUser 调用）
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  // 复用 layout 已查的 scripts 列表，传入 overviewService 跳过 scripts 表查询
  const scripts = await getCachedScripts(user.id);

  const data = await overviewService.getOverviewData(user.id, scripts);

  const todoTotal = data.todos.reduce((s, g) => s + g.count, 0);
  const doneCount = data.workflows.filter((w) => w.done).length;
  const draftCount = data.workflows.filter((w) => w.status === 'draft').length;
  const tabs = buildWorkflowTabs(data.workflows.length, doneCount, draftCount);

  return (
    <>
      {/* ===== 继续创作 · 英雄区 ===== */}
      <ResumeHero
        current={data.currentScript}
        aiSuggestion={data.aiSuggestion}
        todoCount={todoTotal}
      />

      {/* ===== 行动型统计 ===== */}
      <StatCardList cards={data.statCards} />

      {/* ===== 主区：工作流 + 侧栏 ===== */}
      <div className="overview-grid">
        <WorkflowList workflows={data.workflows} tabs={tabs} />

        <div className="overview-side">
          <TodoPanel groups={data.todos} total={todoTotal} />
          <ActivityStream activities={data.activities} />
        </div>
      </div>

      {/* ===== 快捷操作 ===== */}
      <QuickActions actions={data.quickActions} />
    </>
  );
}
