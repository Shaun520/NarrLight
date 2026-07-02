/**
 * 继续创作英雄区
 *
 * 三栏 grid: .resume-progress (SVG 环形进度) | .resume-body (标题/问题pill/CTA)
 * | .resume-ai (AI 下一步建议)。
 *
 * 服务端组件：所有跳转通过 next/link 完成，无需客户端交互。
 * current 为 null 时渲染新用户欢迎引导（空状态）。
 */
import Link from 'next/link';
import { Play, CheckSquare, Sparkles, PenLine } from 'lucide-react';
import type { OverviewCurrentScript, OverviewAiSuggestion } from '@/lib/services/overview-service';

interface ResumeHeroProps {
  current: OverviewCurrentScript | null;
  aiSuggestion: OverviewAiSuggestion;
  /** 待办总数（"先处理待办 (N)" 按钮展示） */
  todoCount: number;
}

/** SVG 环形进度：周长 2πr (r=52 ≈ 326.7)，dashoffset 由 progress 推算 */
function ProgressRing({ progress }: { progress: number }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress / 100);
  return (
    <svg viewBox="0 0 120 120" className="ring-svg" aria-hidden="true">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(176,141,87,0.18)" strokeWidth="6" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b08d57" />
          <stop offset="100%" stopColor="#8a1c1c" />
        </linearGradient>
      </defs>
      <text
        x="60"
        y="56"
        textAnchor="middle"
        fill="#e8dcc4"
        fontFamily="Noto Serif SC, serif"
        fontSize="26"
        fontWeight="700"
      >
        {progress}%
      </text>
      <text
        x="60"
        y="76"
        textAnchor="middle"
        fill="#9a8e7a"
        fontFamily="Courier Prime, monospace"
        fontSize="9"
        letterSpacing="2"
      >
        COMPLETE
      </text>
    </svg>
  );
}

export function ResumeHero({ current, aiSuggestion, todoCount }: ResumeHeroProps) {
  if (current === null) {
    return (
      <div className="resume-hero resume-hero--empty">
        <div className="resume-body resume-body--empty">
          <div className="resume-tag">欢迎来到叙光</div>
          <h2 className="resume-title">欢迎使用叙光</h2>
          <div className="resume-loc">
            <PenLine />
            <span>开始你的第一部剧本创作</span>
          </div>
          <div className="resume-cta">
            <Link href="/scripts/new" className="btn btn-primary btn-lg">
              <Play />
              新建剧本
            </Link>
          </div>
        </div>
        <div className="resume-ai">
          <div className="ai-badge">
            <Sparkles />
            AI 下一步建议
          </div>
          <div className="ai-tip">{aiSuggestion.tip}</div>
          <Link href={aiSuggestion.applyHref} className="ai-apply">
            应用建议 →
          </Link>
        </div>
      </div>
    );
  }

  const pills = current.issuePills;
  const pillClass = (kind: 'err' | 'warn' | 'ok') => `ri-pill ri-${kind}`;

  return (
    <div className="resume-hero">
      <div className="resume-progress">
        <ProgressRing progress={current.progress} />
        <div className="resume-stage">{current.stage}</div>
      </div>

      <div className="resume-body">
        <div className="resume-tag">{current.lastEditedTag}</div>
        <h2 className="resume-title">
          {current.title}
          <span className="resume-genre">{current.genre}</span>
        </h2>
        <div className="resume-loc">
          <PenLine />
          <span>
            正在编辑：<b>{current.location}</b>
          </span>
        </div>

        <div className="resume-issues">
          {pills.map((p) =>
            p.href ? (
              <Link key={p.label} href={p.href} className={pillClass(p.kind)}>
                <span className="ri-num">{p.count}</span>
                <span>{p.label}</span>
              </Link>
            ) : (
              <span key={p.label} className={pillClass(p.kind)}>
                <span className="ri-num">{p.count}</span>
                <span>{p.label}</span>
              </span>
            ),
          )}
        </div>

        <div className="resume-cta">
          <Link href={current.editorHref} className="btn btn-primary btn-lg">
            <Play />
            继续写作
          </Link>
          <Link href={current.todoHref} className="btn btn-ghost btn-lg">
            <CheckSquare />
            先处理待办 ({todoCount})
          </Link>
        </div>
      </div>

      <div className="resume-ai">
        <div className="ai-badge">
          <Sparkles />
          AI 下一步建议
        </div>
        <div className="ai-tip">{aiSuggestion.tip}</div>
        <Link href={aiSuggestion.applyHref} className="ai-apply">
          应用建议 →
        </Link>
      </div>
    </div>
  );
}

export default ResumeHero;
