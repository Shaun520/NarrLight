/**
 * 剧本工作流列表
 *
 * 卡片头（标题 + tabs）+ 工作流剧本卡列表（.wf-card）。
 * 每张卡含进度条、状态标签、待办计数与 meta。
 * 点击整卡跳转编辑器。
 */
import Link from 'next/link';
import { List } from 'lucide-react';
import type { OverviewWorkflowCard } from '@/lib/services/overview-service';

interface WorkflowListProps {
  workflows: OverviewWorkflowCard[];
  /** tabs 文案：进行中 / 已完成 / 草稿 计数 */
  tabs?: { active?: boolean; label: string }[];
}

const DEFAULT_TABS = [
  { active: true, label: '进行中 3' },
  { active: false, label: '已完成 2' },
  { active: false, label: '草稿 1' },
];

export function WorkflowList({ workflows, tabs = DEFAULT_TABS }: WorkflowListProps) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <List />
          我的剧本
        </h3>
        <div className="card-tabs">
          {tabs.map((t) => (
            <span key={t.label} className={`ct${t.active ? ' active' : ''}`}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <div className="workflow-list">
        {workflows.map((wf) => (
          <Link
            key={wf.id}
            href={wf.href}
            className={`wf-card${wf.done ? ' done' : ''}`}
          >
            <div className="wf-head">
              <div className="wf-title-wrap">
                <span className="wf-title">{wf.title}</span>
                <span className="wf-genre">{wf.genre}</span>
              </div>
              <span className={`status-tag st-${wf.status}`}>{wf.statusLabel}</span>
            </div>
            <div className="wf-bar">
              <div className="wf-bar-fill" style={{ width: `${wf.progress}%` }} />
            </div>
            <div className="wf-meta">
              <span>
                <b>{wf.progress}%</b> · {wf.stage}
              </span>
              <span className={`wf-issues${wf.issues.dotClass === 'ok' ? ' ok' : ''}`}>
                <i className={`dot ${wf.issues.dotClass}`} />
                {wf.issues.label}
              </span>
              <span>{wf.meta}</span>
              <span>{wf.updatedAt}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default WorkflowList;
