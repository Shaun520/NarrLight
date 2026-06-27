/**
 * 概览页数据聚合服务
 *
 * 聚合当前剧本的进度、统计、工作流、待办、活动流，提供给概览页
 * （`app/(dashboard)/page.tsx`）渲染。
 *
 * 数据来源：scripts、validation_reports、generation_tasks 三张表。
 * 开发期允许返回与原型一致的 Mock 数据，避免空库场景下页面空白。
 *
 * 设计要点：
 * - 服务端方法（getOverviewData）通过动态导入 @/lib/supabase/server
 *   获取客户端，避免 next/headers 被打包进客户端 bundle（对齐
 *   generation-task-service.ts 的写法）；
 * - 当用户尚无剧本或聚合失败时，回落到 Mock 数据，保证页面可渲染。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/types';
import type { Script } from '@/types';

/* ============================================================
 * 类型定义
 * ============================================================ */

/** 工作流卡状态（与原型 .status-tag st-* 对齐） */
export type WorkflowStatus = 'valid' | 'gen' | 'draft' | 'done';

/** 统计卡图标色系（与原型 .stat-icon.si-* 对齐） */
export type StatIconKind = 'err' | 'warn' | 'ok' | 'info';

/** 待办分组类别 */
export type TodoKind = 'time' | 'logic' | 'foreshadow';

/** 活动流类别（与原型 .ac-dot 类名对齐） */
export type ActivityKind = 'edit' | 'ai' | 'check' | 'done' | 'gen';

/** 快捷入口图标 key */
export type QuickActionIcon = 'generate' | 'timeline' | 'logic' | 'clues' | 'illust';

/** 继续创作英雄区当前剧本信息 */
export interface OverviewCurrentScript {
  id: string | null;
  title: string;
  /** 类型 / 人数 / 时长 拼接，例：硬核 · 古风 · 6人 · 5h */
  genre: string;
  /** 当前所在幕次，例：第二幕 · 公共搜证 */
  stage: string;
  /** 编辑器定位描述（含段名），例：正在编辑：第二幕 · 公共搜证 · 第3段「药铺后院」 */
  location: string;
  /** 上次编辑时间展示串，例：14:32 */
  lastEditedAt: string;
  /** 上次编辑副标，例：上次编辑于 14:32 · 自动保存 */
  lastEditedTag: string;
  /** 完成度百分比 0-100 */
  progress: number;
  /** 英雄区右侧四枚 ri-pill 的展示信息 */
  issuePills: {
    kind: 'err' | 'warn' | 'ok';
    count: number;
    label: string;
    /** 点击跳转，不传则不可点 */
    href?: string;
  }[];
  /** 继续写作跳转地址 */
  editorHref: string;
  /** "先处理待办" 跳转地址 */
  todoHref: string;
}

/** 统计概览：聚合数（用于 ri-pill/徽标等场景） */
export interface OverviewStats {
  errors: number;
  warnings: number;
  success: number;
  info: number;
}

/** 行动型统计卡数据 */
export interface OverviewStatCard {
  icon: StatIconKind;
  label: string;
  value: string;
  /** 数值右侧的小字单位，如 "项" / "%" */
  unit?: string;
  /** 趋势行（默认绿色，trendDown=true 显示朱砂红） */
  trend: string;
  trendDown?: boolean;
  href: string;
}

/** 工作流剧本卡 */
export interface OverviewWorkflowCard {
  id: string;
  title: string;
  /** 类型短描述，例：硬核 · 古风 */
  genre: string;
  status: WorkflowStatus;
  /** 状态标签中文，例：校验中 / 生成中 / 草稿 / 已完成 */
  statusLabel: string;
  /** 进度百分比 0-100 */
  progress: number;
  /** 当前阶段描述，例：第二幕 · 公共搜证 */
  stage: string;
  /** 待办计数描述 */
  issues: {
    dotClass: 'err' | 'warn' | 'ok';
    label: string;
  };
  /** 人数 / 时长 · 版本 拼接 */
  meta: string;
  /** 更新时间展示串 */
  updatedAt: string;
  /** 是否已完成 */
  done: boolean;
  /** 点击跳转编辑器 */
  href: string;
}

/** 单条待办 */
export interface OverviewTodoItem {
  scriptTitle: string;
  description: string;
  href: string;
}

/** 待办分组 */
export interface OverviewTodoGroup {
  kind: TodoKind;
  /** 分组标题，例：时间冲突 / 逻辑漏洞 / 伏笔悬挂 */
  label: string;
  /** 圆点色（与 .dot 类名对齐） */
  dotClass: 'err' | 'warn';
  count: number;
  items: OverviewTodoItem[];
}

/** 活动流单条：textBefore + bold + textAfter 拼接为完整文案 */
export interface OverviewActivity {
  kind: ActivityKind;
  textBefore: string;
  /** 中间加粗片段 */
  bold: string;
  textAfter: string;
  /** 时间展示串，例：今日 14:32 · 自动保存 v3 */
  time: string;
}

/** AI 下一步建议卡 */
export interface OverviewAiSuggestion {
  tip: string;
  /** "应用建议" 跳转地址 */
  applyHref: string;
}

/** 快捷入口 */
export interface OverviewQuickAction {
  icon: QuickActionIcon;
  title: string;
  desc: string;
  href: string;
}

/** 概览页聚合数据 */
export interface OverviewData {
  currentScript: OverviewCurrentScript;
  progress: number;
  stats: OverviewStats;
  statCards: OverviewStatCard[];
  workflows: OverviewWorkflowCard[];
  todos: OverviewTodoGroup[];
  activities: OverviewActivity[];
  aiSuggestion: OverviewAiSuggestion;
  quickActions: OverviewQuickAction[];
}

/* ============================================================
 * Mock 数据（开发期 / 空库回落）
 * 与原型 docs/prototype/workbench2.html #view-overview 一致
 * ============================================================ */

/** 空库场景的安全跳转：所有 Mock 编辑器链接统一指向新建剧本页，避免 /editor/mock-* 404 */
const MOCK_EDITOR_BASE = '/scripts/new';

const MOCK_DATA: OverviewData = {
  currentScript: {
    id: 'mock-current',
    title: '古镇迷案',
    genre: '硬核 · 古风 · 6人 · 5h',
    stage: '第二幕 · 公共搜证',
    location: '正在编辑：第二幕 · 公共搜证 · 第3段「药铺后院」',
    lastEditedAt: '14:32',
    lastEditedTag: '▸ 上次编辑于 14:32 · 自动保存',
    progress: 68,
    issuePills: [
      { kind: 'err', count: 3, label: '时间冲突', href: `${MOCK_EDITOR_BASE}` },
      { kind: 'err', count: 2, label: '逻辑漏洞', href: `${MOCK_EDITOR_BASE}` },
      { kind: 'warn', count: 1, label: '伏笔悬挂' },
      { kind: 'ok', count: 42, label: '线索卡就绪' },
    ],
    editorHref: MOCK_EDITOR_BASE,
    todoHref: `${MOCK_EDITOR_BASE}`,
  },
  progress: 68,
  stats: { errors: 3, warnings: 1, success: 42, info: 0 },
  statCards: [
    {
      icon: 'err',
      label: '待处理问题',
      value: '6',
      unit: '项',
      trend: '3 时间冲突 · 2 逻辑漏洞 · 1 伏笔',
      trendDown: true,
      href: `${MOCK_EDITOR_BASE}`,
    },
    {
      icon: 'warn',
      label: '今日待办',
      value: '3',
      unit: '项',
      trend: '补全药铺线索 · 修复时序 · 复盘定稿',
      href: MOCK_EDITOR_BASE,
    },
    {
      icon: 'ok',
      label: '本月已交付',
      value: '2',
      unit: '部',
      trend: '▲ 雾港夜话 · 长安十二时辰谜',
      href: MOCK_EDITOR_BASE,
    },
    {
      icon: 'info',
      label: '平均完成度',
      value: '64',
      unit: '%',
      trend: '▲ 较上周 +12%',
      href: MOCK_EDITOR_BASE,
    },
  ],
  workflows: [
    {
      id: 'mock-1',
      title: '古镇迷案',
      genre: '硬核 · 古风',
      status: 'valid',
      statusLabel: '校验中',
      progress: 68,
      stage: '第二幕 · 公共搜证',
      issues: { dotClass: 'err', label: '6 待处理' },
      meta: '6人 / 5h · v3',
      updatedAt: '14:32',
      done: false,
      href: MOCK_EDITOR_BASE,
    },
    {
      id: 'mock-2',
      title: '第七个房客',
      genre: '恐怖 · 现代',
      status: 'gen',
      statusLabel: '生成中',
      progress: 42,
      stage: '第一幕 · 人物剧本',
      issues: { dotClass: 'warn', label: '1 待确认' },
      meta: '6人 / 4.5h · v2',
      updatedAt: '1 周前',
      done: false,
      href: MOCK_EDITOR_BASE,
    },
    {
      id: 'mock-3',
      title: '雨夜来客',
      genre: '欢乐 · 现代',
      status: 'draft',
      statusLabel: '草稿',
      progress: 18,
      stage: '参数设定',
      issues: { dotClass: 'ok', label: '无待办' },
      meta: '7人 / 4h · v1',
      updatedAt: '3 周前',
      done: false,
      href: MOCK_EDITOR_BASE,
    },
    {
      id: 'mock-4',
      title: '雾港夜话',
      genre: '情感 · 民国',
      status: 'done',
      statusLabel: '已完成',
      progress: 100,
      stage: '已交付店家',
      issues: { dotClass: 'ok', label: '无待办' },
      meta: '5人 / 4h · v1',
      updatedAt: '5 天前',
      done: true,
      href: MOCK_EDITOR_BASE,
    },
    {
      id: 'mock-5',
      title: '长安十二时辰谜',
      genre: '机制 · 古风',
      status: 'done',
      statusLabel: '已完成',
      progress: 100,
      stage: '已交付店家',
      issues: { dotClass: 'ok', label: '无待办' },
      meta: '8人 / 6h · v4',
      updatedAt: '2 周前',
      done: true,
      href: MOCK_EDITOR_BASE,
    },
  ],
  todos: [
    {
      kind: 'time',
      label: '时间冲突',
      dotClass: 'err',
      count: 3,
      items: [
        { scriptTitle: '古镇迷案', description: '沈墨白分身两地', href: `${MOCK_EDITOR_BASE}` },
        { scriptTitle: '古镇迷案', description: '沈墨尘时序倒置', href: `${MOCK_EDITOR_BASE}` },
        { scriptTitle: '古镇迷案', description: '柳如烟行踪矛盾', href: `${MOCK_EDITOR_BASE}` },
      ],
    },
    {
      kind: 'logic',
      label: '逻辑漏洞',
      dotClass: 'err',
      count: 2,
      items: [
        { scriptTitle: '古镇迷案', description: '朱砂私章未回收', href: `${MOCK_EDITOR_BASE}` },
        { scriptTitle: '古镇迷案', description: '乌头碱手法硬伤', href: `${MOCK_EDITOR_BASE}` },
      ],
    },
    {
      kind: 'foreshadow',
      label: '伏笔悬挂',
      dotClass: 'warn',
      count: 1,
      items: [
        { scriptTitle: '第七个房客', description: '204 房客身份未揭示', href: `${MOCK_EDITOR_BASE}` },
      ],
    },
  ],
  activities: [
    { kind: 'edit', textBefore: '编辑了 ', bold: '古镇迷案 · 第二幕', textAfter: '', time: '今日 14:32 · 自动保存 v3' },
    { kind: 'ai', textBefore: 'AI 补全 ', bold: '柳如烟童年背景', textAfter: '', time: '昨日 21:08 · v2 → v3' },
    { kind: 'check', textBefore: '时间线校验发现 ', bold: '3 处冲突', textAfter: '', time: '昨日 20:46' },
    { kind: 'done', textBefore: '交付 ', bold: '雾港夜话', textAfter: ' 至店家', time: '5 天前' },
    { kind: 'gen', textBefore: 'AI 生成 ', bold: '第七个房客', textAfter: ' 初版', time: '1 周前 · 18,420 字' },
  ],
  aiSuggestion: {
    tip: '检测到「药铺后院」线索密度偏低，建议补充周半仙深夜目击沈墨尘的口供，强化凶手行为链与时间线闭环。',
    applyHref: MOCK_EDITOR_BASE,
  },
  quickActions: [
    { icon: 'generate', title: '一键生成全本', desc: '题材参数 → 完整结构化剧本', href: '/generate' },
    { icon: 'timeline', title: '时间线冲突排查', desc: '可视化时间轴 · 自动标注矛盾', href: MOCK_EDITOR_BASE },
    { icon: 'logic', title: '逻辑闭环校验', desc: '伏笔回收 · 动机 · 诡计可行性', href: MOCK_EDITOR_BASE },
    { icon: 'clues', title: '导出线索卡 PDF', desc: '批量出图 · 店家可直接打印开本', href: MOCK_EDITOR_BASE },
    { icon: 'illust', title: '生成场景插画', desc: '多模型对比 · 自动套用视觉基调', href: MOCK_EDITOR_BASE },
  ],
};

/**
 * 快捷入口子路径映射：真实数据场景下与 editorBase 拼接为完整编辑器子页地址。
 * generate 不依赖 scriptId，单独处理；其余四项对应编辑器四个子功能页。
 */
const QA_SUB_PATH: Record<Exclude<QuickActionIcon, 'generate'>, string> = {
  timeline: '/timeline',
  logic: '/validation',
  clues: '/clues',
  illust: '/illustrations',
};

/* ============================================================
 * 工具：DB 行映射
 * ============================================================ */

interface ScriptRow {
  id: string;
  author_id: string;
  title: string;
  genre: 'hardcore' | 'emotion' | 'horror' | 'funny' | 'mechanism';
  player_count: number;
  duration_hours: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  status: 'draft' | 'generating' | 'completed' | 'archived';
  word_count: number;
  created_at: string;
  updated_at: string;
}

interface ValidationReportRow {
  id: string;
  script_id: string;
  report_type: 'TIMELINE' | 'LOGIC' | 'DIFFICULTY' | 'FULL';
  status: 'in_progress' | 'completed' | 'cancelled';
  issue_count_severe: number;
  issue_count_warning: number;
  issue_count_hint: number;
  created_at: string;
}

interface GenerationTaskRow {
  id: string;
  script_id: string;
  task_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  result_data: Json | null;
}

const GENRE_LABEL: Record<ScriptRow['genre'], string> = {
  hardcore: '硬核',
  emotion: '情感',
  horror: '恐怖',
  funny: '欢乐',
  mechanism: '机制',
};

const DIFFICULTY_LABEL: Record<ScriptRow['difficulty'], string> = {
  beginner: '新手',
  intermediate: '进阶',
  advanced: '高阶',
};

/** 根据剧本状态映射为工作流状态 */
function mapWorkflowStatus(status: ScriptRow['status']): {
  status: WorkflowStatus;
  statusLabel: string;
} {
  switch (status) {
    case 'generating':
      return { status: 'gen', statusLabel: '生成中' };
    case 'completed':
      return { status: 'done', statusLabel: '已完成' };
    case 'archived':
      return { status: 'done', statusLabel: '已归档' };
    case 'draft':
    default:
      return { status: 'draft', statusLabel: '草稿' };
  }
}

/** 将 ISO 时间转为简短展示串（当日显示 HH:mm，否则显示相对天数） */
function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 14) return '1 周前';
  if (diffDays < 21) return '2 周前';
  if (diffDays < 28) return '3 周前';
  return `${Math.floor(diffDays / 7)} 周前`;
}

/** 简单进度估算：word_count 与目标字数（默认 30000）比值，截到 0-100 */
function estimateProgress(wordCount: number, target = 30000): number {
  if (!wordCount) return 0;
  return Math.max(0, Math.min(100, Math.round((wordCount / target) * 100)));
}

/* ============================================================
 * Service
 * ============================================================ */

export class OverviewService {
  /**
   * 聚合概览页数据
   *
   * 当前实现：尝试读取用户最新剧本，若库为空或读取失败则回落到 Mock 数据。
   * 实际聚合（统计 / 待办 / 活动流）在数据落地后扩展，目前以 Mock 占位。
   *
   * @param userId  当前登录用户 ID
   * @param scripts 可选：外部已加载的剧本列表（如来自 layout / Context）。
   *                传入时跳过 scripts 表查询，避免重复 DB 往返；
   *                未传入时自行查询（兼容旧调用）。
   */
  async getOverviewData(userId: string, scripts?: Script[]): Promise<OverviewData> {
    try {
      const supabase = await this.getServerClient();

      // 1) 剧本列表：优先复用外部传入数据，避免与 layout 重复查询 scripts 表
      let scriptRows: ScriptRow[];
      if (scripts) {
        if (scripts.length === 0) return MOCK_DATA;
        scriptRows = scripts.map((s) => ({
          id: s.id,
          author_id: s.authorId,
          title: s.title,
          genre: s.genre,
          player_count: s.playerCount,
          duration_hours: s.durationHours,
          // ScriptDifficulty 含 'expert'，ScriptRow 暂未收录；沿用 cast 与 DB 路径保持一致
          difficulty: s.difficulty as ScriptRow['difficulty'],
          status: s.status,
          word_count: s.wordCount,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        }));
      } else {
        const { data: rows, error: sErr } = await supabase
          .from('scripts')
          .select(
            'id, author_id, title, genre, player_count, duration_hours, difficulty, status, word_count, created_at, updated_at',
          )
          .eq('author_id', userId)
          .order('updated_at', { ascending: false });

        if (sErr || !rows || rows.length === 0) {
          return MOCK_DATA;
        }
        scriptRows = rows as unknown as ScriptRow[];
      }

      const current = scriptRows[0];

      // 2) 并行读取校验报告与生成任务
      const scriptIds = scriptRows.map((s) => s.id);
      const [validationRes, taskRes] = await Promise.all([
        supabase
          .from('validation_reports')
          .select('id, script_id, report_type, status, issue_count_severe, issue_count_warning, issue_count_hint, created_at')
          .in('script_id', scriptIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('generation_tasks')
          .select('id, script_id, task_type, status, progress_percent, started_at, completed_at, created_at, result_data')
          .in('script_id', scriptIds)
          .order('created_at', { ascending: false }),
      ]);

      const reports = (validationRes.data ?? []) as unknown as ValidationReportRow[];
      const tasks = (taskRes.data ?? []) as unknown as GenerationTaskRow[];

      return this.compose(current, scriptRows, reports, tasks);
    } catch {
      // 任意异常回落 Mock，保证页面可渲染
      return MOCK_DATA;
    }
  }

  /** 由原始行组装 OverviewData；当前剧本无校验/任务信息时仍回落 Mock 占位 */
  private compose(
    current: ScriptRow,
    scripts: ScriptRow[],
    reports: ValidationReportRow[],
    tasks: GenerationTaskRow[],
  ): OverviewData {
    const editorBase = `/editor/${current.id}`;

    // 当前剧本的进度估算
    const progress = estimateProgress(current.word_count);

    // 当前剧本的校验报告聚合（取最新一份）
    const currentReports = reports.filter((r) => r.script_id === current.id);
    const latestReport = currentReports[0];
    const errors = latestReport ? latestReport.issue_count_severe : 0;
    const warnings = latestReport ? latestReport.issue_count_warning : 0;
    const hints = latestReport ? latestReport.issue_count_hint : 0;

    // ri-pill: 时间冲突（TIMELINE severe）/ 逻辑漏洞（LOGIC severe）/ 伏笔悬挂（warning）/ 线索卡就绪（占位）
    const timelineErrors = currentReports
      .filter((r) => r.report_type === 'TIMELINE')
      .reduce((s, r) => s + r.issue_count_severe, 0);
    const logicErrors = currentReports
      .filter((r) => r.report_type === 'LOGIC')
      .reduce((s, r) => s + r.issue_count_severe, 0);
    const foreshadows = currentReports.reduce((s, r) => s + r.issue_count_warning, 0);

    const currentScript: OverviewCurrentScript = {
      id: current.id,
      title: current.title,
      genre: `${GENRE_LABEL[current.genre] ?? current.genre} · ${current.player_count}人 · ${current.duration_hours}h`,
      stage: '当前剧本',
      location: `正在编辑：${current.title}`,
      lastEditedAt: formatUpdatedAt(current.updated_at),
      lastEditedTag: `▸ 上次编辑于 ${formatUpdatedAt(current.updated_at)} · 自动保存`,
      progress,
      issuePills: [
        { kind: 'err', count: timelineErrors, label: '时间冲突', href: `${editorBase}/timeline` },
        { kind: 'err', count: logicErrors, label: '逻辑漏洞', href: `${editorBase}/validation` },
        { kind: 'warn', count: foreshadows, label: '伏笔悬挂' },
      ],
      editorHref: editorBase,
      todoHref: `${editorBase}/validation`,
    };

    // 工作流卡（按脚本列表渲染）
    const workflows: OverviewWorkflowCard[] = scripts.map((s) => {
      const wf = mapWorkflowStatus(s.status);
      const sReports = reports.filter((r) => r.script_id === s.id);
      const sSevere = sReports.reduce((acc, r) => acc + r.issue_count_severe, 0);
      const sWarn = sReports.reduce((acc, r) => acc + r.issue_count_warning, 0);
      const wfProgress = s.status === 'completed' ? 100 : estimateProgress(s.word_count);
      const issues = sSevere > 0
        ? { dotClass: 'err' as const, label: `${sSevere} 待处理` }
        : sWarn > 0
          ? { dotClass: 'warn' as const, label: `${sWarn} 待确认` }
          : { dotClass: 'ok' as const, label: '无待办' };
      return {
        id: s.id,
        title: s.title,
        genre: `${GENRE_LABEL[s.genre] ?? s.genre} · ${DIFFICULTY_LABEL[s.difficulty] ?? s.difficulty}`,
        status: wf.status,
        statusLabel: wf.statusLabel,
        progress: wfProgress,
        stage: s.status === 'completed' ? '已交付店家' : '当前剧本',
        issues,
        meta: `${s.player_count}人 / ${s.duration_hours}h · v1`,
        updatedAt: formatUpdatedAt(s.updated_at),
        done: s.status === 'completed' || s.status === 'archived',
        href: `/editor/${s.id}`,
      };
    });

    // 统计卡：待处理问题、今日待办、本月已交付、平均完成度
    const totalIssues = errors + warnings;
    const completedThisMonth = scripts.filter((s) => {
      if (s.status !== 'completed') return false;
      const d = new Date(s.updated_at);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const avgProgress = workflows.length
      ? Math.round(workflows.reduce((s, w) => s + w.progress, 0) / workflows.length)
      : 0;

    const statCards: OverviewStatCard[] = [
      {
        icon: 'err',
        label: '待处理问题',
        value: String(totalIssues),
        unit: '项',
        trend: `${timelineErrors} 时间冲突 · ${logicErrors} 逻辑漏洞 · ${foreshadows} 伏笔`,
        trendDown: totalIssues > 0,
        href: `${editorBase}/validation`,
      },
      {
        icon: 'warn',
        label: '今日待办',
        value: String(totalIssues),
        unit: '项',
        trend: '补全线索 · 修复时序 · 复盘定稿',
        href: editorBase,
      },
      {
        icon: 'ok',
        label: '本月已交付',
        value: String(completedThisMonth),
        unit: '部',
        trend: completedThisMonth > 0 ? '▲ 本月新交付' : '暂无交付',
        href: editorBase,
      },
      {
        icon: 'info',
        label: '平均完成度',
        value: String(avgProgress),
        unit: '%',
        trend: '▲ 较上周',
        href: editorBase,
      },
    ];

    // 待办汇总：按时间冲突 / 逻辑漏洞 / 伏笔悬挂 分组（仅展示当前剧本的项）
    const todoItems: OverviewTodoItem[] = [];
    if (timelineErrors > 0) {
      todoItems.push({ scriptTitle: current.title, description: '时间线存在冲突', href: `${editorBase}/timeline` });
    }
    if (logicErrors > 0) {
      todoItems.push({ scriptTitle: current.title, description: '逻辑存在漏洞', href: `${editorBase}/validation` });
    }
    if (foreshadows > 0) {
      todoItems.push({ scriptTitle: current.title, description: '伏笔悬挂未回收', href: `${editorBase}/validation` });
    }

    const todos: OverviewTodoGroup[] = todoItems.length
      ? [
          {
            kind: 'time',
            label: '时间冲突',
            dotClass: 'err',
            count: timelineErrors,
            items: timelineErrors
              ? [{ scriptTitle: current.title, description: '时间线存在冲突', href: `${editorBase}/timeline` }]
              : [],
          },
          {
            kind: 'logic',
            label: '逻辑漏洞',
            dotClass: 'err',
            count: logicErrors,
            items: logicErrors
              ? [{ scriptTitle: current.title, description: '逻辑存在漏洞', href: `${editorBase}/validation` }]
              : [],
          },
          {
            kind: 'foreshadow',
            label: '伏笔悬挂',
            dotClass: 'warn',
            count: foreshadows,
            items: foreshadows
              ? [{ scriptTitle: current.title, description: '伏笔悬挂未回收', href: `${editorBase}/validation` }]
              : [],
          },
        ]
      : MOCK_DATA.todos;

    // 活动流：基于最近生成任务与校验报告生成；不足时回落 Mock
    const activities: OverviewActivity[] = [];
    for (const t of tasks.slice(0, 5)) {
      const script = scripts.find((s) => s.id === t.script_id);
      const scriptTitle = script?.title ?? '剧本';
      if (t.status === 'completed' && t.task_type === 'FULL_SCRIPT') {
        activities.push({
          kind: 'gen',
          textBefore: 'AI 生成 ',
          bold: scriptTitle,
          textAfter: ' 初版',
          time: `${formatUpdatedAt(t.completed_at ?? t.created_at)} · ${script?.word_count ?? 0} 字`,
        });
      } else if (t.status === 'running') {
        activities.push({
          kind: 'ai',
          textBefore: 'AI 处理中 ',
          bold: scriptTitle,
          textAfter: ` · ${t.progress_percent}%`,
          time: formatUpdatedAt(t.started_at ?? t.created_at),
        });
      }
    }
    if (latestReport) {
      activities.unshift({
        kind: 'check',
        textBefore: '校验发现 ',
        bold: `${errors + warnings + hints} 处问题`,
        textAfter: '',
        time: formatUpdatedAt(latestReport.created_at),
      });
    }
    if (activities.length === 0) activities.push(...MOCK_DATA.activities);

    return {
      currentScript,
      progress,
      stats: { errors, warnings, success: 42, info: hints },
      statCards,
      workflows: workflows.length ? workflows : MOCK_DATA.workflows,
      todos,
      activities,
      aiSuggestion: {
        tip: MOCK_DATA.aiSuggestion.tip,
        applyHref: editorBase,
      },
      quickActions: MOCK_DATA.quickActions.map((qa) =>
        qa.icon === 'generate'
          ? qa
          : { ...qa, href: `${editorBase}${QA_SUB_PATH[qa.icon] ?? ''}` },
      ),
    };
  }

  /** 动态导入服务端 Supabase Client（避免 next/headers 进入客户端 bundle） */
  private async getServerClient(): Promise<SupabaseClient> {
    const { createClient } = await import('@/lib/supabase/server');
    return createClient();
  }
}

/** 单例，便于在 Server Component 中直接调用 */
export const overviewService = new OverviewService();
