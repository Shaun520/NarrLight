/**
 * 通知面板组件（T311）
 *
 * 顶栏通知按钮 + 下拉面板：
 *   - 点击按钮展开/收起
 *   - 展开后展示最近 10 条通知（图标/标题/描述/时间/未读红点）
 *   - 通知类型：校验完成 / 生成完成 / 版本保存 / 社区互动
 *   - 点击外部或 ESC 收起
 *   - 底部「查看全部」链接
 *
 * 客户端组件：useRef + useEffect 监听 mousedown / keydown。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  MessageCircle,
  Save,
  Sparkles,
} from 'lucide-react';

/** 通知类型 */
export type NotificationType =
  | 'validation'
  | 'generation'
  | 'version'
  | 'community';

/** 单条通知 */
export interface NotificationItem {
  id: number;
  type: NotificationType;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

/** 默认 Mock 通知数据（开发期） */
const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  { id: 1, type: 'validation', title: '逻辑校验完成', desc: '发现 3 个待处理问题', time: '5分钟前', unread: true },
  { id: 2, type: 'generation', title: '剧本生成完成', desc: '古镇迷案 已生成 12000 字', time: '1小时前', unread: true },
  { id: 3, type: 'version', title: '版本已保存', desc: '第三幕修改已存档为 v1.3', time: '2小时前', unread: true },
  { id: 4, type: 'community', title: '收到新评论', desc: '「夜行者」评论了你的《古镇迷案》', time: '3小时前', unread: true },
  { id: 5, type: 'validation', title: '时间线冲突已修复', desc: '自动修复 2 处时间冲突', time: '昨天', unread: false },
  { id: 6, type: 'generation', title: '插画生成完成', desc: '角色「沈墨白」插画已生成', time: '昨天', unread: false },
  { id: 7, type: 'version', title: '版本回滚', desc: '已回滚到 v1.2', time: '2天前', unread: false },
  { id: 8, type: 'community', title: '新增关注', desc: '「青衣」关注了你', time: '2天前', unread: false },
  { id: 9, type: 'validation', title: '校验完成', desc: '未发现逻辑问题', time: '3天前', unread: false },
  { id: 10, type: 'generation', title: '剧本生成完成', desc: '《夜雨长安》已生成 8000 字', time: '3天前', unread: false },
];

/** 类型 → 图标 */
const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  validation: CheckCircle2,
  generation: Sparkles,
  version: Save,
  community: MessageCircle,
};

/** 类型 → 图标颜色（使用项目配色变量） */
const TYPE_COLOR: Record<NotificationType, string> = {
  validation: 'var(--ok)',
  generation: 'var(--blood)',
  version: 'var(--gold)',
  community: 'var(--info)',
};

interface NotificationPanelProps {
  /** 通知列表（可选，默认使用 Mock 数据） */
  notifications?: NotificationItem[];
}

export function NotificationPanel({ notifications = DEFAULT_NOTIFICATIONS }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const list = notifications.slice(0, 10);
  const unreadCount = list.filter((n) => n.unread).length;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        title="通知"
        aria-label="通知"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ position: 'relative' }}
      >
        <Bell />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--blood-bright)',
              boxShadow: '0 0 6px var(--blood)',
              border: '1px solid var(--paper-light)',
            }}
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="通知列表"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 340,
            maxHeight: 460,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--paper-lighter)',
            border: '1px solid rgba(138, 28, 28, 0.22)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(138, 28, 28, 0.15)',
              fontFamily: '"Noto Serif SC", serif',
              fontSize: 13.5,
              fontWeight: 700,
              color: 'var(--ink)',
            }}
          >
            <span>通知</span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontFamily: '"Courier Prime", monospace',
                  fontSize: 11,
                  color: 'var(--blood)',
                  background: 'rgba(138, 28, 28, 0.1)',
                  padding: '1px 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(138, 28, 28, 0.25)',
                }}
              >
                {unreadCount} 条未读
              </span>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {list.length === 0 ? (
              <div
                style={{
                  padding: '28px 14px',
                  textAlign: 'center',
                  fontFamily: '"Noto Serif SC", serif',
                  fontSize: 12.5,
                  color: 'var(--sepia)',
                }}
              >
                暂无通知
              </div>
            ) : (
              list.map((n) => {
                const Icon = TYPE_ICON[n.type];
                const color = TYPE_COLOR[n.type];
                return (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(26, 18, 11, 0.06)',
                      background: n.unread ? 'rgba(138, 28, 28, 0.04)' : 'transparent',
                      transition: 'background 0.15s',
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(138, 28, 28, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = n.unread
                        ? 'rgba(138, 28, 28, 0.04)'
                        : 'transparent';
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `rgba(138, 28, 28, 0.08)`,
                        color,
                        border: `1px solid ${color}33`,
                      }}
                    >
                      <Icon size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--ink)',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.title}
                        </span>
                        {n.unread && (
                          <span
                            aria-label="未读"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: 'var(--blood-bright)',
                              flexShrink: 0,
                              boxShadow: '0 0 4px var(--blood)',
                            }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--char)',
                          marginTop: 2,
                          lineHeight: 1.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.desc}
                      </div>
                      <div
                        style={{
                          fontFamily: '"Courier Prime", monospace',
                          fontSize: 10.5,
                          color: 'var(--sepia)',
                          marginTop: 3,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {n.time}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Link
            href="/notifications"
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '10px 14px',
              borderTop: '1px solid rgba(138, 28, 28, 0.15)',
              fontFamily: '"Noto Serif SC", serif',
              fontSize: 12.5,
              color: 'var(--blood)',
              textDecoration: 'none',
              letterSpacing: '0.06em',
              background: 'rgba(243, 233, 219, 0.4)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(138, 28, 28, 0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(243, 233, 219, 0.4)';
            }}
          >
            查看全部
          </Link>
        </div>
      )}
    </div>
  );
}
