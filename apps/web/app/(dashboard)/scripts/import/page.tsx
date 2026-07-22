'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileInput, Loader2 } from 'lucide-react';
import type { ScriptDifficulty, ScriptGenre } from '@/types';
import '../scripts.css';

const GENRES: Array<{ value: ScriptGenre; label: string }> = [
  { value: 'hardcore', label: '硬核' },
  { value: 'emotion', label: '情感' },
  { value: 'horror', label: '惊悚' },
  { value: 'funny', label: '欢乐' },
  { value: 'mechanism', label: '机制' },
];

const DIFFICULTIES: Array<{ value: ScriptDifficulty; label: string }> = [
  { value: 'beginner', label: '新手' },
  { value: 'intermediate', label: '进阶' },
  { value: 'advanced', label: '烧脑' },
  { value: 'expert', label: '专家' },
];

interface ImportResponse {
  scriptId?: string;
  error?: string;
}

export default function ScriptImportPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState<ScriptGenre>('hardcore');
  const [difficulty, setDifficulty] = useState<ScriptDifficulty>('intermediate');
  const [playerCount, setPlayerCount] = useState(6);
  const [durationHours, setDurationHours] = useState(4);
  const [backgroundSetting, setBackgroundSetting] = useState('');
  const [coreTheme, setCoreTheme] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sourceStats = useMemo(() => {
    const cjk = sourceText.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    const latin = sourceText.match(/[A-Za-z0-9]+/g)?.length ?? 0;
    const blocks = sourceText.trim() ? sourceText.trim().split(/\n{2,}/).filter(Boolean).length : 0;
    return { words: cjk + latin, blocks };
  }, [sourceText]);

  const canSubmit = title.trim().length > 0 && sourceText.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/scripts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          genre,
          difficulty,
          playerCount,
          durationHours,
          backgroundSetting,
          coreTheme,
          sourceText,
        }),
      });
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok || !payload.scriptId) {
        throw new Error(payload.error || '导入失败');
      }
      router.push(`/editor/${payload.scriptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="scripts-new-view">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            导入已有设计 <span className="seal">BETA</span>
          </h1>
          <div className="page-desc">粘贴设计稿 - 生成可编辑草稿 - 进入编辑器继续改造</div>
        </div>
        <div className="page-actions">
          <Link href="/scripts" className="btn btn-ghost">
            <ArrowLeft size={14} />
            返回作品
          </Link>
        </div>
      </div>

      <div className="import-layout">
        <div className="card script-import-card">
          <div className="card-head">
            <h3>
              <FileInput size={16} />
              导入信息
            </h3>
          </div>
          <div className="card-body script-form">
            {error && <div className="script-form-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="import-title">
                剧本标题 <span className="req">*</span>
              </label>
              <input
                id="import-title"
                className="form-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="import-players">玩家人数</label>
                <input
                  id="import-players"
                  className="form-input"
                  type="number"
                  min={1}
                  max={12}
                  value={playerCount}
                  onChange={(event) => setPlayerCount(Number(event.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="import-duration">预计时长</label>
                <input
                  id="import-duration"
                  className="form-input"
                  type="number"
                  min={1}
                  max={12}
                  value={durationHours}
                  onChange={(event) => setDurationHours(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">题材</label>
              <div className="chip-group" role="group" aria-label="题材">
                {GENRES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`chip ${genre === item.value ? 'active' : ''}`}
                    onClick={() => setGenre(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">难度</label>
              <div className="chip-group" role="group" aria-label="难度">
                {DIFFICULTIES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`chip ${difficulty === item.value ? 'active' : ''}`}
                    onClick={() => setDifficulty(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="import-background">背景设定</label>
              <input
                id="import-background"
                className="form-input"
                value={backgroundSetting}
                onChange={(event) => setBackgroundSetting(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="import-theme">核心立意</label>
              <input
                id="import-theme"
                className="form-input"
                value={coreTheme}
                onChange={(event) => setCoreTheme(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card script-import-card">
          <div className="card-head">
            <h3>设计稿原文</h3>
            <span className="import-counter">
              {sourceStats.words.toLocaleString()} 字 / {sourceStats.blocks} 段
            </span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label" htmlFor="import-source">
                粘贴已有设计稿 <span className="req">*</span>
              </label>
              <textarea
                id="import-source"
                className="form-textarea import-source"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="可粘贴故事大纲、人物设定、分幕结构、线索说明或完整设计稿。空行会作为片段拆分依据。"
              />
            </div>

            <div className="import-summary">
              <div>
                <strong>导入后会创建草稿</strong>
                <span>原文会进入编辑器，后续可继续保存、回滚和局部改造。</span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? <Loader2 size={14} className="spin" /> : <FileInput size={14} />}
                {submitting ? '导入中' : '导入并进入编辑器'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
