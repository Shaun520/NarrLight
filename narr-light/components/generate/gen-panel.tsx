/**
 * 流式生成面板组件
 *
 * 终端风格暗色面板：头部模型标识 + LIVE 指示、进度条、流式输出区。
 * 流式内容按行渲染：label-line（章节标签）/ content-line（正文）/ cursor（闪烁光标）。
 * 对齐原型 .gen-panel 结构。
 */
'use client';

import React from 'react';
import { GenProgress } from './gen-progress';

/** 流式输出单行 */
export interface StreamLine {
  /** label 为章节标签（金色加粗），content 为正文 */
  type: 'label' | 'content';
  text: string;
}

export interface GenPanelProps {
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 模型标识文案 */
  model: string;
  /** 进度百分比 */
  percent: number;
  /** 当前阶段 */
  stage: string;
  /** 已生成字数 */
  wordCount: number;
  /** 预计剩余时间 */
  eta: string;
  /** 完成项 checklist */
  checklist: string;
  /** 流式输出行 */
  lines: StreamLine[];
}

export function GenPanel({
  isGenerating,
  model,
  percent,
  stage,
  wordCount,
  eta,
  checklist,
  lines,
}: GenPanelProps) {
  const showCursor = isGenerating;
  return (
    <div className="gen-panel">
      <div className="gen-panel-head">
        <div className="gen-dots">
          <span />
          <span />
          <span />
        </div>
        <span>generate · {model} · streaming</span>
        <span style={{ marginLeft: 'auto', color: 'var(--blood-soft)' }}>
          ● {isGenerating ? 'LIVE' : 'IDLE'}
        </span>
      </div>
      <GenProgress
        percent={percent}
        stage={stage}
        wordCount={wordCount}
        eta={eta}
        checklist={checklist}
      />
      <div className="gen-stream">
        {lines.length === 0 && !isGenerating ? (
          <span className="content-line" style={{ opacity: 0.5 }}>
            // 点击「开始生成」启动 AI 全本创作，流式输出将在此实时呈现…
          </span>
        ) : (
          lines.map((line, i) => {
            const isLast = i === lines.length - 1;
            return (
              <React.Fragment key={i}>
                <span
                  className={line.type === 'label' ? 'label-line' : 'content-line'}
                >
                  {line.text}
                  {showCursor && isLast ? <span className="cursor" /> : null}
                </span>
                {'\n'}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
