"use client";

/**
 * 创作社区 · 瀑布流卡片
 *
 * 对齐原型 .xhs-card，支持 6 种业务类型 + 纯文字卡：
 * - 拼车卡（b-carpool）：封面 + 座位进度条 .xc-seat-bar（满员变绿）
 * - 测评卡（b-review）
 * - 攻略卡（b-guide）
 * - 推荐卡（b-rec）
 * - 求助卡（b-ask）：纯文字卡 .text-card
 * - 杂谈卡（b-talk）
 *
 * 封面 8 种预设背景（c1-c8）、3 种高度（h-tall / h-mid / h-short）。
 * 交互：点赞切换 liked + 计数增减；加入按钮切换 joined（禁用项不响应）。
 */
import { useState, type MouseEvent, type CSSProperties } from "react";
import { Heart, MessageCircle, Star } from "lucide-react";
import type { CommunityPost, PostStat, StatType } from "@/lib/services/community-service";

export interface FeedCardProps {
  post: CommunityPost;
  /** 卡片整体点击回调（占位：跳详情） */
  onCardClick?: (post: CommunityPost) => void;
}

/** 统计图标映射 */
const STAT_ICON: Record<StatType, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  star: Star,
};

/**
 * 渲染单张瀑布流卡片。点赞 / 加入状态由组件内部管理以提供即时反馈。
 */
export default function FeedCard({ post, onCardClick }: FeedCardProps) {
  const [stats, setStats] = useState<PostStat[]>(post.stats ?? []);
  const [joined, setJoined] = useState(false);

  /** 点赞切换：仅 like 类型可点，切换 liked 并增减计数 */
  const handleLike = (e: MouseEvent) => {
    e.stopPropagation();
    setStats((prev) =>
      prev.map((s) =>
        s.type === "like"
          ? { ...s, liked: !s.liked, count: Math.max(0, s.count + (s.liked ? -1 : 1)) }
          : s,
      ),
    );
  };

  /** 加入拼车 / 心愿单：禁用项（候补排队）不响应 */
  const handleJoin = (e: MouseEvent) => {
    e.stopPropagation();
    if (post.joinDisabled) return;
    setJoined((j) => !j);
  };

  const handleCardClick = () => onCardClick?.(post);

  const isTextCard = post.isTextCard === true;
  const hasSeat = Boolean(post.seat);

  /** 封面标题位置：当同时存在座位条时上移，避免与 .xc-seat-bar 重叠 */
  const coverTitleStyle: CSSProperties | undefined = hasSeat
    ? { bottom: 36 }
    : undefined;

  return (
    <div
      className={`xhs-card${isTextCard ? " text-card" : ""}`}
      onClick={handleCardClick}
    >
      {/* 封面（纯文字卡无封面） */}
      {post.cover ? (
        <div className={`xc-cover ${post.cover.variant} ${post.cover.height}`}>
          <span className={`xc-badge ${post.badge.variant}`}>{post.badge.label}</span>
          {post.stamp ? <span className="xc-stamp">{post.stamp}</span> : null}
          {post.cover.title ? (
            <div className="xc-cover-title" style={coverTitleStyle}>
              {post.cover.title}
            </div>
          ) : null}
          {post.seat ? (
            <div className={`xc-seat-bar${post.seat.full ? " full" : ""}`}>
              <span className="xsb-num">
                {post.seat.filled}/{post.seat.total}
              </span>
              <div className="xsb-track">
                <div
                  className="xsb-fill"
                  style={{
                    width: `${Math.min(100, (post.seat.filled / post.seat.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="xc-body">
        {/* 纯文字卡的 badge 位于正文顶部 */}
        {isTextCard ? (
          <span className={`xc-badge ${post.badge.variant}`}>{post.badge.label}</span>
        ) : null}

        <div className="xc-title" style={isTextCard ? { marginTop: 8 } : undefined}>
          {post.title}
        </div>

        {post.excerpt ? <div className="xc-excerpt">{post.excerpt}</div> : null}

        {post.tags.length > 0 ? (
          <div className="xc-tags">
            {post.tags.map((t) => (
              <span className="xt" key={t}>
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="xc-foot">
          <div className="xc-author">
            <span className="xa-av">{post.author.avatarChar}</span>
            <span className="xa-name">{post.author.name}</span>
          </div>

          {/* 互动统计与加入按钮互斥 */}
          {stats.length > 0 ? (
            <div className="xc-stats">
              {stats.map((stat) => {
                const Icon = STAT_ICON[stat.type];
                const clickable = stat.type === "like";
                return (
                  <span
                    key={stat.type}
                    className={`xs-act${stat.liked ? " liked" : ""}`}
                    onClick={clickable ? handleLike : undefined}
                    role={clickable ? "button" : undefined}
                    aria-label={clickable ? "点赞" : undefined}
                  >
                    <Icon />
                    {stat.count}
                  </span>
                );
              })}
            </div>
          ) : post.joinLabel ? (
            <span
              className={`xc-join${post.joinDisabled ? " disabled" : ""}${joined ? " joined" : ""}`}
              onClick={handleJoin}
              role="button"
              aria-label={post.joinLabel}
            >
              {post.joinDisabled ? post.joinLabel : joined ? "已加入 ✓" : post.joinLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
