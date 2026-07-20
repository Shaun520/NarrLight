/**
 * 时间线冲突列表组件（T148 · 视图4）
 *
 * 严格对齐原型 workbench2.html .conflict-list 结构：
 *   - .card-head（含冲突数标题）
 *   - 每条 .conflict-item：.ci-icon 序号 + .ci-body[title/desc/loc] + "前往修正"按钮
 *
 * 点击"前往修正"按钮触发 onJumpToFix 回调，由父页面跳转到编辑器对应位置。
 */
'use client';

import { AlertTriangle } from 'lucide-react';
import type { ConflictItem } from '@/lib/validation/timeline/conflict-detector';
import { SEVERITY_LABELS } from '@/lib/validation/timeline/conflict-detector';

interface TimelineConflictListProps {
  /** 冲突列表 */
  conflicts: ConflictItem[];
  /** 跳转修正回调 */
  onJumpToFix?: (conflict: ConflictItem) => void;
}

/**
 * 时间线冲突列表
 */
export function TimelineConflictList({
  conflicts,
  onJumpToFix,
}: TimelineConflictListProps) {
  return (
    <div className="conflict-list" style={{ marginTop: 22 }}>
      <div className="card-head" style={{ border: 'none', padding: '0 0 12px' }}>
        <h3>
          <AlertTriangle size={16} />
          时间线冲突 · {conflicts.length} 处
        </h3>
      </div>

      {conflicts.length === 0 ? (
        <div className="conflict-empty">
          <span className="ce-icon">✓</span>
          <span className="ce-text">未检测到时间线冲突，剧本时序严谨。</span>
        </div>
      ) : (
        conflicts.map((conflict) => (
          <div
            key={conflict.index}
            className={`conflict-item sev-${conflict.severity}`}
          >
            <div className="ci-icon">{conflict.index}</div>
            <div className="ci-body">
              <div className="ci-title">
                {conflict.title}
                <span className={`ci-sev sev-${conflict.severity}`}>
                  {SEVERITY_LABELS[conflict.severity]}
                </span>
              </div>
              <div className="ci-desc">{conflict.desc}</div>
              <div className="ci-loc">{conflict.loc}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onJumpToFix?.(conflict)}
            >
              前往修正
            </button>
          </div>
        ))
      )}
    </div>
  );
}
