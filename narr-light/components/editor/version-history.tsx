/**
 * 版本历史卡组件（T138）
 *
 * 严格对齐原型 workbench2.html .side-panel .version-item（4287-4299 行）。
 * 展示 .version-item 列表（.vi-head + .vi-note），当前版本带 .current 标记。
 * 支持点击一键回退。
 */

'use client';

/** 版本条目 */
export interface VersionItem {
  /** 版本号，如 "v3" */
  version: string;
  /** 时间标签，如 "14:32 今日" */
  time: string;
  /** 变更摘要 */
  note: string;
  /** 是否为当前版本 */
  isCurrent?: boolean;
}

interface VersionHistoryProps {
  /** 版本列表（按时间倒序） */
  versions: VersionItem[];
  /** 选择版本进行回退 */
  onRollback: (version: string) => void;
}

/**
 * 版本历史
 */
export function VersionHistory({ versions, onRollback }: VersionHistoryProps) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          版本历史
        </h3>
      </div>
      <div className="card-body" style={{ padding: '10px' }}>
        {versions.length === 0 ? (
          <div
            style={{
              padding: '12px',
              color: 'var(--sepia)',
              fontSize: '12.5px',
              textAlign: 'center',
            }}
          >
            暂无版本记录
          </div>
        ) : (
          versions.map((item) => (
            <div
              key={item.version}
              className={`version-item ${item.isCurrent ? 'current' : ''}`}
              role="button"
              tabIndex={0}
              title={item.isCurrent ? '当前版本' : `回退到 ${item.version}`}
              onClick={() => {
                if (!item.isCurrent) onRollback(item.version);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !item.isCurrent) {
                  e.preventDefault();
                  onRollback(item.version);
                }
              }}
            >
              <div className="vi-head">
                <b>{item.version}</b>
                <span>{item.time}</span>
              </div>
              <div className="vi-note">{item.note}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
