/**
 * 干扰项 / 关键线索标记组件（T169）
 *
 * 提供两个可切换标记：干扰项（trap）、关键线索（key）。
 * 标记后该线索在校验、复盘中以对应身份参与计算（FR-013）。
 *
 * 受控组件：由父级维护 clue.isDistractor / clue.isKey，本组件触发回调。
 */
'use client';

import { Flag, KeyRound, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Clue } from './clue-card';

interface ClueTagsProps {
  clue: Clue;
  /** 标记干扰项 */
  onMarkDistractor?: (clueId: string, isDistractor: boolean) => void;
  /** 标记关键线索 */
  onMarkKeyClue?: (clueId: string, isKey: boolean) => void;
}

/**
 * 标记组件：渲染两个状态切换按钮
 */
export function ClueTags({ clue, onMarkDistractor, onMarkKeyClue }: ClueTagsProps) {
  const isDistractor = !!clue.isDistractor;
  const isKey = !!clue.isKey;

  return (
    <div className="clue-tags-mark">
      <div className="ctm-title">线索标记</div>
      <div className="ctm-row">
        <button
          type="button"
          className={`ctm-toggle ${isKey ? 'active key' : ''}`}
          onClick={() => onMarkKeyClue?.(clue.id, !isKey)}
          aria-pressed={isKey}
        >
          <KeyRound size={14} />
          <span>关键线索</span>
          {isKey ? <ShieldCheck size={13} /> : <span className="ctm-hint">点击标记</span>}
        </button>
        <button
          type="button"
          className={`ctm-toggle ${isDistractor ? 'active trap' : ''}`}
          onClick={() => onMarkDistractor?.(clue.id, !isDistractor)}
          aria-pressed={isDistractor}
        >
          <AlertTriangle size={14} />
          <span>干扰项</span>
          {isDistractor ? <Flag size={13} /> : <span className="ctm-hint">点击标记</span>}
        </button>
      </div>
      <p className="ctm-note">
        关键线索在校验与复盘关联中优先展示，不被判定为无效干扰项；干扰项计入难度评估的干扰项占比。
      </p>
    </div>
  );
}

export default ClueTags;
