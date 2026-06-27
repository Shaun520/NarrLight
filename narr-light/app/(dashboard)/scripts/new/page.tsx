/**
 * 新建剧本页（T133）
 *
 * 路由：/scripts/new
 *
 * 客户端组件：基础信息表单（标题 / 题材 / 人数 / 时长 / 难度 / 背景 / 立意）。
 * 提交后通过浏览器 Supabase Client 创建剧本（status=draft），
 * 随后 router.push 跳转至 /editor/[scriptId]。
 *
 * 表单字段约束与 generate/param-form 对齐，但不包含适龄分级 / 风格 / 开关等
 * 生成参数（这些在编辑器或生成页配置）。
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PenLine, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ScriptDifficulty, ScriptGenre } from '@/types';
import '../scripts.css';

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

/** 表单状态 */
interface NewScriptForm {
  title: string;
  genre: ScriptGenre;
  players: number;
  duration: number;
  difficulty: ScriptDifficulty;
  background: string;
  theme: string;
}

/** 默认表单值 */
const DEFAULT_FORM: NewScriptForm = {
  title: '',
  genre: 'hardcore',
  players: 6,
  duration: 4,
  difficulty: 'intermediate',
  background: '',
  theme: '',
};

/**
 * 新建剧本页
 */
export default function NewScriptPage() {
  const router = useRouter();
  const [form, setForm] = useState<NewScriptForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof NewScriptForm>(
    key: K,
    value: NewScriptForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('请填写剧本标题');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('未登录，请先登录');
        setSubmitting(false);
        return;
      }

      const id = crypto.randomUUID();
      const { error: insertError } = await supabase.from('scripts').insert({
        id,
        author_id: user.id,
        title: form.title.trim(),
        description: '',
        genre: form.genre,
        player_count: form.players,
        duration_hours: form.duration,
        difficulty: form.difficulty,
        background_setting: form.background.trim(),
        core_theme: form.theme.trim(),
        status: 'draft',
        word_count: 0,
      });

      if (insertError) {
        setError(`创建剧本失败：${insertError.message}`);
        setSubmitting(false);
        return;
      }

      router.push(`/editor/${id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '创建剧本时发生未知错误',
      );
      setSubmitting(false);
    }
  };

  return (
    <section className="view scripts-new-view">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            新建剧本 <span className="seal">草稿</span>
          </h1>
          <div className="page-desc">
            // 填写基础信息创建剧本 · 创建后可进入编辑器补充细节
          </div>
        </div>
        <div className="page-actions">
          <Link href="/scripts" className="btn btn-ghost">
            <ArrowLeft size={14} />
            返回列表
          </Link>
        </div>
      </div>

      {/* ===== 表单卡片 ===== */}
      <div className="card script-form-card">
        <div className="card-head">
          <h3>
            <PenLine size={16} />
            基础信息
          </h3>
        </div>
        <form className="card-body script-form" onSubmit={handleSubmit}>
          {/* 标题 */}
          <div className="form-group">
            <label className="form-label" htmlFor="sf-title">
              剧本标题 <span className="req">*</span>
            </label>
            <input
              id="sf-title"
              className="form-input"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="如：古镇迷案"
              maxLength={50}
              required
            />
          </div>

          {/* 题材 */}
          <div className="form-group">
            <label className="form-label">
              题材 <span className="req">*</span>
            </label>
            <div className="chip-group">
              {GENRE_OPTIONS.map((g) => (
                <span
                  key={g.value}
                  className={`chip ${form.genre === g.value ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => update('genre', g.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      update('genre', g.value);
                    }
                  }}
                >
                  {g.label}
                </span>
              ))}
            </div>
          </div>

          {/* 人数 + 时长 */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="sf-players">
                玩家人数 <span className="req">*</span>
              </label>
              <select
                id="sf-players"
                className="form-select"
                value={form.players}
                onChange={(e) => update('players', Number(e.target.value))}
              >
                {[4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} 人
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sf-duration">
                预计时长 <span className="req">*</span>
              </label>
              <select
                id="sf-duration"
                className="form-select"
                value={form.duration}
                onChange={(e) => update('duration', Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} 小时
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 难度 */}
          <div className="form-group">
            <label className="form-label">
              难度 <span className="req">*</span>
            </label>
            <div className="chip-group">
              {DIFFICULTY_OPTIONS.map((d) => (
                <span
                  key={d.value}
                  className={`chip ${form.difficulty === d.value ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => update('difficulty', d.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      update('difficulty', d.value);
                    }
                  }}
                >
                  {d.label}
                </span>
              ))}
            </div>
          </div>

          {/* 背景设定 */}
          <div className="form-group">
            <label className="form-label" htmlFor="sf-bg">
              背景设定
            </label>
            <input
              id="sf-bg"
              className="form-input"
              value={form.background}
              onChange={(e) => update('background', e.target.value)}
              placeholder="如：清末民初 · 江南古镇"
              maxLength={100}
            />
          </div>

          {/* 核心立意 */}
          <div className="form-group">
            <label className="form-label" htmlFor="sf-theme">
              核心立意
            </label>
            <input
              id="sf-theme"
              className="form-input"
              value={form.theme}
              onChange={(e) => update('theme', e.target.value)}
              placeholder="如：家国亲情 · 旧恨新仇"
              maxLength={100}
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="script-form-error" role="alert">
              {error}
            </div>
          )}

          {/* 提交按钮 */}
          <div className="script-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !form.title.trim()}
            >
              {submitting ? <Loader2 size={14} className="spin" /> : null}
              {submitting ? '创建中…' : '创建并进入编辑器'}
            </button>
            <Link href="/scripts" className="btn btn-ghost">
              取消
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
