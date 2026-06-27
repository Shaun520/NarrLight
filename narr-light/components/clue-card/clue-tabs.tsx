/**
 * 线索卡联动标签栏（T167）
 *
 * 两行联动标签：第一行幕次（.act-tab，深墨色激活）、第二行环节（.phase-tab，朱砂红激活）。
 * act 与 phase 双向联动更新计数——act 计数受当前 phase 约束，phase 计数受当前 act 约束。
 *
 * 对齐原型 workbench2.html 第 5769-5838 行 IIFE 闭包筛选逻辑：
 *   - applyFilter():    应用筛选，返回当前可见线索
 *   - refreshCounts():  刷新双向联动计数
 *   - ensureEmptyState(): 判断是否处于空状态
 *
 * 通过 useClueFilter 闭包封装上述三个能力，供页面消费。
 */
'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  ACT_TABS,
  PHASE_TABS,
  computeClueCounts,
  filterClues,
  type Clue,
  type ClueAct,
  type CluePhase,
} from './clue-card';

export interface UseClueFilterResult {
  curAct: ClueAct | 'all';
  curPhase: CluePhase | 'all';
  setAct: (act: ClueAct | 'all') => void;
  setPhase: (phase: CluePhase | 'all') => void;
  /** 应用筛选：返回当前 act/phase 下可见的线索 */
  applyFilter: () => Clue[];
  /** 刷新双向联动计数 */
  refreshCounts: () => {
    actCounts: Record<ClueAct | 'all', number>;
    phaseCounts: Record<CluePhase | 'all', number>;
  };
  /** 确认空状态：当前筛选下无线索 */
  ensureEmptyState: () => boolean;
  visible: Clue[];
  counts: {
    actCounts: Record<ClueAct | 'all', number>;
    phaseCounts: Record<CluePhase | 'all', number>;
  };
  isEmpty: boolean;
}

/**
 * 线索筛选闭包：封装 act/phase 双向联动的筛选、计数与空状态判定。
 */
export function useClueFilter(clues: Clue[]): UseClueFilterResult {
  const [curAct, setAct] = useState<ClueAct | 'all'>('all');
  const [curPhase, setPhase] = useState<CluePhase | 'all'>('all');

  const visible = useMemo(() => filterClues(clues, curAct, curPhase), [clues, curAct, curPhase]);
  const counts = useMemo(() => computeClueCounts(clues, curAct, curPhase), [clues, curAct, curPhase]);

  const applyFilter = () => filterClues(clues, curAct, curPhase);
  const refreshCounts = () => computeClueCounts(clues, curAct, curPhase);
  const ensureEmptyState = () => filterClues(clues, curAct, curPhase).length === 0;

  return {
    curAct,
    curPhase,
    setAct,
    setPhase,
    applyFilter,
    refreshCounts,
    ensureEmptyState,
    visible,
    counts,
    isEmpty: visible.length === 0,
  };
}

interface ClueTabsProps {
  clues: Clue[];
  curAct: ClueAct | 'all';
  curPhase: CluePhase | 'all';
  counts: UseClueFilterResult['counts'];
  onActChange: (act: ClueAct | 'all') => void;
  onPhaseChange: (phase: CluePhase | 'all') => void;
}

/**
 * 幕次行分隔符位置：全部 | 第一幕 | 第二幕 | 第三幕 | 真相复盘
 * 原型在「全部」后、「真相复盘」前各插一道 .tab-divider。
 */
const ACT_DIVIDER_AFTER: (ClueAct | 'all')[] = ['all', 'act3'];
/** 环节行分隔符位置：全部 | 公共 | 私有 | 关键 | 干扰，仅「全部」后一道分隔。 */
const PHASE_DIVIDER_AFTER: (CluePhase | 'all')[] = ['all'];

/**
 * 联动标签栏组件
 */
export function ClueTabs({
  curAct,
  curPhase,
  counts,
  onActChange,
  onPhaseChange,
}: ClueTabsProps) {
  return (
    <div className="clue-tabs">
      {/* ===== 第一行：幕次 ===== */}
      <div className="tab-row">
        <span className="row-label">幕次</span>
        {ACT_TABS.map((tab) => (
          <Fragment key={tab.act}>
            <div
              className={`act-tab ${curAct === tab.act ? 'active' : ''}`}
              data-act={tab.act}
              role="button"
              tabIndex={0}
              onClick={() => onActChange(tab.act)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onActChange(tab.act);
                }
              }}
            >
              {tab.label} <span className="t-count">{counts.actCounts[tab.act]}</span>
            </div>
            {ACT_DIVIDER_AFTER.includes(tab.act) && <div className="tab-divider" />}
          </Fragment>
        ))}
      </div>

      {/* ===== 第二行：环节 ===== */}
      <div className="tab-row">
        <span className="row-label">环节</span>
        {PHASE_TABS.map((tab) => (
          <Fragment key={tab.phase}>
            <div
              className={`phase-tab ${curPhase === tab.phase ? 'active' : ''}`}
              data-phase={tab.phase}
              role="button"
              tabIndex={0}
              onClick={() => onPhaseChange(tab.phase)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPhaseChange(tab.phase);
                }
              }}
            >
              {tab.label}
              {/* 原型中环节「全部」无计数，其余环节带 .t-count */}
              {tab.phase !== 'all' && (
                <span className="t-count">{counts.phaseCounts[tab.phase]}</span>
              )}
            </div>
            {PHASE_DIVIDER_AFTER.includes(tab.phase) && <div className="tab-divider" />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default ClueTabs;
