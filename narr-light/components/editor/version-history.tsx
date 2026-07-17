/**
 * 保存记录卡组件（T138）
 *
 * 严格对齐原型 workbench2.html .side-panel .version-item（4287-4299 行）。
 * 展示 .version-item 列表（.vi-head + .vi-note），当前版本带 .current 标记。
 * 历史版本通过显式按钮预览、恢复或删除，避免误点整张卡片触发耗时操作。
 */

'use client';

/** 版本条目 */
export interface VersionItem {
  /** 版本号，如 "v3" */
  version: string;
  /** 数字版本号，用于服务端恢复 */
  versionNumber?: number;
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
  /** 预览历史版本 */
  onPreview: (version: string) => void;
  /** 请求恢复历史版本 */
  onRestoreRequest: (version: string) => void;
  /** 请求删除历史版本 */
  onDeleteRequest: (version: string) => void;
  /** 是否正在执行恢复 */
  isRollingBack?: boolean;
  /** 当前正在恢复的版本号 */
  rollingBackVersion?: string | null;
  /** 是否正在执行删除 */
  isDeletingVersion?: boolean;
  /** 当前正在删除的版本号 */
  deletingVersion?: string | null;
}

function displayNote(note: string): string {
  const rollbackMatch = note.match(/^回滚到版本\s*(\d+)$/);
  if (rollbackMatch) return `由 v${rollbackMatch[1]} 恢复后保存`;
  return note || '手动保存';
}

/**
 * 保存记录
 */
export function VersionHistory({
  versions,
  onPreview,
  onRestoreRequest,
  onDeleteRequest,
  isRollingBack = false,
  rollingBackVersion = null,
  isDeletingVersion = false,
  deletingVersion = null,
}: VersionHistoryProps) {
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
          保存记录
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
          versions.map((item) => {
            const rollingThis = rollingBackVersion === item.version;
            const deletingThis = deletingVersion === item.version;
            const actionDisabled = isRollingBack || isDeletingVersion;
            return (
              <div key={item.version} className={`version-item ${item.isCurrent ? 'current' : ''}`}>
                <div className="vi-head">
                  <b>{item.version}</b>
                  <span>{item.time}</span>
                </div>
                <div className="vi-note">{displayNote(item.note)}</div>
                <div className="vi-actions">
                  {item.isCurrent ? (
                    <span className="vi-current-badge">当前版本</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="vi-preview-btn"
                        disabled={actionDisabled}
                        onClick={() => onPreview(item.version)}
                      >
                        预览
                      </button>
                      <button
                        type="button"
                        className="vi-rollback-btn"
                        disabled={actionDisabled}
                        onClick={() => onRestoreRequest(item.version)}
                      >
                        {rollingThis ? '恢复中...' : '恢复'}
                      </button>
                      <button
                        type="button"
                        className="vi-delete-btn"
                        disabled={actionDisabled}
                        onClick={() => onDeleteRequest(item.version)}
                      >
                        {deletingThis ? '删除中...' : '删除'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
