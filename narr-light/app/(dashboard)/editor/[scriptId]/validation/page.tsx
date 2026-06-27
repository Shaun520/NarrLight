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
 * Mock 数据：沿用原型样例（朱砂私章 / 乌头碱 / 沈墨尘 / 祠堂祭器），
 * 后续由 ValidationService 注入真实校验结果。
 */
'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
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

// ===== Mock 数据（对齐原型样例） =====

const MOCK_ISSUES: AiValidationIssue[] = [
  {
    id: 'iss-001',
    severity: 'CRITICAL',
    type: '伏笔未回收',
    title: '"朱砂私章"线索无后续回收',
    description:
      '第一幕沈墨白收到的匿名信落款为父亲惯用朱砂私章，但全本后续均未对该印章来源、流转做任何解释，构成核心伏笔悬挂。',
    location: '第一幕 · 沈墨白剧本 第2段',
    suggestion:
      '在真相复盘新增段落：说明私章实为沈墨尘早年窃取，用于伪造信件诱使沈墨白归乡，构成凶手预谋链条的关键一环。',
    autoFixable: true,
  },
  {
    id: 'iss-002',
    severity: 'CRITICAL',
    type: '诡计可行性',
    title: '乌头碱下毒手法存在物理逻辑硬伤',
    description:
      '剧本描述凶手以乌头碱混入死者茶水中毒杀，但乌头碱有显著麻舌感，死者饮茶后必然察觉异样。当前描写死者"安然饮尽"违背常识。',
    location: '第二幕 · 真相复盘 · 凶案手法',
    suggestion:
      '将下毒载体改为蜜渍蜜饯（甜味可掩盖麻舌感），或调整死者设定为久病味觉迟钝者，使手法成立。',
    autoFixable: true,
  },
  {
    id: 'iss-003',
    severity: 'WARNING',
    type: '动机薄弱',
    title: '沈墨尘杀人动机驱动力不足',
    description:
      '沈墨尘的动机仅以"债务缠身"概括，与其此前铺垫的兄弟情谊形成强烈反差，缺乏足够的心理转折，易让玩家觉得突兀。',
    location: '人物剧本 · 沈墨尘 · 动机段落',
    suggestion:
      '补入沈墨尘被高利贷威胁性命、且发现沈墨白归乡后将剥夺其继承权的双重压力，强化行为驱动力。',
    autoFixable: true,
  },
  {
    id: 'iss-004',
    severity: 'WARNING',
    type: '线索无真相对应',
    title: '"祠堂祭器缺口"线索未被复盘解释',
    description:
      '祠堂搜证可获一条"祭器架缺一空位"的线索，但真相复盘未提及该祭器去向，线索无对应真相解释，构成无效线索。',
    location: '第二幕 · 线索卡 #C-12',
    suggestion:
      '于复盘中补充：空位原置玉琮，被沈墨尘窃取典当还债，与借据线索形成呼应链。',
    autoFixable: true,
  },
  {
    id: 'iss-005',
    severity: 'WARNING',
    type: '动机薄弱',
    title: '沈墨白归乡时机略显牵强',
    description:
      '沈墨白收到匿名信后立即归乡，缺乏对其在外地事务的交代，动机链略显单薄。',
    location: '第一幕 · 沈墨白剧本 第1段',
    suggestion:
      '补充沈墨白在外地生意受挫、恰逢来信的时点巧合，使归乡更具合理性。',
    autoFixable: false,
  },
  {
    id: 'iss-006',
    severity: 'SUGGESTION',
    type: 'OOC',
    title: '沈墨尘对兄弟态度转折过快',
    description:
      '沈墨尘在第一幕对沈墨白仍表现关切，第二幕却迅速转为冷漠，缺乏过渡铺垫。',
    location: '第二幕 · 沈墨尘剧本 第3段',
    suggestion: '在第一幕末尾增加一处微小疏离细节，为后续转折埋下心理伏笔。',
    autoFixable: false,
  },
  {
    id: 'iss-007',
    severity: 'SUGGESTION',
    type: '伏笔未回收',
    title: '"祖训牌匾"提及后无下文',
    description: '开篇提及祖训牌匾内容，但后续未再呼应，构成轻微悬挂。',
    location: '第一幕 · 公共线 第1段',
    suggestion: '可在终幕由沈墨白引用祖训作为指认凶手的关键依据。',
    autoFixable: true,
  },
];

const MOCK_TRICKS: AiNarrativeTrick[] = [
  {
    id: 'trick-001',
    type: 'IDENTITY',
    description: '沈墨白"养子"身份',
    location: '人物剧本 · 沈墨白',
  },
  {
    id: 'trick-002',
    type: 'PERSPECTIVE',
    description: '第一幕死者视角倒置',
    location: '第一幕 · 公共线',
  },
];

/** Mock 剧本数据（用于难度评估算法输入） */
const MOCK_SCRIPT: GeneratedScriptJson = {
  characters: [
    {
      name: '沈墨白',
      roleIdentity: '养子',
      gender: 'male',
      age: 28,
      personality: '内敛克制',
      backgroundStory:
        '幼年被沈家收养，与沈墨尘一同长大，远赴他乡经商多年，因一封匿名信归乡。',
      personalTask: '查清生父死因',
      isMurderer: false,
    },
    {
      name: '沈墨尘',
      roleIdentity: '亲子',
      gender: 'male',
      age: 30,
      personality: '表面温和，内心阴鸷',
      backgroundStory:
        '沈家长子，因债务缠身对父亲心生怨恨，与兄长沈墨白关系微妙。',
      personalTask: '掩盖罪行',
      isMurderer: true,
    },
  ],
  acts: [
    {
      title: '第一幕 · 风雨欲来',
      sortOrder: 1,
      content: '沈家老宅风雨欲来，归乡的沈墨白收到匿名信，众人齐聚祠堂。',
      scenes: [],
    },
    {
      title: '第二幕 · 真相复盘',
      sortOrder: 2,
      content: '凶案发生，众人搜证并指认真凶。',
      scenes: [],
    },
  ],
  clues: [
    {
      title: '朱砂私章',
      content: '匿名信落款为父亲惯用朱砂私章',
      clueType: 'physical',
      searchRound: 1,
      location: '沈墨白书房',
      relatedCharacterNames: ['沈墨白', '沈墨尘'],
      isDistractor: false,
      isKeyClue: true,
      unlockCondition: '第一幕搜证',
    },
    {
      title: '祠堂祭器缺口',
      content: '祭器架缺一空位',
      clueType: 'physical',
      searchRound: 2,
      location: '祠堂',
      relatedCharacterNames: ['沈墨尘'],
      isDistractor: false,
      isKeyClue: true,
      unlockCondition: '第二幕搜证',
    },
    {
      title: '借据',
      content: '高利贷借据一纸',
      clueType: 'physical',
      searchRound: 2,
      location: '沈墨尘卧房',
      relatedCharacterNames: ['沈墨尘'],
      isDistractor: false,
      isKeyClue: true,
      unlockCondition: '第二幕搜证',
    },
    {
      title: '祖训牌匾拓片',
      content: '祖训牌匾内容拓片',
      clueType: 'testimony',
      searchRound: 1,
      location: '祠堂',
      relatedCharacterNames: [],
      isDistractor: true,
      isKeyClue: false,
      unlockCondition: '第一幕搜证',
    },
  ],
  truth: {
    summary: '沈墨尘因债务与继承权纷争，毒杀生父并伪造信件诱兄归乡。',
    murdererMethod:
      '沈墨尘以蜜渍蜜饯为载体，混入乌头碱令父亲食下，甜味掩盖麻舌感，毒发身亡。',
    motive: '债务缠身且恐继承权被剥夺',
    timeline: '亥时下毒，子时毒发',
    foreshadowing: ['朱砂私章', '祖训牌匾', '祠堂祭器缺口'],
  },
};

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

/** 增量复检 Mock 延迟（ms） */
const INCREMENTAL_MOCK_DELAY = 1500;
/** 全量校验 Mock 延迟（ms） */
const FULL_VALIDATE_MOCK_DELAY = 3000;

/**
 * 全量校验 Mock 返回结果：在原 Mock 基础上追加 1 条新漏洞，模拟 AI 重新跑完后
 * 发现的新问题。真实场景下由 supabase/functions/validate/logic.ts 返回。
 */
const MOCK_FULL_VALIDATE_NEW_ISSUE: AiValidationIssue = {
  id: 'iss-full-new',
  severity: 'WARNING',
  type: '逻辑闭环',
  title: '全量校验：真相复盘时间链与柳如烟行踪存在 10 分钟空窗',
  description:
    '全量校验重新跑通时间线后，发现真相复盘中"亥时下毒 → 子时毒发"与柳如烟 22:40 归家的时间窗存在 10 分钟空窗未被解释，建议补一处过渡。',
  location: '第二幕 · 真相复盘 · 时间链',
  suggestion: '在复盘中补一句"柳如烟归家途中绕道药铺后院，与下毒时间错开"。',
  autoFixable: true,
};

export default function ValidationPage({ params }: PageProps) {
  const { scriptId } = use(params);

  // 状态：当前激活 tab / 标记为叙诡的 id / 已排除 id / 修复中 id / 上次校验时间
  const [activeSev, setActiveSev] = useState<IssueSeverity>('CRITICAL');
  const [markedTrickIds, setMarkedTrickIds] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [validatedAt, setValidatedAt] = useState<number>(Date.now() - 60 * 60 * 1000); // 1 小时前

  // 漏洞 / 叙诡数据（可由校验流程刷新；初始沿用 MOCK）
  const [issues, setIssues] = useState<AiValidationIssue[]>(MOCK_ISSUES);
  const [tricks, setTricks] = useState<AiNarrativeTrick[]>(MOCK_TRICKS);

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

  // 叙诡识别（右侧卡）
  const detectedTricks: DetectedTrick[] = useMemo(
    () =>
      narrativeTrickDetector.detect(
        {
          scriptId,
          title: '沈府风云',
          genre: 'hardcore',
          difficulty: 'intermediate',
          script: MOCK_SCRIPT,
        },
        tricks,
      ),
    [scriptId, tricks],
  );

  // 难度评估
  const assessment: DifficultyAssessment = useMemo(
    () =>
      difficultyAssessor.assess({
        scriptId,
        genre: 'hardcore',
        script: MOCK_SCRIPT,
        playerCount: 6,
        grouped,
        trickCount: detectedTricks.length,
      }),
    [scriptId, grouped, detectedTricks.length],
  );

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
   * 真实调用流程：
   *   1. 上层（编辑器 / 线索页）上报 changedAreas；
   *   2. 注入 incrementalValidateFn（调 AI 仅校验受影响区域）；
   *   3. incrementalValidationService.revalidate 内部完成
   *      "受影响集筛选 → AI 校验 → mergeResults 合并"；
   *   4. 用合并后的 issues/tricks 刷新 UI。
   *
   * 开发期 Mock：注入 mock validateFn（setTimeout 模拟异步），返回
   * 略有差异的 issues 集合以演示合并效果。
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

    // 注入 Mock 校验函数（真实场景由 route handler 调 AI 后注入）
    incrementalValidationService.setValidateFn(
      async (_sid: string, _areas: ChangedArea[]) => {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, INCREMENTAL_MOCK_DELAY),
        );
        // Mock：返回受影响区域重新校验后的 issues（含 1 条新增 + 复用 tricks）
        return {
          issues: [
            ...MOCK_ISSUES.slice(0, 3),
            MOCK_FULL_VALIDATE_NEW_ISSUE,
          ],
          tricks: MOCK_TRICKS,
        };
      },
    );

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
   *
   * 真实调用：
   *   const res = await fetch('/functions/validate/logic', {
   *     method: 'POST',
   *     headers: { 'Content-Type': 'application/json' },
   *     body: JSON.stringify({ scriptId, reportType: 'FULL' }),
   *   });
   *   const data: LogicValidationResponse = await res.json();
   *   setIssues(data.issues as AiValidationIssue[]);
   *   setTricks(data.tricks as AiNarrativeTrick[]);
   *
   * 开发期 Mock：setTimeout 3 秒模拟，返回带 1 条新漏洞的 Mock 结果。
   */
  const handleFullValidate = async () => {
    if (incrementalValidating || fullValidating) return;
    setFullValidating(true);
    showToast('全量校验中（伏笔 / 动机 / 诡计 / 时间线 / 难度）…', '◌');

    try {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, FULL_VALIDATE_MOCK_DELAY),
      );

      // Mock 全量结果：在原 Mock 基础上追加 1 条新漏洞，模拟 AI 重新发现的问题
      const freshIssues: AiValidationIssue[] = [
        ...MOCK_ISSUES,
        MOCK_FULL_VALIDATE_NEW_ISSUE,
      ];
      const freshTricks: AiNarrativeTrick[] = MOCK_TRICKS.slice();

      setIssues(freshIssues);
      setTricks(freshTricks);
      setValidatedAt(Date.now());
      setActiveSev('CRITICAL');
      showToast(
        `全量校验完成 · 漏洞 ${freshIssues.length} 条 · 叙诡 ${freshTricks.length} 条 · 难度与叙诡识别已刷新`,
        '✓',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
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
            <div className="vuln-empty">
              {isTrickTab
                ? '◇ 暂无识别到的叙诡设计'
                : '◇ 当前等级无漏洞，剧本结构良好'}
            </div>
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
