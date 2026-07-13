/**
 * 分阶段生成进度看板
 *
 * 替换 gen-progress.tsx 的 Mock 进度条，基于真实 PhasedGenerationState 渲染 7 阶段进度。
 * - 每阶段独立进度条 + 状态图标（✓ 完成 / ▶ 运行中 / ⏳ 待启动 / ✗ 失败）
 * - 阶段 2 角色剧本展开显示各角色子状态
 * - 失败阶段附错误原因与重试按钮
 * - 流式内容预览（可折叠）
 */
'use client';

import React, { useState } from 'react';
import type {
  PhasedGenerationState,
  PhaseState,
  PhaseId,
} from '@/lib/hooks/use-phased-generation';

export interface PhasedGenProgressProps {
  /** 编排器状态 */
  state: PhasedGenerationState;
  /** 重试指定阶段 */
  onRetryPhase: (phaseId: PhaseId) => void;
}

const PHASE_DISPLAY_ORDER: PhaseId[] = [
  'story_bible',
  'character_profiles',
  'act_structure',
  'character_script',
  'clues',
  'organizer_manual',
  'truth_review',
  'timeline_structure',
];

const PHASE_LABELS: Record<PhaseId, string> = {
  story_bible: '设定本',
  character_profiles: '人物设定',
  act_structure: '分幕结构',
  character_script: '角色剧本',
  clues: '线索卡',
  organizer_manual: '组织者手册',
  truth_review: '真相复盘',
  timeline_structure: '时间线结构化',
};

function getStatusIcon(status: PhaseState['status']): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'running':
      return '▶';
    case 'failed':
      return '✗';
    case 'skipped':
      return '–';
    default:
      return '⏳';
  }
}

function getStatusColor(status: PhaseState['status']): string {
  switch (status) {
    case 'completed':
      return 'var(--jade, #5a8a6a)';
    case 'running':
      return 'var(--blood-soft, #c54848)';
    case 'failed':
      return 'var(--blood, #a02828)';
    default:
      return 'var(--ink-soft, #888)';
  }
}

function PhaseRow({
  phase,
  onRetry,
}: {
  phase: PhaseState;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasStreamText = phase.streamedText.length > 0;
  const hasSubItems = phase.subItems && phase.subItems.length > 0;
  const canExpand = hasStreamText || hasSubItems;

  return (
    <div className="phased-phase-row">
      <div
        className="phased-phase-header"
        onClick={() => canExpand && setExpanded(!expanded)}
        style={{ cursor: canExpand ? 'pointer' : 'default' }}
      >
        <span
          className="phased-phase-icon"
          style={{ color: getStatusColor(phase.status) }}
        >
          {getStatusIcon(phase.status)}
        </span>
        <span className="phased-phase-label">
          {PHASE_LABELS[phase.id]}
          {phase.id === 'character_script' && hasSubItems && (
            <span className="phased-phase-count">
              {' '}
              {phase.subItems!.filter((s) => s.status === 'completed').length}/
              {phase.subItems!.length}
            </span>
          )}
        </span>
        {phase.status === 'running' && (
          <span className="phased-phase-percent">{phase.percent}%</span>
        )}
        {phase.status === 'completed' && phase.durationSeconds && (
          <span className="phased-phase-meta">· {phase.durationSeconds}s</span>
        )}
        {phase.mode && (
          <span className="phased-phase-meta">
            {' '}
            {phase.mode}
            {phase.model ? ` ${phase.model}` : ''}
          </span>
        )}
        {phase.status === 'failed' && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
          >
            重试
          </button>
        )}
      </div>

      {(phase.status === 'running' || phase.status === 'failed') &&
        phase.percent > 0 && (
          <div className="gen-progress-bar">
            <div
              className="gen-progress-fill"
              style={{
                width: `${phase.percent}%`,
                background: getStatusColor(phase.status),
              }}
            />
          </div>
        )}

      {phase.status === 'failed' && phase.error && (
        <div className="phased-phase-error">{phase.error}</div>
      )}

      {expanded && hasSubItems && (
        <div className="phased-subitems">
          {phase.subItems!.map((sub) => (
            <div key={sub.id} className="phased-subitem">
              <span style={{ color: getStatusColor(sub.status) }}>
                {getStatusIcon(sub.status)}
              </span>
              <span>{sub.label}</span>
              {sub.status === 'failed' && sub.error && (
                <span className="phased-subitem-error">{sub.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && hasStreamText && (
        <pre className="phased-stream-preview">
          {phase.streamedText.slice(-2000)}
        </pre>
      )}
    </div>
  );
}

export function PhasedGenProgress({ state, onRetryPhase }: PhasedGenProgressProps) {
  return (
    <div className="phased-gen-progress">
      {PHASE_DISPLAY_ORDER.map((phaseId) => (
        <PhaseRow
          key={phaseId}
          phase={state.phases[phaseId]}
          onRetry={() => onRetryPhase(phaseId)}
        />
      ))}
      {state.globalError && (
        <div className="phased-global-error">{state.globalError}</div>
      )}
    </div>
  );
}
