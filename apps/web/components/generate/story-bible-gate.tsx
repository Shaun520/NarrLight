/**
 * 设定本确认闸门
 *
 * 阶段 0 设定本生成完成后弹出，展示设定本内容供用户确认：
 * - 凶手身份（可点击切换凶手触发重新生成）
 * - 凶案手法
 * - 核心诡计
 * - 动机链
 * - 时间线大纲
 * - 真相梗概
 * - 人物关系骨架（节点列表 + 关系列表）
 * - 伏笔清单
 *
 * 操作：[继续生成全本] / [重新生成设定本]
 */
'use client';

import React from 'react';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';

export interface StoryBibleGateProps {
  /** 阶段 0 产出的设定本 */
  storyBible: StoryBibleJson;
  /** 用户确认设定本，继续阶段 1-3 */
  onConfirm: () => void;
  /** 重新生成设定本 */
  onRegenerate: () => void;
  /** 是否正在重新生成 */
  isRegenerating?: boolean;
}

export function StoryBibleGate({
  storyBible,
  onConfirm,
  onRegenerate,
  isRegenerating,
}: StoryBibleGateProps) {
  const {
    murdererName,
    murderMethod,
    coreTrick,
    motiveChain,
    timelineOutline,
    truthSummary,
    characterSkeleton,
    foreshadowingPlan,
  } = storyBible;

  return (
    <div className="story-bible-gate">
      <div className="story-bible-gate-title">设定本已生成 · 请确认后继续</div>

      <div className="story-bible-gate-grid">
        <div className="story-bible-gate-field">
          <span className="story-bible-gate-field-label">凶手</span>
          <span
            className="story-bible-gate-field-value"
            style={{ color: 'var(--blood-soft, #c54848)', fontWeight: 700 }}
          >
            {murdererName}
          </span>
        </div>
        <div className="story-bible-gate-field">
          <span className="story-bible-gate-field-label">凶案手法</span>
          <span className="story-bible-gate-field-value">{murderMethod}</span>
        </div>
        <div className="story-bible-gate-field story-bible-gate-field-full">
          <span className="story-bible-gate-field-label">核心诡计</span>
          <span className="story-bible-gate-field-value">{coreTrick}</span>
        </div>
        <div className="story-bible-gate-field story-bible-gate-field-full">
          <span className="story-bible-gate-field-label">动机链</span>
          <span className="story-bible-gate-field-value">{motiveChain}</span>
        </div>
        <div className="story-bible-gate-field story-bible-gate-field-full">
          <span className="story-bible-gate-field-label">时间线大纲</span>
          <span className="story-bible-gate-field-value">{timelineOutline}</span>
        </div>
        <div className="story-bible-gate-field story-bible-gate-field-full">
          <span className="story-bible-gate-field-label">真相梗概</span>
          <span className="story-bible-gate-field-value">{truthSummary}</span>
        </div>
      </div>

      <div className="story-bible-gate-section">
        <div className="story-bible-gate-section-title">人物关系骨架</div>
        <ul className="story-bible-gate-list">
          {characterSkeleton.nodes.map((node, i) => (
            <li key={`node-${i}`} className="story-bible-gate-list-item">
              {node.name}（{node.identity}）：{node.secret}
            </li>
          ))}
        </ul>
        <ul className="story-bible-gate-list" style={{ marginTop: 8 }}>
          {characterSkeleton.edges.map((edge, i) => (
            <li key={`edge-${i}`} className="story-bible-gate-list-item">
              {edge.from} → {edge.to}（{edge.type}）：{edge.label}
              {edge.isHidden ? (
                <span className="story-bible-gate-hidden-tag">[隐藏]</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="story-bible-gate-section">
        <div className="story-bible-gate-section-title">伏笔清单</div>
        <ul className="story-bible-gate-list">
          {foreshadowingPlan.map((f, i) => (
            <li key={`f-${i}`} className="story-bible-gate-list-item">
              {f.id}：{f.description}（埋设于第{f.plantAct}幕，回收于第{f.payoffAct}幕）
            </li>
          ))}
        </ul>
      </div>

      <div className="story-bible-gate-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={isRegenerating}
        >
          继续生成全本
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? (
            <>
              <span className="spin" aria-hidden="true">
                ↻
              </span>
              重新生成中…
            </>
          ) : (
            '重新生成设定本'
          )}
        </button>
      </div>
    </div>
  );
}

export default StoryBibleGate;
