/**
 * 创作参数表单组件
 *
 * 受控表单：题材/难度 chip 单选、人数/时长/分级/风格 select、
 * 背景与立意 input、3 个开关、附加要求 textarea、生成按钮。
 * 含参数合理性校验（如低人数硬核本提示）。
 * 对齐原型 #view-generate 左侧 .card 表单结构。
 */
'use client';

import React from 'react';
import { PenLine, Play, Square } from 'lucide-react';
import type { ScriptDifficulty, ScriptGenre } from '@/types';
import type {
  AgeRating,
  ScriptGenerationParams,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import { validateScriptParams } from '@/lib/utils/script-param-validation';

/** 题材选项 */
const GENRE_OPTIONS: Array<{ value: ScriptGenre; label: string }> = [
  { value: 'hardcore', label: '硬核' },
  { value: 'emotion', label: '情感' },
  { value: 'horror', label: '恐怖' },
  { value: 'funny', label: '欢乐' },
  { value: 'mechanism', label: '机制' },
];

/** 难度选项 */
const DIFFICULTY_OPTIONS: Array<{ value: ScriptDifficulty; label: string }> = [
  { value: 'beginner', label: '新手' },
  { value: 'intermediate', label: '进阶' },
  { value: 'advanced', label: '烧脑' },
  { value: 'expert', label: '专家' },
];

/** 适龄分级选项（对齐原型 select：全员/16+/18+） */
const AGE_RATING_OPTIONS: Array<{ value: AgeRating; label: string }> = [
  { value: 'ALL', label: '全员' },
  { value: 'SIXTEEN_PLUS', label: '16+' },
  { value: 'EIGHTEEN_PLUS', label: '18+' },
];

/** 写作风格选项 */
const WRITING_STYLE_OPTIONS: WritingStyle[] = [
  '古风沉稳',
  '白描清雅',
  '悬疑冷峻',
  '诙谐明快',
];

export interface ParamFormProps {
  params: ScriptGenerationParams;
  onChange: (patch: Partial<ScriptGenerationParams>) => void;
  onGenerate: () => void;
  onAbort?: () => void;
  isGenerating: boolean;
}

export function ParamForm({ params, onChange, onGenerate, onAbort, isGenerating }: ParamFormProps) {
  const hint = validateScriptParams({
    title: params.title,
    genre: params.genre,
    players: params.players,
    duration: params.duration,
    difficulty: params.difficulty,
  });
  const canGenerate = !isGenerating && params.title.trim().length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <PenLine />
          创作参数
        </h3>
      </div>
      <div className="card-body">
        <div className="form-group">
          <label className="form-label">
            剧本标题 <span className="req">*</span>
          </label>
          <input
            className="form-input"
            value={params.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="如：古镇迷案"
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            题材 <span className="req">*</span>
          </label>
          <div className="chip-group">
            {GENRE_OPTIONS.map((g) => (
              <span
                key={g.value}
                className={`chip ${params.genre === g.value ? 'active' : ''}`}
                onClick={() => onChange({ genre: g.value })}
              >
                {g.label}
              </span>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              玩家人数 <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={params.players}
              onChange={(e) => onChange({ players: Number(e.target.value) })}
            >
              {[4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} 人
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">
              预计时长 <span className="req">*</span>
            </label>
            <select
              className="form-select"
              value={params.duration}
              onChange={(e) => onChange({ duration: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} 小时
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            难度 <span className="req">*</span>
          </label>
          <div className="chip-group">
            {DIFFICULTY_OPTIONS.map((d) => (
              <span
                key={d.value}
                className={`chip ${params.difficulty === d.value ? 'active' : ''}`}
                onClick={() => onChange({ difficulty: d.value })}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">背景设定</label>
          <input
            className="form-input"
            value={params.background}
            onChange={(e) => onChange({ background: e.target.value })}
            placeholder="如：清末民初 · 江南古镇"
          />
        </div>

        <div className="form-group">
          <label className="form-label">核心立意</label>
          <input
            className="form-input"
            value={params.theme}
            onChange={(e) => onChange({ theme: e.target.value })}
            placeholder="如：家国亲情 · 旧恨新仇"
          />
        </div>

        <div className="form-group">
          <label className="form-label">适龄分级</label>
          <select
            className="form-select"
            value={params.ageRating}
            onChange={(e) => onChange({ ageRating: e.target.value as AgeRating })}
          >
            {AGE_RATING_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">写作风格</label>
          <select
            className="form-select"
            value={params.writingStyle}
            onChange={(e) =>
              onChange({ writingStyle: e.target.value as WritingStyle })
            }
          >
            {WRITING_STYLE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="switch-row">
          <span className="sr-label">无边缘位（戏份均衡）</span>
          <div
            className={`switch ${params.switches.noEdgeRole ? 'on' : ''}`}
            role="switch"
            aria-checked={params.switches.noEdgeRole}
            tabIndex={0}
            onClick={() =>
              onChange({
                switches: {
                  ...params.switches,
                  noEdgeRole: !params.switches.noEdgeRole,
                },
              })
            }
          />
        </div>
        <div className="switch-row">
          <span className="sr-label">合规预检（屏蔽敏感词）</span>
          <div
            className={`switch ${params.switches.compliancePreCheck ? 'on' : ''}`}
            role="switch"
            aria-checked={params.switches.compliancePreCheck}
            tabIndex={0}
            onClick={() =>
              onChange({
                switches: {
                  ...params.switches,
                  compliancePreCheck: !params.switches.compliancePreCheck,
                },
              })
            }
          />
        </div>
        <div className="switch-row">
          <span className="sr-label">生成机制规则（机制本）</span>
          <div
            className={`switch ${params.switches.mechanismRules ? 'on' : ''}`}
            role="switch"
            aria-checked={params.switches.mechanismRules}
            tabIndex={0}
            onClick={() =>
              onChange({
                switches: {
                  ...params.switches,
                  mechanismRules: !params.switches.mechanismRules,
                },
              })
            }
          />
        </div>

        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">附加要求（可选）</label>
          <textarea
            className="form-textarea"
            value={params.extraReq}
            onChange={(e) => onChange({ extraReq: e.target.value })}
            placeholder="如：增加一轮公共搜证、强化凶手反侦意识…"
          />
        </div>

        {hint ? <div className="form-hint">{hint}</div> : null}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={isGenerating ? onAbort : onGenerate}
            disabled={isGenerating ? !onAbort : !canGenerate}
          >
            {isGenerating ? <Square size={14} /> : <Play size={14} />}
            {isGenerating ? '停止生成' : '开始生成'}
          </button>
        </div>
      </div>
    </div>
  );
}
