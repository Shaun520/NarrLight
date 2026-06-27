/**
 * 叙光全局状态视图组件（T200）
 *
 * 提供 LoadingState / ErrorState / EmptyState 三个统一状态组件，
 * 用于在数据加载、错误、空数据场景下保持视觉一致性。
 *
 * 视觉对齐项目古风系统：朱砂红（var(--blood)）+ 纸张色（var(--paper-lighter)）。
 * 图标使用 lucide-react；不使用 any；客户端组件以便后续可挂在交互按钮。
 */
'use client';

import React from 'react';
import {
  AlertTriangle,
  Inbox,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';

/** LoadingStateProps */
export interface LoadingStateProps {
  /** 提示文案 */
  tip?: string;
  /** 自定义图标（默认旋转 Loader2） */
  Icon?: LucideIcon;
  /** 是否铺满父容器高度（居中显示） */
  fullscreen?: boolean;
  /** 额外 className */
  className?: string;
}

/** ErrorStateProps */
export interface ErrorStateProps {
  /** 错误标题 */
  title?: string;
  /** 错误详细信息 */
  message?: string;
  /** 自定义图标（默认 AlertTriangle） */
  Icon?: LucideIcon;
  /** 重试按钮文案；不传则不显示按钮 */
  retryText?: string;
  /** 重试回调 */
  onRetry?: () => void;
  /** 额外 className */
  className?: string;
}

/** EmptyStateProps */
export interface EmptyStateProps {
  /** 提示标题 */
  title?: string;
  /** 描述文案 */
  description?: string;
  /** 自定义图标（默认 Inbox） */
  Icon?: LucideIcon;
  /** 可选操作按钮文案 */
  actionText?: string;
  /** 操作按钮回调 */
  onAction?: () => void;
  /** 额外 className */
  className?: string;
}

/**
 * 加载中状态：旋转图标 + 文案，古风印章质感容器
 */
export function LoadingState({
  tip = '正在加载…',
  Icon = Loader2,
  fullscreen = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={`state-view state-loading${fullscreen ? ' state-fullscreen' : ''}${
        className ? ` ${className}` : ''
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Icon className="state-spin" size={28} aria-hidden="true" />
      <div className="state-tip">{tip}</div>
    </div>
  );
}

/**
 * 错误状态：错误图标 + 错误信息 + 重试按钮
 */
export function ErrorState({
  title = '出错了',
  message = '请稍后重试，或联系管理员。',
  Icon = AlertTriangle,
  retryText,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={`state-view state-error${className ? ` ${className}` : ''}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="state-icon-wrap state-icon-err" aria-hidden="true">
        <Icon size={26} />
      </div>
      <div className="state-title">{title}</div>
      {message ? <div className="state-desc">{message}</div> : null}
      {retryText && onRetry ? (
        <button
          type="button"
          className="state-btn"
          onClick={onRetry}
          aria-label={retryText}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {retryText}
        </button>
      ) : null}
    </div>
  );
}

/**
 * 空状态：空图标 + 提示文案 + 可选操作按钮
 */
export function EmptyState({
  title = '暂无数据',
  description,
  Icon = Inbox,
  actionText,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`state-view state-empty${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="state-icon-wrap state-icon-empty" aria-hidden="true">
        <Icon size={26} />
      </div>
      <div className="state-title">{title}</div>
      {description ? <div className="state-desc">{description}</div> : null}
      {actionText && onAction ? (
        <button
          type="button"
          className="state-btn state-btn-ghost"
          onClick={onAction}
          aria-label={actionText}
        >
          {actionText}
        </button>
      ) : null}
    </div>
  );
}

export default LoadingState;
