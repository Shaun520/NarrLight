/**
 * 剧本列表页（T133）
 *
 * 路由：/scripts
 *
 * 客户端组件：从 DashboardContext 获取 layout 已加载的剧本列表，
 * 避免重复 getUser() 与 scripts 表查询。以卡片网格展示。
 * 每张卡片显示：标题 / 题材 / 状态 / 进度（字数）。含"新建剧本"按钮。
 * 点击卡片跳转至 /editor/[scriptId]。
 *
 * 视觉对齐古风纸本风格（globals.css 变量），无原型参考，按 card 网格设计。
 */
'use client';
import Link from 'next/link';
import { Plus, FileText, Users, Clock, BarChart3 } from 'lucide-react';
import { useDashboard } from '@/lib/contexts/dashboard-context';
import { EmptyState } from '@/components/common';
import type { ScriptDifficulty, ScriptGenre, ScriptStatus } from '@/types';
import './scripts.css';

/** 题材中文映射 */
const GENRE_LABEL: Record<ScriptGenre, string> = {
  hardcore: '硬核',
  emotion: '情感',
  horror: '惊悚',
  funny: '欢乐',
  mechanism: '机制',
};

/** 难度中文映射 */
const DIFFICULTY_LABEL: Record<ScriptDifficulty, string> = {
  beginner: '新手',
  intermediate: '进阶',
  advanced: '烧脑',
  expert: '专家',
};

/** 状态中文映射 + 颜色 class */
const STATUS_META: Record<ScriptStatus, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'st-draft' },
  generating: { label: '生成中', cls: 'st-gen' },
  completed: { label: '已完成', cls: 'st-done' },
  archived: { label: '已归档', cls: 'st-arch' },
};

/**
 * 剧本列表页
 */
export default function ScriptsPage() {
  const { scripts: list } = useDashboard();

  return (
    <section className="scripts-view">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            我的剧本 <span className="seal">{list.length}</span>
          </h1>
          <div className="page-desc">
            全部创作项目 · 按更新时间倒序 · 点击进入编辑器
          </div>
        </div>
        <div className="page-actions">
          <Link href="/generate" className="btn btn-primary">
            <Plus size={14} />
            新建剧本
          </Link>
        </div>
      </div>

      {/* ===== 卡片网格 ===== */}
      {list.length === 0 ? (
        <EmptyState
          Icon={FileText}
          title="尚未创建剧本"
          description={'点击"新建剧本"开始你的第一部作品'}
          actionText="新建剧本"
          actionHref="/generate"
        />
      ) : (
        <div className="scripts-grid">
          {list.map((s) => {
            const status = STATUS_META[s.status];
            // 进度估算：以字数 / 10000 作为进度（10000 字为 100%）
            const progress = Math.min(
              100,
              Math.round((s.wordCount / 10000) * 100),
            );
            return (
              <Link
                key={s.id}
                href={`/editor/${s.id}`}
                className="script-card"
              >
                <div className="sc-head">
                  <div className="sc-title">{s.title}</div>
                  <span className={`sc-status ${status.cls}`}>
                    {status.label}
                  </span>
                </div>

                <div className="sc-meta">
                  <span className="sc-tag">{GENRE_LABEL[s.genre]}</span>
                  <span className="sc-meta-item">
                    <Users size={12} />
                    {s.playerCount} 人
                  </span>
                  <span className="sc-meta-item">
                    <Clock size={12} />
                    {s.durationHours}h
                  </span>
                  <span className="sc-meta-item">
                    <BarChart3 size={12} />
                    {DIFFICULTY_LABEL[s.difficulty]}
                  </span>
                </div>

                <div className="sc-progress">
                  <div className="sc-progress-bar">
                    <div
                      className="sc-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="sc-progress-text">
                    {s.wordCount.toLocaleString()} 字 · {progress}%
                  </span>
                </div>

                <div className="sc-foot">
                  更新于 {new Date(s.updatedAt).toLocaleDateString('zh-CN')}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
