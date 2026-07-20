/**
 * 批量导出任务进度展示（T174）
 *
 * 在批量导出线索卡（PDF / 图片 / ZIP）过程中，以模态浮层展示整体进度。
 * 受控组件：父级维护 open / total / done / status，本组件只负责呈现。
 */
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle, X } from 'lucide-react';

export type ExportStatus = 'idle' | 'running' | 'completed' | 'failed';

interface ExportProgressProps {
  open: boolean;
  /** 任务总数 */
  total: number;
  /** 已完成数 */
  done: number;
  /** 任务状态 */
  status: ExportStatus;
  /** 当前正在处理的条目名（可选） */
  currentLabel?: string;
  /** 模态标题（默认「批量导出线索卡」，可复用于重绘等场景） */
  title?: string;
  /** 当前条目前缀（默认「正在导出」，可复用于重绘等场景） */
  currentLabelPrefix?: string;
  /** 完成提示文案（默认「导出完成，文件已开始下载。」） */
  completedTip?: string;
  /** 失败提示文案（默认「导出失败，请重试或检查浏览器下载权限。」） */
  failedTip?: string;
  /** 关闭回调（状态为 completed/failed 时可关闭） */
  onClose?: () => void;
}

/**
 * 导出进度模态
 */
export function ExportProgress({
  open,
  total,
  done,
  status,
  currentLabel,
  title = '批量导出线索卡',
  currentLabelPrefix = '正在导出',
  completedTip = '导出完成，文件已开始下载。',
  failedTip = '导出失败，请重试或检查浏览器下载权限。',
  onClose,
}: ExportProgressProps) {
  const [dismissed, setDismissed] = useState(false);

  // 每次重新开启任务时重置已关闭标记
  useEffect(() => {
    if (open && status === 'running') setDismissed(false);
  }, [open, status]);

  if (!open || dismissed) return null;

  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const closable = status === 'completed' || status === 'failed';

  const handleClose = () => {
    setDismissed(true);
    onClose?.();
  };

  return (
    <div className="export-progress-mask" role="dialog" aria-modal="true">
      <div className="export-progress-modal">
        <div className="epm-head">
          <div className="epm-title">
            {status === 'running' && <Loader2 size={16} className="epm-spin" />}
            {status === 'completed' && <CheckCircle2 size={16} className="epm-ok" />}
            {status === 'failed' && <XCircle size={16} className="epm-err" />}
            <span>{title}</span>
          </div>
          {closable && (
            <button type="button" className="epm-close" onClick={handleClose} aria-label="关闭">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="epm-bar-wrap">
          <div className="epm-bar" style={{ width: `${percent}%` }} />
        </div>

        <div className="epm-meta">
          <span className="epm-percent">{percent}%</span>
          <span className="epm-count">
            {done} / {total}
          </span>
        </div>

        {currentLabel && status === 'running' && (
          <div className="epm-current" title={currentLabel}>
            {currentLabelPrefix}：{currentLabel}
          </div>
        )}

        {status === 'completed' && (
          <div className="epm-tip ok">{completedTip}</div>
        )}
        {status === 'failed' && (
          <div className="epm-tip err">{failedTip}</div>
        )}
      </div>
    </div>
  );
}

export default ExportProgress;
