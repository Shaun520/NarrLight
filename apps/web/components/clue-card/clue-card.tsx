/**
 * 线索卡组件（T166）
 *
 * 默认水墨线索卡样式。
 *
 * 结构：.cc-corner（大写汉字序号）/ .cc-tag（public/private/key/trap，带配色）/
 *      .cc-body（.cc-title + .cc-text）/ .cc-foot（编号 + 位置）
 *
 * 通过 data-act / data-phase 属性驱动联动筛选（clue-tabs.tsx 消费）。
 */
import type { CSSProperties } from 'react';

/** 幕次（对齐 .act-tab[data-act]）：真实分幕使用 act1 / act2 / ...，真相复盘单独保留 */
export type ClueAct = `act${number}` | 'truth';

/** 环节（对齐 .phase-tab[data-phase]） */
export type CluePhase = 'public' | 'private' | 'key' | 'trap';

/** 线索内容分类（FR-011：物证/口供/深入/隐藏） */
export type ClueType = 'physical' | 'testimony' | 'deep' | 'hidden';

/** 线索卡视觉风格 */
export type ClueCardStyle = 'ink' | 'film' | 'hand' | 'mini';

export interface ClueActTab {
  act: ClueAct | 'all';
  label: string;
}

/** 默认幕次 tab 配置（无真实分幕数据时兜底） */
export const ACT_TABS: ClueActTab[] = [
  { act: 'all', label: '全部' },
  { act: 'act1', label: '第一幕' },
  { act: 'act2', label: '第二幕' },
  { act: 'act3', label: '第三幕' },
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

/** 线索内容分类标签 */
export const CLUE_TYPE_LABELS: Record<ClueType, string> = {
  physical: '物证',
  testimony: '口供',
  deep: '深入线索',
  hidden: '隐藏线索',
};

/** 幕次中文标签 */
export const ACT_LABELS: Record<string, string> = {
  act1: '第一幕',
  act2: '第二幕',
  act3: '第三幕',
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
 * 联动计数：act 计数受当前 phase 约束，phase 计数受当前 act 约束（双向联动）。
 * 对齐原型 refreshCounts：act-tab 计数 = (a==='all'||card.act===a) && (curPhase==='all'||card.phase===curPhase)
 */
export function computeClueCounts(
  clues: Clue[],
  curAct: ClueAct | 'all',
  curPhase: CluePhase | 'all',
  searchQuery = '',
): {
  actCounts: Record<string, number>;
  phaseCounts: Record<CluePhase | 'all', number>;
} {
  const actCounts: Record<string, number> = {
    all: 0, act1: 0, act2: 0, act3: 0, truth: 0,
  };
  const phaseCounts: Record<CluePhase | 'all', number> = {
    all: 0, public: 0, private: 0, key: 0, trap: 0,
  };
  const normalizedKeyword = normalizeClueSearchText(searchQuery);
  for (const c of clues) {
    if (!matchesClueSearch(c, normalizedKeyword)) continue;
    const phaseOk = curPhase === 'all' || c.phase === curPhase;
    const actOk = curAct === 'all' || c.act === curAct;
    if (phaseOk) {
      actCounts.all += 1;
      actCounts[c.act] = (actCounts[c.act] ?? 0) + 1;
    }
    if (actOk) {
      phaseCounts.all += 1;
      phaseCounts[c.phase] += 1;
    }
  }
  return { actCounts, phaseCounts };
}

function normalizeClueSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isFuzzyMatch(source: string, keyword: string): boolean {
  if (!keyword) return true;

  const text = normalizeClueSearchText(source);
  if (text.includes(keyword)) return true;

  let cursor = 0;
  for (const char of keyword) {
    cursor = text.indexOf(char, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

export function matchesClueSearch(clue: Clue, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return true;

  return isFuzzyMatch(
    [
      clue.title,
      clue.text,
      clue.code,
      clue.location,
      clue.tag,
      clue.type,
      CLUE_TYPE_LABELS[clue.type],
      clue.owner,
      clue.act,
      clue.phase,
      ...(clue.relatedCharacters ?? []),
    ]
      .filter(Boolean)
      .join(' '),
    normalizedKeyword,
  );
}

/**
 * 应用联动筛选：返回当前 act/phase 下可见的线索。
 * 对齐原型 applyFilter：actOk && phaseOk。
 */
export function filterClues(
  clues: Clue[],
  curAct: ClueAct | 'all',
  curPhase: CluePhase | 'all',
  searchQuery = '',
): Clue[] {
  const normalizedKeyword = normalizeClueSearchText(searchQuery);
  return clues.filter(
    (c) =>
      (curAct === 'all' || c.act === curAct) &&
      (curPhase === 'all' || c.phase === curPhase) &&
      matchesClueSearch(c, normalizedKeyword),
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
