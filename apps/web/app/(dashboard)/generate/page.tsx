/**
 * 剧本 AI 生成页（分阶段编排版）
 *
 * 客户端组件，useState 管理表单参数。
 * 左侧 ParamForm 创作参数，右侧根据编排器状态显示：
 *   - idle：占位提示
 *   - running（阶段 0）：进度看板
 *   - paused_at_gate：设定本确认闸门
 *   - running（阶段 1-3）：进度看板
 *   - completed：完成提示
 *   - failed：错误提示 + 重试按钮
 *
 * 编排器：usePhasedGeneration hook 调度 7 个阶段 Edge Function。
 * 中断续传：进入页面时检测 ?scriptId=xxx 是否有未完成阶段。
 */
'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, FileDown, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { ParamForm } from '@/components/generate/param-form';
import { usePhasedGeneration } from '@/lib/hooks/use-phased-generation';
import { PhasedGenProgress } from '@/components/generate/phased-gen-progress';
import { StoryBibleGate } from '@/components/generate/story-bible-gate';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type {
  AgeRating,
  ScriptGenerationParams,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';

/** 数据库 CHECK 约束允许的合法值 */
const VALID_GENRES: ScriptGenre[] = ['hardcore', 'emotion', 'horror', 'funny', 'mechanism'];
const VALID_DIFFICULTIES: ScriptDifficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];
import './generate.css';

/** 默认参数（对齐原型默认值） */
const DEFAULT_PARAMS: ScriptGenerationParams = {
  title: '古镇迷案',
  genre: 'hardcore',
  players: 6,
  duration: 5,
  difficulty: 'intermediate',
  background: '清末民初 · 江南古镇',
  theme: '家国亲情 · 旧恨新仇',
  ageRating: 'SIXTEEN_PLUS',
  writingStyle: '白描清雅',
  switches: { noEdgeRole: true, compliancePreCheck: true, mechanismRules: false },
  extraReq: '含叙述性诡计，第二幕设置公共搜证环节，凶手具备反侦察意识。',
};

function GeneratePageInner() {
  const [params, setParams] = useState<ScriptGenerationParams>(DEFAULT_PARAMS);
  const { state, start, confirmStoryBible, regenerateStoryBible, retryPhase, abort, reset, resumeFromScript } =
    usePhasedGeneration();

  const searchParams = useSearchParams();

  // ===== 中断续传：进入页面时检测 ?scriptId=xxx 是否有未完成阶段 =====
  // 仅在 mount 时执行一次，避免重复触发。检测到设定本存在则恢复到 paused_at_gate 或 completed。
  useEffect(() => {
    const scriptId = searchParams.get('scriptId');
    if (!scriptId) return;
    // 异步检测，不阻塞渲染
    resumeFromScript(scriptId, params).catch((err) => {
      console.warn('恢复生成状态失败:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 读取 query string 并合并到表单参数（仅当存在时覆盖默认值） =====
  useEffect(() => {
    const title = searchParams.get('title');
    const genre = searchParams.get('genre') as ScriptGenre | null;
    const players = searchParams.get('players');
    const duration = searchParams.get('duration');
    const difficulty = searchParams.get('difficulty') as ScriptDifficulty | null;
    const ageRating = searchParams.get('ageRating') as AgeRating | null;
    const writingStyle = searchParams.get('writingStyle') as WritingStyle | null;
    const background = searchParams.get('background');
    const theme = searchParams.get('theme');

    // 无任何 query string 参数时保持默认值，不修改状态
    if (
      !title &&
      !genre &&
      !players &&
      !duration &&
      !difficulty &&
      !ageRating &&
      !writingStyle &&
      !background &&
      !theme
    ) {
      return;
    }

    const patch: Partial<ScriptGenerationParams> = {};
    if (title) patch.title = title;
    if (genre && VALID_GENRES.includes(genre)) patch.genre = genre;
    if (players) patch.players = Number(players);
    if (duration) patch.duration = Number(duration);
    if (difficulty && VALID_DIFFICULTIES.includes(difficulty)) patch.difficulty = difficulty;
    if (ageRating) patch.ageRating = ageRating;
    if (writingStyle) patch.writingStyle = writingStyle;
    if (background) patch.background = background;
    if (theme) patch.theme = theme;

    setParams((prev) => ({ ...prev, ...patch }));
  }, [searchParams, setParams]);

  const handleChange = (patch: Partial<ScriptGenerationParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  };

  /** 启动分阶段生成 */
  const handleGenerate = async () => {
    if (
      state.orchestrationStatus !== 'idle' &&
      state.orchestrationStatus !== 'failed' &&
      state.orchestrationStatus !== 'completed'
    )
      return;
    if (!params.title.trim()) return;
    if (state.orchestrationStatus !== 'idle') {
      reset();
    }
    await start(params);
  };

  /** 载入草稿：重置为默认参数 */
  const handleLoadDraft = () => {
    reset();
    setParams(DEFAULT_PARAMS);
  };

  /** 中断生成 */
  const handleAbort = () => {
    abort();
  };

  const isGenerating =
    state.orchestrationStatus === 'running' ||
    state.orchestrationStatus === 'paused_at_gate';
  const canGenerate = !isGenerating && params.title.trim().length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            剧本 AI 生成 <span className="seal">P1 核心</span>
          </h1>
          <div className="page-desc">设定参数 → 分阶段生成 · 设定本确认 → 全本产出 · 支持中断续传</div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleLoadDraft}
            disabled={isGenerating}
          >
            <FileDown size={14} />
            载入草稿
          </button>
          {isGenerating ? (
            <button type="button" className="btn btn-ghost" onClick={handleAbort}>
              中断生成
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <Play size={14} />
              {state.orchestrationStatus === 'completed' ? '重新生成' : '开始生成'}
            </button>
          )}
        </div>
      </div>

      <div className="gen-layout">
        <ParamForm
          params={params}
          onChange={handleChange}
          onGenerate={handleGenerate}
          onAbort={handleAbort}
          isGenerating={isGenerating}
        />

        <div className="gen-panel">
          <div className="gen-panel-head">
            <div className="gen-dots">
              <span />
              <span />
              <span />
            </div>
            <span>generate · deepseek-v4-pro · 分阶段编排</span>
            <span style={{ marginLeft: 'auto', color: 'var(--blood-soft)' }}>
              ● {isGenerating ? 'LIVE' : 'IDLE'}
            </span>
          </div>

          {/* 根据编排器状态渲染不同内容 */}
          {state.orchestrationStatus === 'idle' && (
            <div className="gen-stream">
              <span className="content-line" style={{ opacity: 0.5 }}>
                点击「开始生成」启动 AI 分阶段创作，设定本生成后将暂停等待确认…
              </span>
              {state.globalError && (
                <div className="phased-global-error" style={{ marginTop: 16 }}>
                  {state.globalError}
                </div>
              )}
            </div>
          )}

          {state.orchestrationStatus === 'paused_at_gate' && state.storyBible && (
            <>
              <StoryBibleGate
                storyBible={state.storyBible}
                onConfirm={confirmStoryBible}
                onRegenerate={regenerateStoryBible}
                isRegenerating={state.phases.story_bible.status === 'running'}
              />
              {/* 续传恢复时：部分阶段已完成，同时显示进度看板供查看完成情况 */}
              {Object.values(state.phases).some((p) => p.status === 'completed' && p.id !== 'story_bible') && (
                <PhasedGenProgress state={state} onRetryPhase={retryPhase} />
              )}
            </>
          )}

          {(state.orchestrationStatus === 'running' ||
            state.orchestrationStatus === 'completed') && (
            <PhasedGenProgress state={state} onRetryPhase={retryPhase} />
          )}

          {/* failed 状态：若已有阶段进入 running/completed 则显示进度看板，否则只显示错误面板 */}
          {state.orchestrationStatus === 'failed' &&
            Object.values(state.phases).some((p) => p.status === 'running' || p.status === 'completed') && (
            <PhasedGenProgress state={state} onRetryPhase={retryPhase} />
          )}

          {state.orchestrationStatus === 'failed' && (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
              }}
            >
              <AlertCircle
                size={32}
                style={{ margin: '0 auto 10px', color: '#e8a0a0' }}
              />
              <div style={{ fontSize: 14, marginBottom: 12, color: '#e8dfd1' }}>
                生成失败
              </div>
              {state.globalError && (
                <div
                  className="phased-global-error"
                  style={{
                    maxWidth: 480,
                    margin: '0 auto 16px',
                    textAlign: 'left',
                  }}
                >
                  {state.globalError}
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                <RefreshCw size={14} />
                重试生成
              </button>
            </div>
          )}

          {state.orchestrationStatus === 'completed' && (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <CheckCircle2
                size={32}
                style={{ color: '#8abf8a', margin: '0 auto 8px' }}
              />
              <div style={{ fontSize: 14, color: '#e8dfd1' }}>全本生成完成，共 7 阶段</div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={() =>
                  (window.location.href = state.scriptId
                    ? `/editor/${state.scriptId}`
                    : '/dashboard')
                }
              >
                进入编辑器
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * 默认导出：用 Suspense 包裹 GeneratePageInner，满足 Next.js 对
 * useSearchParams 的 Suspense 边界要求（避免 next build 报错）。
 */
export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GeneratePageInner />
    </Suspense>
  );
}
