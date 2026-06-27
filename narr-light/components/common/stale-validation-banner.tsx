/**
 * 跨模块变更提示 banner（T162）
 *
 * 剧本 / 线索 / 人物 / 真相复盘被修改后，原有逻辑校验结果失效，
 * 需在逻辑校验页顶部展示 banner 提示"已修改 N 处，建议重新校验"。
 *
 * 数据来源：
 *   - 由编辑器 / 线索管理页上报变更到 sessionStorage；
 *   - 本组件挂载时读取并展示；
 *   - 提供"立即复检 / 忽略"两个动作。
 *
 * 客户端组件：useEffect 读 sessionStorage，定时刷新。
 */
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

/** 单条变更记录 */
export interface StaleChange {
  /** 模块 */
  module: 'editor' | 'clues' | 'truth' | 'characters';
  /** 变更描述，如 "第二幕 第3段" / "线索卡 #C-12" */
  description: string;
  /** 变更时间戳 */
  changedAt: number;
}

const STORAGE_KEY = 'narrlight:stale-validation-changes';

interface StaleValidationBannerProps {
  scriptId: string;
  /** 上次校验时间戳；早于此时间的变更视为过期 */
  validatedAt: number;
  /** 立即复检回调 */
  onRevalidate?: () => void;
  /** 忽略回调（清除变更记录） */
  onDismiss?: () => void;
}

/** 读取变更记录 */
export function readStaleChanges(): StaleChange[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StaleChange[];
  } catch {
    return [];
  }
}

/** 写入一条变更记录（编辑器 / 线索管理页调用） */
export function pushStaleChange(change: StaleChange): void {
  if (typeof window === 'undefined') return;
  const list = readStaleChanges();
  list.push(change);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** 清空变更记录 */
export function clearStaleChanges(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** 模块中文标签 */
const MODULE_LABEL: Record<StaleChange['module'], string> = {
  editor: '剧本',
  clues: '线索卡',
  truth: '真相复盘',
  characters: '人物',
};

export function StaleValidationBanner({
  scriptId,
  validatedAt,
  onRevalidate,
  onDismiss,
}: StaleValidationBannerProps) {
  const [changes, setChanges] = useState<StaleChange[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const all = readStaleChanges();
    // 仅展示校验之后产生的变更
    const stale = all.filter((c) => c.changedAt > validatedAt);
    setChanges(stale);

    // 监听其他 tab 的变更（storage 事件）
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const fresh = readStaleChanges().filter((c) => c.changedAt > validatedAt);
        setChanges(fresh);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [validatedAt, scriptId]);

  const handleDismiss = () => {
    setDismissed(true);
    clearStaleChanges();
    onDismiss?.();
  };

  if (dismissed || changes.length === 0) return null;

  // 按模块聚合计数
  const counts: Partial<Record<StaleChange['module'], number>> = {};
  for (const c of changes) {
    counts[c.module] = (counts[c.module] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([m, n]) => `${MODULE_LABEL[m as StaleChange['module']]} ${n}`)
    .join('、');

  return (
    <div className="stale-banner" role="alert">
      <AlertTriangle size={16} className="stale-banner-icon" />
      <div className="stale-banner-text">
        <strong>校验结果已过期：</strong>
        自上次校验以来已修改 {summary}，共 {changes.length} 处。建议重新执行
        <span className="stale-banner-action">增量复检</span>或全量校验。
      </div>
      <div className="stale-banner-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onRevalidate}
        >
          <RefreshCw size={13} />
          立即复检
        </button>
        <button
          type="button"
          className="stale-banner-close"
          onClick={handleDismiss}
          aria-label="忽略"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
