/**
 * 逻辑闭环校验页（T155 · 视图5）
 *
 * 路由：/dashboard/editor/[scriptId]/validation
 *
 * 严格参照原型 workbench2.html #view-logic 结构：
 *   1. .page-head        页头（标题 + P1 印章 + 增量复检 / 全量校验）
 *   2. StaleValidationBanner  跨模块变更提示（剧本/线索修改后）
 *   3. .logic-grid        左右双栏
 *      - 左：.sev-tabs（4 级：严重缺陷/局部警告/优化提示/叙诡识别）+ .vuln-item 列表
 *      - 右：.difficulty-card（难度评估 5 维度）+ 叙诡识别卡（.rel-list-item）
 *
 * 客户端组件：管理 activeSev / 标记 / 排除 / 修复中状态。
 *
 * 初始数据为空，用户点击「全量校验」后通过 Edge Function 拉取真实结果。
 */
'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { Eye, FlaskConical, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/common';
import { VulnItem } from '@/components/validation/vuln-item';
import { DifficultyCard } from '@/components/validation/difficulty-card';
import { StaleValidationBanner } from '@/components/common/stale-validation-banner';
import { useIssueLocator } from '@/components/editor/issue-locator';
import {
  issueClassifier,
  SEVERITY_LABEL,
  TRICK_TYPE_LABEL,
  type GroupedIssues,
  type IssueSeverity,
  type ValidationIssue,
} from '@/lib/validation/logic/issue-classifier';
import {
  narrativeTrickDetector,
  type DetectedTrick,
} from '@/lib/validation/logic/narrative-trick-detector';
import {
  difficultyAssessor,
  type DifficultyAssessment,
} from '@/lib/validation/difficulty/assessor';
import type {
  AiValidationIssue,
  AiNarrativeTrick,
} from '@/lib/ai/prompts/logic-validation';
import type { GeneratedScriptJson } from '@/lib/ai/prompts/script-generation';
import {
  incrementalValidationService,
  type ChangedArea,
  type ValidationResultSet,
} from '@/lib/services/incremental-validation-service';
import './validation.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

const SEV_TAB_ORDER: IssueSeverity[] = [
  'CRITICAL',
  'WARNING',
  'SUGGESTION',
  'NARRATIVE_TRICK',
];

const SEV_TAB_CSS: Record<IssueSeverity, string> = {
  CRITICAL: '',
  WARNING: 't-warn',
  SUGGESTION: 't-info',
  NARRATIVE_TRICK: 't-trick',
};

/** Toast 提示状态（对齐编辑器页 save-toast 模式） */
interface ToastState {
  visible: boolean;
  message: string;
  icon: string;
}

export default function ValidationPage({ params }: PageProps) {
  const { scriptId } = use(params);

  // 状态：当前激活 tab / 标记为叙诡的 id / 已排除 id / 修复中 id / 上次校验时间
  const [activeSev, setActiveSev] = useState<IssueSeverity>('CRITICAL');
  const [markedTrickIds, setMarkedTrickIds] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [validatedAt, setValidatedAt] = useState<number>(Date.now() - 60 * 60 * 1000); // 1 小时前

  // 剧本数据（后续由真实接口填充；当前保持 null）
  const [scriptData] = useState<GeneratedScriptJson | null>(null);

  // 漏洞 / 叙诡数据（由校验流程刷新；初始为空）
  const [issues, setIssues] = useState<AiValidationIssue[]>([]);
  const [tricks, setTricks] = useState<AiNarrativeTrick[]>([]);

  // 校验中状态
  const [incrementalValidating, setIncrementalValidating] = useState(false);
  const [fullValidating, setFullValidating] = useState(false);

  // Toast 反馈
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    icon: '✓',
  });

  // Toast 自动消失
  useEffect(() => {
    if (!toast.visible) return;
    const timer = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [toast.visible, toast.message]);

  /** 显示 Toast */
  const showToast = (message: string, icon = '✓') => {
    setToast({ visible: true, message, icon });
  };

  // 漏洞分类（依赖 issues / tricks / markedTrickIds / excludedIds）
  const grouped: GroupedIssues = useMemo(
    () => issueClassifier.classify(issues, tricks, markedTrickIds, excludedIds),
    [issues, tricks, markedTrickIds, excludedIds],
  );

  const flatIssues: ValidationIssue[] = useMemo(
    () => issueClassifier.flatten(grouped),
    [grouped],
  );

  const counts = useMemo(
    () => issueClassifier.countBySeverity(flatIssues),
    [flatIssues],
  );

  // 叙诡识别（右侧卡）：无真实剧本数据时保持为空
  const detectedTricks: DetectedTrick[] = useMemo(() => {
    if (!scriptData) return [];
    return narrativeTrickDetector.detect(
      {
        scriptId,
        title: '沈府风云',
        genre: 'hardcore',
        difficulty: 'intermediate',
        script: scriptData,
      },
      tricks,
    );
  }, [scriptId, scriptData, tricks]);

  // 难度评估：无真实剧本数据时不进行评估
  const assessment: DifficultyAssessment | null = useMemo(() => {
    if (!scriptData) return null;
    return difficultyAssessor.assess({
      scriptId,
      genre: 'hardcore',
      script: scriptData,
      playerCount: 6,
      grouped,
      trickCount: detectedTricks.length,
    });
  }, [scriptId, scriptData, grouped, detectedTricks.length]);

  // 动作
  const locate = useIssueLocator(scriptId);

  /** 组装当前结果集（供增量复检服务使用） */
  const buildResultSet = (): ValidationResultSet => ({
    issues,
    tricks,
    excludedIds,
    markedTrickIds,
    validatedAt,
  });

  const handleAutoFix = async (issue: ValidationIssue) => {
    setFixingIds((prev) => new Set(prev).add(issue.id));
    // 模拟异步修复
    await new Promise((r) => setTimeout(r, 800));
    setFixingIds((prev) => {
      const next = new Set(prev);
      next.delete(issue.id);
      return next;
    });
    setFixedIds((prev) => new Set(prev).add(issue.id));
  };

  const handleMarkAsTrick = (issue: ValidationIssue) => {
    setMarkedTrickIds((prev) =>
      prev.includes(issue.id) ? prev : [...prev, issue.id],
    );
    setActiveSev('NARRATIVE_TRICK');
  };

  const handleExclude = (issue: ValidationIssue) => {
    setExcludedIds((prev) =>
      prev.includes(issue.id) ? prev : [...prev, issue.id],
    );
  };

  /**
   * 增量复检：仅校验变更区域，合并新旧结果。
   *
   * 当前未注入真实增量校验函数，服务会 dry-run 返回旧结果，保持空状态。
   */
  const handleRevalidate = async () => {
    if (incrementalValidating || fullValidating) return;
    setIncrementalValidating(true);
    showToast('增量复检中…', '◌');

    // Mock 变更区域：第二幕编辑器改动（与原型 StaleValidationBanner 场景一致）
    const changedAreas: ChangedArea[] = [
      { module: 'editor', actIndex: 2 },
      { module: 'truth' },
    ];

    try {
      const merged = await incrementalValidationService.revalidate(
        scriptId,
        changedAreas,
        buildResultSet(),
      );
      setIssues(merged.issues);
      setTricks(merged.tricks);
      setValidatedAt(merged.validatedAt);
      setActiveSev('CRITICAL');
      const severeCount = merged.issues.filter((i) => i.severity === 'CRITICAL').length;
      showToast(
        `增量复检完成 · 共 ${merged.issues.length} 条（严重 ${severeCount}）`,
        '✓',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      showToast(`增量复检失败：${msg}`, '✗');
    } finally {
      setIncrementalValidating(false);
    }
  };

  /**
   * 全量校验：触发 LOGIC(FULL) Edge Function，重跑伏笔 / 动机 / 诡计 / 时间线 / 难度。
   */
  const handleFullValidate = async () => {
    if (incrementalValidating || fullValidating) return;
    setFullValidating(true);
    showToast('全量校验中（伏笔 / 动机 / 诡计 / 时间线 / 难度）…', '◌');

    try {
      const res = await fetch('/functions/validate/logic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId, reportType: 'FULL' }),
      });
      if (!res.ok) throw new Error(`校验失败：${res.status}`);
      const data = await res.json();
      setIssues(data.issues ?? []);
      setTricks(data.tricks ?? []);
      setValidatedAt(Date.now());
      setActiveSev('CRITICAL');
      const issueCount = (data.issues ?? []).length;
      const trickCount = (data.tricks ?? []).length;
      showToast(
        `全量校验完成 · 漏洞 ${issueCount} 条 · 叙诡 ${trickCount} 条 · 难度与叙诡识别已刷新`,
        '✓',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setIssues([]);
      setTricks([]);
      showToast(`全量校验失败：${msg}`, '✗');
    } finally {
      setFullValidating(false);
    }
  };

  // 当前 tab 下的列表
  const currentList = grouped[activeSev] ?? [];
  const isTrickTab = activeSev === 'NARRATIVE_TRICK';

  return (
    <div className="validation-page">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            逻辑闭环校验 <span className="seal">P1</span>
          </h1>
          <div className="page-desc">
            {'// 伏笔回收 · 动机合理性 · 诡计可行性 · 叙诡识别 · 难度评估'}
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className={`btn btn-ghost ${incrementalValidating ? 'is-loading' : ''}`}
            onClick={handleRevalidate}
            disabled={incrementalValidating || fullValidating}
          >
            <RefreshCw size={15} />
            {incrementalValidating ? '复检中…' : '增量复检'}
          </button>
          <button
            type="button"
            className={`btn btn-primary ${fullValidating ? 'is-loading' : ''}`}
            onClick={handleFullValidate}
            disabled={incrementalValidating || fullValidating}
          >
            <RefreshCw size={15} />
            {fullValidating ? '全量校验中…' : '全量校验'}
          </button>
        </div>
      </div>

      {/* ===== 校验进度条 ===== */}
      {(incrementalValidating || fullValidating) && (
        <div className="val-progress" role="status">
          <RefreshCw size={13} />
          <span>
            {incrementalValidating
              ? '增量复检：仅校验变更区域…'
              : '全量校验：伏笔 / 动机 / 诡计 / 时间线 / 难度…'}
          </span>
          <span className="vp-bar" />
        </div>
      )}

      {/* ===== 跨模块变更提示 ===== */}
      <StaleValidationBanner
        scriptId={scriptId}
        validatedAt={validatedAt}
        onRevalidate={handleRevalidate}
      />

      {/* ===== 双栏布局 ===== */}
      <div className="logic-grid">
        {/* ----- 左：漏洞列表 ----- */}
        <div>
          <div className="sev-tabs">
            {SEV_TAB_ORDER.map((sev) => (
              <div
                key={sev}
                className={`sev-tab ${SEV_TAB_CSS[sev]} ${activeSev === sev ? 'active' : ''}`}
                onClick={() => setActiveSev(sev)}
                role="button"
                tabIndex={0}
              >
                {SEVERITY_LABEL[sev]} <span className="count">{counts[sev]}</span>
              </div>
            ))}
          </div>

          {currentList.length === 0 ? (
            <EmptyState
              Icon={FlaskConical}
              title="暂无校验结果"
              description="点击全量校验，AI 将分析伏笔回收、动机合理性与诡计可行性"
              actionText="全量校验"
              onAction={handleFullValidate}
            />
          ) : (
            currentList.map((issue) => (
              <VulnItem
                key={issue.id}
                issue={issue}
                onAutoFix={handleAutoFix}
                onLocate={locate}
                onMarkAsTrick={handleMarkAsTrick}
                fixing={fixingIds.has(issue.id)}
                fixed={fixedIds.has(issue.id)}
              />
            ))
          )}

          {/* 右上角"忽略"快捷动作（仅漏洞项有，原型未显式画出，但保留可访问性） */}
          {!isTrickTab && currentList.length > 0 ? (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--sepia-soft)', fontFamily: "'Courier Prime', monospace", textAlign: 'right' }}>
              共 {currentList.length} 条 ·
              {currentList
                .filter((i) => !i.isMarkedAsTrick)
                .slice(0, 1)
                .map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => handleExclude(i)}
                    style={{ marginLeft: 6, background: 'transparent', border: 'none', color: 'var(--sepia-soft)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
                  >
                    忽略首条
                  </button>
                ))}
            </div>
          ) : null}
        </div>

        {/* ----- 右：难度评估 + 叙诡识别 ----- */}
        <div>
          <DifficultyCard assessment={assessment} />

          {/* 叙诡识别卡 */}
          <div className="trick-card">
            <div className="card-head">
              <h3>
                <Eye size={16} />
                叙诡识别
              </h3>
            </div>
            <div className="card-body">
              {detectedTricks.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--sepia-soft)' }}>
                  未识别到设计性叙诡
                </div>
              ) : (
                detectedTricks.map((trick, idx) => (
                  <div
                    key={trick.id}
                    className="rel-list-item"
                    style={{ marginBottom: idx === detectedTricks.length - 1 ? 0 : 7 }}
                  >
                    <span className="rel-type hidden">
                      {TRICK_TYPE_LABEL[trick.type]}
                    </span>
                    <span style={{ flex: 1 }}>{trick.description}</span>
                  </div>
                ))
              )}
              {detectedTricks.length > 0 ? (
                <div className="trick-note">✓ 已正确识别，未误判为逻辑漏洞</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Toast ===== */}
      {toast.visible && (
        <div
          className={`val-toast show ${toast.icon === '✗' ? 't-err' : toast.icon === '!' ? 't-warn' : ''}`}
          role="status"
        >
          <span className="toast-icon">{toast.icon}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
