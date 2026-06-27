/**
 * 额度计费管理页（T203）
 *
 * 路由：/settings/quota
 *
 * 服务端组件，直接从 layout 已查的 profile（React cache 共享）构造当前
 * 套餐与额度信息，并查询 generation_tasks 表获取最近 AI 生成任务作为使用历史。
 *
 * 视觉对齐项目古风系统：朱砂红 + 纸张色 + 印章质感。
 * 包含：
 *   1. 当前套餐卡（免费版 / 专业版 + 已用/总额度进度条）
 *   2. 套餐对比表（免费版 vs 专业版）
 *   3. 升级专业版按钮（开发期 mock：直接调用 upgradePlan）
 *   4. 使用历史记录（最近 20 条 AI 生成任务）
 *
 * 性能优化（T418）：
 * - 通过 React `cache()` 共享 layout 已查的 `getUser()` 与 users 表查询，
 *   避免重复 DB 往返（详见 `lib/queries/dashboard-queries.ts`）；
 * - 额度信息从 profile 直接构造，不再调用 QuotaService.getQuotaInfo，
 *   消除 users 表的重复查询；upgradePlan server action 仍走 QuotaService。
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Check,
  Crown,
  History,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  getCachedUser,
  getCachedProfile,
} from '@/lib/queries/dashboard-queries';
import { QuotaService, type QuotaInfo } from '@/lib/services/quota-service';
import { EmptyState } from '@/components/common/state-views';
import './quota.css';

/** 套餐标签映射 */
const PLAN_LABEL: Record<QuotaInfo['planType'], string> = {
  free: '免费版',
  pro: '专业版',
};

/** 套餐对比项 */
interface PlanRow {
  feature: string;
  free: string | boolean;
  pro: string | boolean;
}

const PLAN_COMPARISON: PlanRow[] = [
  { feature: 'AI 剧本生成', free: '10 次/月', pro: '无限次' },
  { feature: 'AI 插画生成', free: '不可用', pro: '无限次' },
  { feature: '逻辑校验', free: '基础规则', pro: '高级 + 难度评估' },
  { feature: '线索卡导出', free: '含水印', pro: '无水印高清' },
  { feature: '版本历史', free: '保留 7 天', pro: '永久保留' },
  { feature: '社区发布', free: false, pro: true },
  { feature: '优先客服支持', free: false, pro: true },
];

/** 任务类型中文标签 */
const TASK_TYPE_LABEL: Record<string, string> = {
  FULL_SCRIPT: '剧本生成',
  CHARACTER_ADJUST: '人物调整',
  CLUE_MODIFY: '线索修改',
  TRICK_REPLACE: '诡计替换',
  STYLE_CHANGE: '风格改写',
  COMPRESS: '内容压缩',
  COMPLIANCE: '合规调整',
  ILLUSTRATION: '插画生成',
};

/** 任务状态中文标签 */
const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/** 使用历史行（generation_tasks 投影） */
interface UsageHistoryRow {
  id: string;
  task_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

/** 升级套餐 server action（开发期 mock：直接置为 pro） */
async function upgradeToPro() {
  'use server';
  // 复用 layout 已查的 user（React cache 命中，避免重复 getUser 调用）
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');
  const service = new QuotaService();
  await service.upgradePlan(user.id);
  redirect('/settings/quota');
}

/** 格式化日期为 "MM-DD HH:mm" */
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** 由 profile 构造 QuotaInfo（profile 为空时回退默认值） */
function buildQuotaFromProfile(
  profile: {
    free_quota_used: number;
    free_quota_limit: number;
    plan_type: string;
  } | null,
): { info: QuotaInfo; error: string | null } {
  if (!profile) {
    return {
      info: { used: 0, limit: 10, remaining: 10, planType: 'free' },
      error: '未能读取额度信息，已显示默认值。',
    };
  }
  const used = profile.free_quota_used;
  const limit = profile.free_quota_limit;
  return {
    info: {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      planType: profile.plan_type === 'pro' ? 'pro' : 'free',
    },
    error: null,
  };
}

export default async function QuotaPage() {
  // 复用 layout 已查的 user（React cache 命中，无重复 getUser 调用）
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  // 复用 layout 已查的 profile，直接构造额度信息（避免重复查询 users 表）
  const profile = await getCachedProfile(user.id);
  const { info: quotaInfo, error: quotaError } = buildQuotaFromProfile(profile);

  // 获取最近 20 条 AI 生成任务作为使用历史（layout 未查过，保留本页查询）
  const supabase = await createClient();
  const { data: historyRows } = (await supabase
    .from('generation_tasks')
    .select('id, task_type, status, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20)) as { data: UsageHistoryRow[] | null };

  const isPro = quotaInfo.planType === 'pro';
  const usedPercent =
    quotaInfo.limit > 0
      ? Math.min(100, Math.round((quotaInfo.used / quotaInfo.limit) * 100))
      : 0;
  const isQuotaLow = !isPro && quotaInfo.remaining <= 2;

  return (
    <section className="view quota-page">
      {/* ============ 页头 ============ */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Crown size={22} />
            额度与套餐 <span className="seal">QUOTA</span>
          </h1>
          <div className="page-desc">
            管理你的 AI 生成额度与订阅套餐
          </div>
        </div>
        <div className="page-actions">
          <Link href="/dashboard" className="btn btn-ghost">
            返回概览
          </Link>
        </div>
      </div>

      {quotaError ? (
        <div className="quota-warn" role="alert">{quotaError}</div>
      ) : null}

      {/* ============ 当前套餐 + 进度条 ============ */}
      <div className={`quota-current-card ${isPro ? 'is-pro' : ''}`}>
        <div className="qc-left">
          <div className="qc-plan-badge">
            {isPro ? <Crown size={14} /> : <Sparkles size={14} />}
            {PLAN_LABEL[quotaInfo.planType]}
          </div>
          <div className="qc-title">
            {isPro ? '专业版创作者' : '免费体验中'}
          </div>
          <div className="qc-desc">
            {isPro
              ? '已解锁全部 AI 生成能力，可无限创作。'
              : `本月剩余 ${quotaInfo.remaining} / ${quotaInfo.limit} 次 AI 生成机会。`}
          </div>
        </div>
        <div className="qc-right">
          <div className="qc-progress-label">
            <span>已用额度</span>
            <span className={`qc-pct ${isQuotaLow ? 'low' : ''}`}>
              {isPro ? '∞' : `${quotaInfo.used} / ${quotaInfo.limit}`}
            </span>
          </div>
          {isPro ? (
            <div className="qc-progress-bar pro">
              <div className="qc-progress-fill pro" style={{ width: '100%' }} />
            </div>
          ) : (
            <div className="qc-progress-bar">
              <div
                className={`qc-progress-fill ${isQuotaLow ? 'low' : ''}`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
          )}
          {isQuotaLow ? (
            <div className="qc-hint">
              <Zap size={12} />
              额度即将用尽，升级专业版可继续创作。
            </div>
          ) : null}
        </div>
      </div>

      {/* ============ 套餐对比表 ============ */}
      <div className="quota-compare-card">
        <div className="card-head">
          <h3>
            <TrendingUp size={16} />
            套餐对比
          </h3>
        </div>
        <div className="qc-compare-body">
          <table className="quota-table">
            <thead>
              <tr>
                <th>功能</th>
                <th className="col-free">免费版</th>
                <th className="col-pro">专业版</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <td className="qc-feature">{row.feature}</td>
                  <td className="qc-cell">
                    {typeof row.free === 'boolean' ? (
                      row.free ? (
                        <Check size={15} className="qc-yes" />
                      ) : (
                        <X size={15} className="qc-no" />
                      )
                    ) : (
                      <span>{row.free}</span>
                    )}
                  </td>
                  <td className="qc-cell pro">
                    {typeof row.pro === 'boolean' ? (
                      row.pro ? (
                        <Check size={15} className="qc-yes" />
                      ) : (
                        <X size={15} className="qc-no" />
                      )
                    ) : (
                      <span>{row.pro}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="qc-cta">
            {isPro ? (
              <div className="qc-current-tag">
                <Crown size={14} />
                你已是专业版用户
              </div>
            ) : (
              <form action={upgradeToPro}>
                <button type="submit" className="btn btn-primary qc-upgrade-btn">
                  <Crown size={15} />
                  升级专业版
                  <span className="qc-mock-tag">开发期 mock</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ============ 使用历史记录 ============ */}
      <div className="quota-history-card">
        <div className="card-head">
          <h3>
            <History size={16} />
            使用历史
          </h3>
          <span className="qh-count">
            最近 {historyRows?.length ?? 0} 条
          </span>
        </div>
        {historyRows && historyRows.length > 0 ? (
          <div className="qh-list">
            {historyRows.map((row) => {
              const statusClass =
                row.status === 'completed'
                  ? 'ok'
                  : row.status === 'failed'
                    ? 'err'
                    : row.status === 'running'
                      ? 'gen'
                      : 'warn';
              return (
                <div key={row.id} className="qh-row">
                  <div className="qh-type">
                    {TASK_TYPE_LABEL[row.task_type] ?? row.task_type}
                  </div>
                  <div className="qh-time">
                    {formatTime(row.created_at)}
                  </div>
                  <div className={`qh-status qh-${statusClass}`}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="暂无使用记录"
            description="开始使用 AI 生成功能后，这里会展示最近的任务历史。"
            Icon={History}
          />
        )}
      </div>
    </section>
  );
}
