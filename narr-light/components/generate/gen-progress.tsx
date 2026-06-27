/**
 * 生成进度条组件
 *
 * 显示当前阶段、百分比、字数、ETA 与完成项 checklist。
 * 对齐原型 .gen-progress 结构。
 */
'use client';

import React from 'react';

export interface GenProgressProps {
  /** 进度百分比 0-100 */
  percent: number;
  /** 当前阶段描述 */
  stage: string;
  /** 已生成字数 */
  wordCount: number;
  /** 预计剩余时间文案 */
  eta: string;
  /** 完成项 checklist 文案 */
  checklist: string;
}

export function GenProgress({
  percent,
  stage,
  wordCount,
  eta,
  checklist,
}: GenProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="gen-progress">
      <div className="gen-progress-text">
        <span>{stage}</span>
        <span>
          <b>{pct}%</b> · {wordCount.toLocaleString()} 字
        </span>
      </div>
      <div className="gen-progress-bar">
        <div className="gen-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="gen-progress-text" style={{ marginTop: 6 }}>
        <span>{checklist}</span>
        <span>预计 {eta}</span>
      </div>
    </div>
  );
}
