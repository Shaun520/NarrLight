/**
 * 待办汇总面板
 *
 * 卡片头（标题 + 错误徽标）+ 按分组（时间冲突/逻辑漏洞/伏笔悬挂）
 * 列出每条待办，点击跳转对应校验页。
 */
import Link from 'next/link';
import { CheckSquare } from 'lucide-react';
import type { OverviewTodoGroup } from '@/lib/services/overview-service';
import { EmptyState } from '@/components/common';

interface TodoPanelProps {
  groups: OverviewTodoGroup[];
  /** 总待办数（用于头部 badge） */
  total: number;
}

export function TodoPanel({ groups, total }: TodoPanelProps) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <CheckSquare />
          待办汇总
        </h3>
        {total > 0 ? <span className="badge err">{total}</span> : null}
      </div>
      <div className="card-body todo-list">
        {groups.map((g) => (
          <div key={g.kind} className="todo-group">
            <div className="tg-label">
              <i className={`dot ${g.dotClass}`} />
              {g.label} · {g.count}
            </div>
            {g.items.map((item, idx) => (
              <Link key={`${g.kind}-${idx}`} href={item.href} className="todo-item">
                <span className="ti-script">{item.scriptTitle}</span>
                <span className="ti-desc">{item.description}</span>
              </Link>
            ))}
          </div>
        ))}
        {groups.length === 0 ? (
          <EmptyState
            title="暂无待办"
            description="创建剧本后这里会显示校验待办"
          />
        ) : null}
      </div>
    </div>
  );
}

export default TodoPanel;
