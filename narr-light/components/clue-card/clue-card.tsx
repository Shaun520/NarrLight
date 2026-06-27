/**
 * 线索卡组件（T166）
 *
 * 4 种视觉风格：ink（水墨古风，默认）/ film（胶片暗调）/ hand（手写便签）/ mini（极简白卡）。
 * 视觉与 class 命名严格对齐原型 workbench2.html #view-clues .clue-card（CSS 2426-2482 行）。
 *
 * 结构：.cc-corner（大写汉字序号）/ .cc-tag（public/private/key/trap，带配色）/
 *      .cc-body（.cc-title + .cc-text）/ .cc-foot（编号 + 位置）
 *
 * 通过 data-act / data-phase 属性驱动联动筛选（clue-tabs.tsx 消费）。
 */
import type { CSSProperties } from 'react';

/** 幕次（对齐 .act-tab[data-act]） */
export type ClueAct = 'act1' | 'act2' | 'act3' | 'truth';

/** 环节（对齐 .phase-tab[data-phase]） */
export type CluePhase = 'public' | 'private' | 'key' | 'trap';

/** 线索内容分类（FR-011：物证/口供/深入/隐藏） */
export type ClueType = 'physical' | 'testimony' | 'deep' | 'hidden';

/** 线索卡视觉风格 */
export type ClueCardStyle = 'ink' | 'film' | 'hand' | 'mini';

/** 幕次 tab 配置（顺序对齐原型 .clue-tabs 第一行） */
export const ACT_TABS: { act: ClueAct | 'all'; label: string }[] = [
  { act: 'all', label: '全部' },
  { act: 'act1', label: '第一幕 · 序幕' },
  { act: 'act2', label: '第二幕 · 搜证' },
  { act: 'act3', label: '第三幕 · 圆桌' },
  { act: 'truth', label: '真相复盘' },
];

/** 环节 tab 配置（顺序对齐原型 .clue-tabs 第二行） */
export const PHASE_TABS: { phase: CluePhase | 'all'; label: string }[] = [
  { phase: 'all', label: '全部' },
  { phase: 'public', label: '公共线索' },
  { phase: 'private', label: '角色私有' },
  { phase: 'key', label: '关键证据' },
  { phase: 'trap', label: '干扰线索' },
];

/** 风格切换 chip 配置（对齐 .style-switcher） */
export const STYLE_CHIPS: { style: ClueCardStyle; label: string }[] = [
  { style: 'ink', label: '水墨古风' },
  { style: 'film', label: '胶片暗调' },
  { style: 'hand', label: '手写便签' },
  { style: 'mini', label: '极简白卡' },
];

/** 线索内容分类标签 */
export const CLUE_TYPE_LABELS: Record<ClueType, string> = {
  physical: '物证',
  testimony: '口供',
  deep: '深入线索',
  hidden: '隐藏线索',
};

/** 幕次中文标签 */
export const ACT_LABELS: Record<ClueAct, string> = {
  act1: '第一幕 · 序幕',
  act2: '第二幕 · 搜证',
  act3: '第三幕 · 圆桌',
  truth: '真相复盘',
};

/** 环节中文标签 */
export const PHASE_LABELS: Record<CluePhase, string> = {
  public: '公共线索',
  private: '角色私有',
  key: '关键证据',
  trap: '干扰线索',
};

/** 线索卡数据（UI 层） */
export interface Clue {
  /** 线索 ID */
  id: string;
  /** 幕次 */
  act: ClueAct;
  /** 环节 */
  phase: CluePhase;
  /** 内容分类 */
  type: ClueType;
  /** 大写汉字序号（壹贰叁…），未提供时由 toChineseOrdinal 推导 */
  corner?: string;
  /** 标签展示文本，如 "公共 · 第一幕" / "柳如烟私有" / "关键" / "干扰" */
  tag: string;
  /** 标题 */
  title: string;
  /** 正文 */
  text: string;
  /** 编号，如 #C-03 / #P-08 */
  code: string;
  /** 搜证地点 */
  location: string;
  /** 私有线索归属角色（仅 private） */
  owner?: string;
  /** 是否干扰项（FR-013） */
  isDistractor?: boolean;
  /** 是否关键线索（FR-013） */
  isKey?: boolean;
  /** 关联人物（FR-012） */
  relatedCharacters?: string[];
  /** 关联真相复盘段落标识（FR-012，用于 TruthLink 跳转） */
  relatedTruth?: string;
  /** 解锁层级（深入/隐藏线索，0 表示表层） */
  unlockLevel?: number;
  /** 前置线索 ID（深入/隐藏线索解锁条件） */
  requires?: string[];
}

/** 大写汉字序号：1→壹 … 10→拾 11→拾壹 … 19→拾玖 20→贰拾 … */
const ORDINALS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
export function toChineseOrdinal(n: number): string {
  if (n <= 0) return ORDINALS[0];
  if (n <= 10) return ORDINALS[n];
  if (n < 20) return '拾' + (ORDINALS[n - 10] ?? '');
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return (ORDINALS[tens] ?? '') + '拾' + (ones ? ORDINALS[ones] ?? '' : '');
}

/**
 * 8 张示例线索卡（对齐原型 #view-clues .clue-grid）。
 * 幕次分布：act1×3 / act2×4 / act3×1；环节分布：public×2 / private×3 / key×2 / trap×1。
 * 类型分布：physical×6 / testimony×1 / deep×1 / hidden×1，并构造解锁链路
 *   clue-1（族谱残页）→ clue-7（祭器架缺口，hidden）
 *   clue-8（购药账册）→ clue-6（未贴标签草药，deep）
 */
export const DEFAULT_CLUES: Clue[] = [
  {
    id: 'clue-1', act: 'act1', phase: 'public', type: 'physical',
    corner: '壹', tag: '公共 · 第一幕',
    title: '族谱残页',
    text: '火焚大半的族谱残页，焦痕边缘隐约可见"过继"二字，墨迹尚新。',
    code: '#C-03', location: '祠堂厢房',
    relatedCharacters: ['沈墨白', '沈墨尘'], relatedTruth: 'truth-lineage',
  },
  {
    id: 'clue-2', act: 'act1', phase: 'private', type: 'physical',
    corner: '贰', tag: '柳如烟私有', owner: '柳如烟',
    title: '绣帕药渍',
    text: '一方素色绣帕，角上残留褐色药渍，气味微苦。绣纹为柳家旧样。',
    code: '#P-08', location: '随身',
    relatedCharacters: ['柳如烟'], relatedTruth: 'truth-poison',
  },
  {
    id: 'clue-3', act: 'act1', phase: 'private', type: 'physical',
    corner: '叁', tag: '沈墨尘私有', owner: '沈墨尘',
    title: '钥匙串',
    text: '一串铜钥匙，其中一把形制古朴，对应书房暗格。常年贴身携带。',
    code: '#P-03', location: '随身',
    relatedCharacters: ['沈墨尘'], relatedTruth: 'truth-secret-room',
  },
  {
    id: 'clue-4', act: 'act2', phase: 'key', type: 'physical',
    corner: '肆', tag: '关键', isKey: true,
    title: '三张借据',
    text: '铜锁木匣内藏借据三张，债主皆沈墨白，金额五百至三千两，落款多为案发前。',
    code: '#C-15', location: '沈宅暗格',
    relatedCharacters: ['沈墨白', '沈墨尘'], relatedTruth: 'truth-motive',
  },
  {
    id: 'clue-5', act: 'act2', phase: 'trap', type: 'physical',
    corner: '伍', tag: '干扰', isDistractor: true,
    title: '匿名情书',
    text: '沈墨白枕下藏有一封未署名的情书，字迹娟秀，与案件看似无关。',
    code: '#C-19', location: '沈宅寝室',
    relatedCharacters: ['沈墨白'], relatedTruth: 'truth-redherring',
  },
  {
    id: 'clue-6', act: 'act2', phase: 'key', type: 'deep',
    corner: '陆', tag: '关键', isKey: true, unlockLevel: 1, requires: ['clue-8'],
    title: '未贴标签草药',
    text: '三包草药，经辨认含乌头碱。无色无味，过量可致心悸猝死。',
    code: '#C-21', location: '药铺后院',
    relatedCharacters: ['周半仙'], relatedTruth: 'truth-method',
  },
  {
    id: 'clue-7', act: 'act2', phase: 'public', type: 'hidden',
    corner: '柒', tag: '公共 · 第二幕', unlockLevel: 1, requires: ['clue-1'],
    title: '祭器架缺口',
    text: '祠堂祭器架第三层有一空位，规格约玉琮大小，余处积尘厚薄不一。',
    code: '#C-12', location: '祠堂',
    relatedCharacters: ['沈墨白'], relatedTruth: 'truth-relic',
  },
  {
    id: 'clue-8', act: 'act3', phase: 'private', type: 'testimony',
    corner: '捌', tag: '周半仙私有', owner: '周半仙', isKey: true,
    title: '购药账册',
    text: '药铺账册载：案发前七日，有匿名客以双倍价购乌头三两，付银不留名。',
    code: '#P-11', location: '药铺柜台',
    relatedCharacters: ['周半仙'], relatedTruth: 'truth-method',
  },
];

/**
 * 联动计数：act 计数受当前 phase 约束，phase 计数受当前 act 约束（双向联动）。
 * 对齐原型 refreshCounts：act-tab 计数 = (a==='all'||card.act===a) && (curPhase==='all'||card.phase===curPhase)
 */
export function computeClueCounts(
  clues: Clue[],
  curAct: ClueAct | 'all',
  curPhase: CluePhase | 'all',
): {
  actCounts: Record<ClueAct | 'all', number>;
  phaseCounts: Record<CluePhase | 'all', number>;
} {
  const actCounts: Record<ClueAct | 'all', number> = {
    all: 0, act1: 0, act2: 0, act3: 0, truth: 0,
  };
  const phaseCounts: Record<CluePhase | 'all', number> = {
    all: 0, public: 0, private: 0, key: 0, trap: 0,
  };
  for (const c of clues) {
    const phaseOk = curPhase === 'all' || c.phase === curPhase;
    const actOk = curAct === 'all' || c.act === curAct;
    if (phaseOk) {
      actCounts.all += 1;
      actCounts[c.act] += 1;
    }
    if (actOk) {
      phaseCounts.all += 1;
      phaseCounts[c.phase] += 1;
    }
  }
  return { actCounts, phaseCounts };
}

/**
 * 应用联动筛选：返回当前 act/phase 下可见的线索。
 * 对齐原型 applyFilter：actOk && phaseOk。
 */
export function filterClues(
  clues: Clue[],
  curAct: ClueAct | 'all',
  curPhase: CluePhase | 'all',
): Clue[] {
  return clues.filter(
    (c) =>
      (curAct === 'all' || c.act === curAct) &&
      (curPhase === 'all' || c.phase === curPhase),
  );
}

interface ClueCardProps {
  clue: Clue;
  /** 视觉风格，默认 ink */
  style?: ClueCardStyle;
  /** 选中态（详情抽屉打开时高亮） */
  selected?: boolean;
  /** 点击回调 */
  onClick?: (clue: Clue) => void;
  /** 内联样式透传（导出场景需要固定尺寸时使用） */
  styleOverride?: CSSProperties;
}

/**
 * 线索卡组件
 *
 * 渲染 .clue-card.{style}，携带 data-act / data-phase / data-clue-id，
 * 供联动筛选与导出节点查询使用。
 */
export function ClueCard({
  clue,
  style = 'ink',
  selected = false,
  onClick,
  styleOverride,
}: ClueCardProps) {
  const corner = clue.corner ?? toChineseOrdinal(parseInt(clue.code.replace(/[^0-9]/g, ''), 10) || 1);
  const classNames = ['clue-card', style, selected ? 'selected' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={classNames}
      data-act={clue.act}
      data-phase={clue.phase}
      data-clue-id={clue.id}
      style={styleOverride}
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(clue)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(clue);
        }
      }}
    >
      <div className="cc-corner">{corner}</div>
      <div className={`cc-tag ${clue.phase}`}>{clue.tag}</div>
      <div className="cc-body">
        <div className="cc-title">{clue.title}</div>
        <div className="cc-text">{clue.text}</div>
      </div>
      <div className="cc-foot">
        <span>{clue.code}</span>
        <span>{clue.location}</span>
      </div>
    </div>
  );
}

export default ClueCard;
