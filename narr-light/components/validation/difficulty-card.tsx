/**
 * 难度评估卡组件（T157）
 *
 * 对齐原型 workbench2.html #view-logic .difficulty-card 结构：
 *   .difficulty-card
 *     .diff-label        "难度评估"
 *     .diff-grade        大字号等级（如"进阶"）
 *     .diff-score        综合评分 7.2 / 10
 *     .diff-bar × 5      5 维度进度条
 *       .diff-bar-label  (label + b 分值)
 *       .diff-bar-track
 *         .diff-bar-fill
 *     EVALUATION NOTE    评估说明
 *
 * 客户端组件：纯展示，数据由父级传入。
 */
'use client';

import type { DifficultyAssessment } from '@/lib/validation/difficulty/assessor';

interface DifficultyCardProps {
  assessment: DifficultyAssessment | null;
}

/** 维度展示文案（对齐原型 .diff-bar-label） */
const DIMENSION_LABELS: Record<string, string> = {
  线索密度: '线索密度',
  干扰项占比: '干扰项占比',
  诡计复杂度: '诡计复杂度',
  沉浸门槛: '沉浸门槛',
  逻辑闭环度: '逻辑闭环度',
};

/** 干扰项占比维度特殊展示百分数 */
function formatScore(name: string, score: number): string {
  if (name === '干扰项占比') {
    return `${Math.round(score * 10)}%`;
  }
  return score.toFixed(1);
}

/** 计算进度条宽度（百分比，0-100） */
function barWidth(name: string, score: number): string {
  if (name === '干扰项占比') {
    return `${Math.min(100, Math.round(score * 10))}%`;
  }
  return `${Math.min(100, Math.round(score * 10))}%`;
}

export function DifficultyCard({ assessment }: DifficultyCardProps) {
  return (
    <div className="difficulty-card">
      <div className="diff-label">难度评估</div>
      <div className="diff-grade">{assessment ? assessment.overallLevel : '—'}</div>
      <div className="diff-score">
        {assessment ? (
          <>
            综合评分 <b>{assessment.overallScore.toFixed(1)}</b> / 10
          </>
        ) : (
          '综合评分 — / 10'
        )}
      </div>

      {assessment
        ? assessment.dimensions.map((dim) => (
            <div className="diff-bar" key={dim.name}>
              <div className="diff-bar-label">
                <span>{DIMENSION_LABELS[dim.name] ?? dim.name}</span>
                <b>{formatScore(dim.name, dim.score)}</b>
              </div>
              <div className="diff-bar-track">
                <div
                  className="diff-bar-fill"
                  style={{ width: barWidth(dim.name, dim.score) }}
                />
              </div>
            </div>
          ))
        : Object.keys(DIMENSION_LABELS).map((name) => (
            <div className="diff-bar" key={name}>
              <div className="diff-bar-label">
                <span>{name}</span>
                <b>—</b>
              </div>
              <div className="diff-bar-track">
                <div className="diff-bar-fill" style={{ width: '0%' }} />
              </div>
            </div>
          ))}

      <div className="diff-note">
        <div className="diff-note-label">EVALUATION NOTE</div>
        {assessment ? assessment.note : '尚未执行校验，暂无评估数据。'}
      </div>
    </div>
  );
}
