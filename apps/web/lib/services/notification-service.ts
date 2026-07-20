/**
 * 通知服务
 *
 * 提供通知列表获取与已读标记能力，覆盖 4 类通知来源：
 *   - validation  校验结果通知（时间线冲突 / 逻辑漏洞 / 难度评估完成）
 *   - generation  生成任务通知（一键生成 / AI 补全 / 插画生成）
 *   - version     版本管理通知（自动保存 / 手动快照 / 回滚）
 *   - community   社区互动通知（点赞 / 评论 / 拼车 / 关注）
 *
 * 当前为开发期 Mock 实现：内存中维护 10 条 Mock 通知，覆盖 4 种类型；
 * 后续接入真实数据库（notifications 表）时替换方法体即可，对外接口不变。
 *
 * 设计要点：
 * - 单例 notificationService 便于在客户端组件中直接调用；
 * - Mock 状态按 userId 隔离，模拟多用户场景；
 * - markAsRead / markAllRead 同步更新内存，getUnreadCount 实时计算。
 */

/** 通知类型 */
export type NotificationType =
  | 'validation'
  | 'generation'
  | 'version'
  | 'community';

/** 单条通知项 */
export interface NotificationItem {
  /** 通知 ID */
  id: string;
  /** 通知类型 */
  type: NotificationType;
  /** 标题（简短一行） */
  title: string;
  /** 描述（详情，1-2 句） */
  desc: string;
  /** 相对时间描述，例 "5 分钟前" / "2 小时前" */
  time: string;
  /** 是否未读 */
  unread: boolean;
  /** 点击跳转地址（可选） */
  link?: string;
}

/** 按用户隔离的通知存储（Mock 内存态） */
type UserNotificationStore = Map<string, NotificationItem[]>;

/** Mock 数据生成时间锚点（用于相对时间描述） */
const MOCK_BASE_TIME = Date.now();

/**
 * 通知服务。
 *
 * Mock 实现：内存 Map 按 userId 隔离；首次调用 getNotifications 时懒加载
 * 10 条 Mock 数据（覆盖 4 种类型）。后续接入真实 DB 时，将各方法改为
 * supabase 查询即可，对外接口保持不变。
 */
export class NotificationService {
  /** 内存存储（按 userId 隔离） */
  private store: UserNotificationStore = new Map();

  /**
   * 获取通知列表（按时间倒序，最新在前）。
   *
   * @param userId 用户 ID
   */
  async getNotifications(userId: string): Promise<NotificationItem[]> {
    const list = this.getOrCreateStore(userId);
    // 复制一份，避免外部直接修改内部状态
    return list.slice().map((n) => ({ ...n }));
  }

  /**
   * 标记单条通知为已读。
   *
   * @param id     通知 ID
   * @param userId 用户 ID（用于定位存储）
   */
  async markAsRead(id: string, userId: string): Promise<boolean> {
    const list = this.getOrCreateStore(userId);
    const target = list.find((n) => n.id === id);
    if (!target) return false;
    target.unread = false;
    return true;
  }

  /**
   * 标记某用户全部通知为已读。
   *
   * @param userId 用户 ID
   * @returns 被标记为已读的条目数
   */
  async markAllRead(userId: string): Promise<number> {
    const list = this.getOrCreateStore(userId);
    let marked = 0;
    for (const n of list) {
      if (n.unread) {
        n.unread = false;
        marked += 1;
      }
    }
    return marked;
  }

  /**
   * 获取未读通知数。
   *
   * @param userId 用户 ID
   */
  async getUnreadCount(userId: string): Promise<number> {
    const list = this.getOrCreateStore(userId);
    return list.filter((n) => n.unread).length;
  }

  /**
   * 获取（或懒加载）某用户的通知存储。
   * 首次访问时初始化 10 条 Mock 通知。
   */
  private getOrCreateStore(userId: string): NotificationItem[] {
    let list = this.store.get(userId);
    if (!list) {
      list = createMockNotifications();
      this.store.set(userId, list);
    }
    return list;
  }
}

/* ============================================================
 * Mock 数据（10 条，覆盖 validation / generation / version / community 4 种类型）
 * 与项目其他 service 的 Mock 风格一致（参见 overview-service / community-service）
 * ============================================================ */

/** Mock 通知编辑器基础路径 */
const MOCK_EDITOR_BASE = '/editor';

/**
 * 生成 10 条 Mock 通知。
 *
 * 分布：
 *   - validation × 3（时间线冲突 / 逻辑漏洞 / 难度评估）
 *   - generation × 2（一键生成完成 / 插画生成失败）
 *   - version    × 2（自动保存 / 手动快照回滚）
 *   - community  × 3（点赞 / 评论 / 拼车邀请）
 *
 * 时间分布：5 分钟前 → 3 天前，模拟真实通知流的时序。
 */
function createMockNotifications(): NotificationItem[] {
  const items: NotificationItem[] = [
    // ===== validation 校验类 =====
    {
      id: 'ntf-001',
      type: 'validation',
      title: '时间线校验发现 3 处冲突',
      desc: '《沈府风云》第二幕检测到沈墨白分身两地、沈墨尘时序颠倒等 3 处时序冲突，建议前往修正。',
      time: '5 分钟前',
      unread: true,
      link: `${MOCK_EDITOR_BASE}/mock-current/timeline`,
    },
    {
      id: 'ntf-002',
      type: 'validation',
      title: '逻辑闭环校验完成',
      desc: '《沈府风云》全量校验完成：严重缺陷 2 条、局部警告 3 条、叙诡识别 2 条。难度评估已刷新。',
      time: '1 小时前',
      unread: true,
      link: `${MOCK_EDITOR_BASE}/mock-current/validation`,
    },
    {
      id: 'ntf-003',
      type: 'validation',
      title: '难度评估更新',
      desc: '《第七个房客》综合难度从"进阶"调整为"高阶"，诡计可行性维度得分 8.2 / 10。',
      time: '6 小时前',
      unread: false,
      link: `${MOCK_EDITOR_BASE}/mock-2/validation`,
    },

    // ===== generation 生成类 =====
    {
      id: 'ntf-004',
      type: 'generation',
      title: '《第七个房客》一键生成完成',
      desc: 'AI 已生成完整结构化剧本：6 人 / 4.5h，共 18,420 字。可前往编辑器查看。',
      time: '2 小时前',
      unread: true,
      link: `${MOCK_EDITOR_BASE}/mock-2`,
    },
    {
      id: 'ntf-005',
      type: 'generation',
      title: '场景插画生成失败',
      desc: '《古镇迷案》"药铺后院"插画生成失败：AI 服务超时。可重试或更换模型。',
      time: '1 天前',
      unread: false,
      link: `${MOCK_EDITOR_BASE}/mock-current/illustrations`,
    },

    // ===== version 版本类 =====
    {
      id: 'ntf-006',
      type: 'version',
      title: '《古镇迷案》已自动保存 v3',
      desc: '第二幕 · 公共搜证段落已自动保存为版本 v3，可在版本对比中查看差异。',
      time: '30 分钟前',
      unread: true,
      link: `${MOCK_EDITOR_BASE}/mock-current`,
    },
    {
      id: 'ntf-007',
      type: 'version',
      title: '《雾港夜话》回滚至 v2',
      desc: '已从 v4 回滚至 v2，回滚后内容已生成新版本 v5。如需恢复可查看版本历史。',
      time: '2 天前',
      unread: false,
      link: `${MOCK_EDITOR_BASE}/mock-4`,
    },

    // ===== community 社区类 =====
    {
      id: 'ntf-008',
      type: 'community',
      title: '苏沐点赞了你的作品',
      desc: '苏沐赞了你的《古镇迷案》复盘攻略："朱砂私章的回收设计很巧妙"。',
      time: '10 分钟前',
      unread: true,
      link: '/community',
    },
    {
      id: 'ntf-009',
      type: 'community',
      title: '林夜雨邀请你加入拼车',
      desc: '林夜雨邀请你加入《长安十二时辰谜》周末拼车，已有 5 / 8 人，缺 1 主推位。',
      time: '3 小时前',
      unread: true,
      link: '/community',
    },
    {
      id: 'ntf-010',
      type: 'community',
      title: '你的攻略收到 3 条新评论',
      desc: '《沈府风云》凶手动机分析收到 3 条新评论，其中 1 条提问待回复。',
      time: '3 天前',
      unread: false,
      link: '/community',
    },
  ];

  // Mock 锚点用于校验时间不报错（当前未直接使用，保留以便后续扩展）
  void MOCK_BASE_TIME;

  return items;
}

/** 默认单例，便于在客户端组件中直接调用 */
export const notificationService = new NotificationService();
