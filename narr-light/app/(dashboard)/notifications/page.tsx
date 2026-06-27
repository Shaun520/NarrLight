/**
 * 通知列表页 - 全量通知浏览与已读管理
 *
 * 路由：/notifications
 *
 * 客户端组件：
 *   - 通过浏览器 Supabase Client 获取当前用户
 *   - 调用 notificationService.getNotifications() 拉取通知
 *   - 顶部筛选 tabs：全部 / 校验 / 生成 / 版本 / 社区
 *   - 列表项含图标、标题、描述、时间、未读红点
 *   - 点击通知标记已读，带 link 的项跳转
 *   - 顶部「全部标记已读」按钮
 *   - 空状态展示
 *
 * 图标与配色复用 notification-panel 组件约定。
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Save,
  Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  notificationService,
  type NotificationItem,
  type NotificationType,
} from '@/lib/services/notification-service';
import './notifications.css';

/** 筛选标签 */
type FilterTab = 'all' | NotificationType;

/** 标签配置 */
const TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'validation', label: '校验' },
  { key: 'generation', label: '生成' },
  { key: 'version', label: '版本' },
  { key: 'community', label: '社区' },
];

/** 类型 → 图标 */
const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  validation: CheckCircle2,
  generation: Sparkles,
  version: Save,
  community: MessageCircle,
};

/** 类型 → 图标颜色（与 notification-panel 一致） */
const TYPE_COLOR: Record<NotificationType, string> = {
  validation: 'var(--ok)',
  generation: 'var(--blood)',
  version: 'var(--gold)',
  community: 'var(--info)',
};

/** 类型中文标签 */
const TYPE_LABEL: Record<NotificationType, string> = {
  validation: '校验',
  generation: '生成',
  version: '版本',
  community: '社区',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [marking, setMarking] = useState(false);

  // 获取当前用户
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;
        if (user) setUserId(user.id);
      } catch {
        // 静默处理：布局层会拦截未登录态
      } finally {
        if (active) setAuthChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 用户就绪后加载通知
  const loadNotifications = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const list = await notificationService.getNotifications(uid);
      setNotifications(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked && !userId) {
      router.replace('/auth/login');
      return;
    }
    if (userId) {
      void loadNotifications(userId);
    }
  }, [authChecked, userId, router, loadNotifications]);

  // 筛选结果
  const filtered = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.type === activeTab);
  }, [notifications, activeTab]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications],
  );

  // 点击单条：标记已读 + 跳转
  const handleClick = useCallback(
    async (item: NotificationItem) => {
      if (!userId) return;
      if (item.unread) {
        // 乐观更新
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n)),
        );
        try {
          await notificationService.markAsRead(item.id, userId);
        } catch {
          // 回滚
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === item.id ? { ...n, unread: true } : n,
            ),
          );
        }
      }
      if (item.link) {
        router.push(item.link);
      }
    },
    [userId, router],
  );

  // 全部标记已读
  const handleMarkAll = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    setMarking(true);
    const prev = notifications;
    setNotifications((list) => list.map((n) => ({ ...n, unread: false })));
    try {
      await notificationService.markAllRead(userId);
    } catch {
      setNotifications(prev);
    } finally {
      setMarking(false);
    }
  }, [userId, notifications, unreadCount]);

  // 鉴权未完成：显示加载态
  if (!authChecked || (userId && loading && notifications.length === 0)) {
    return (
      <section className="view notifications-page">
        <div className="notif-loading">
          <Loader2 size={22} className="notif-spin" />
          <span>加载通知中…</span>
        </div>
      </section>
    );
  }

  return (
    <section className="view notifications-page">
      {/* ============ 页头 ============ */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Bell size={22} />
            通知中心 <span className="seal">NOTICE</span>
          </h1>
          <div className="page-desc">
            {unreadCount > 0
              ? `你有 ${unreadCount} 条未读通知`
              : '查看全部通知动态'}
          </div>
        </div>
        <div className="page-actions">
          <Link href="/dashboard" className="btn btn-ghost">
            返回概览
          </Link>
          <button
            type="button"
            className="btn btn-primary notif-markall-btn"
            onClick={handleMarkAll}
            disabled={marking || unreadCount === 0}
          >
            <CheckCheck size={15} />
            全部标记已读
          </button>
        </div>
      </div>

      {/* ============ 筛选标签 ============ */}
      <nav className="notif-tabs" aria-label="通知筛选">
        {TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? notifications.length
              : notifications.filter((n) => n.type === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              className={`notif-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="notif-tab-count">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* ============ 通知列表 ============ */}
      {filtered.length === 0 ? (
        <div className="notif-empty">
          <div className="notif-empty-icon">
            <Bell size={26} />
          </div>
          <div className="notif-empty-title">暂无通知</div>
          <div className="notif-empty-desc">
            {activeTab === 'all'
              ? '当前没有通知，新的动态会显示在这里。'
              : `「${TYPE_LABEL[activeTab as NotificationType]}」分类下暂无通知。`}
          </div>
        </div>
      ) : (
        <div className="notif-list">
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.type];
            const color = TYPE_COLOR[item.type];
            return (
              <button
                key={item.id}
                type="button"
                className={`notif-item ${item.unread ? 'unread' : ''}`}
                onClick={() => handleClick(item)}
              >
                <div className="notif-icon" style={{ color }}>
                  <Icon size={16} />
                </div>
                <div className="notif-body">
                  <div className="notif-title-row">
                    <span className="notif-type-tag" style={{ color }}>
                      {TYPE_LABEL[item.type]}
                    </span>
                    <span className="notif-title">{item.title}</span>
                    {item.unread ? (
                      <span className="notif-dot" aria-label="未读" />
                    ) : null}
                  </div>
                  <div className="notif-desc">{item.desc}</div>
                  <div className="notif-time">{item.time}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
