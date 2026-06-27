"use client";

/**
 * 创作社区 · 侧栏组件集合
 *
 * 对齐原型 .xhs-sidebar 三个 .xhs-widget：
 * - 热门话题（.xhs-topic：.xt-rank 前三名高亮 t1/t2/t3 + .xt-name + .xt-hot/.xt-tag）
 * - 推荐作者（.xhs-author：.xa-avatar + .xa-info[名+认证+meta] + .xa-follow 关注按钮）
 * - 热门剧本榜（.xhs-rank-item：.xr-no 前三名高亮 + .xr-cover + .xr-info[name+sub]）
 *
 * 关注按钮交互由组件内部管理 followed 状态。
 */
import { useState, type MouseEvent } from "react";
import { Zap, User, Trophy } from "lucide-react";
import type {
  CommunityTopic,
  RecommendedAuthor,
  RankScript,
} from "@/lib/services/community-service";

export interface SidebarWidgetsProps {
  topics: CommunityTopic[];
  authors: RecommendedAuthor[];
  rank: RankScript[];
}

/** 前三名高亮 class */
function rankClass(rank: number): string {
  return rank >= 1 && rank <= 3 ? ` t${rank}` : "";
}

/** 推荐作者行（独立管理 followed 状态） */
function AuthorRow({ author }: { author: RecommendedAuthor }) {
  const [followed, setFollowed] = useState(author.followed === true);

  const handleFollow = (e: MouseEvent) => {
    e.stopPropagation();
    setFollowed((f) => !f);
  };

  return (
    <div className="xhs-author">
      <div className="xa-avatar" style={{ background: author.avatarBg }}>
        {author.avatarChar}
      </div>
      <div className="xa-info">
        <div className="xa-name">
          {author.name}
          {author.verified ? <span className="verified">认证</span> : null}
        </div>
        <div className="xa-meta">{author.meta}</div>
      </div>
      <button
        type="button"
        className={`xa-follow${followed ? " followed" : ""}`}
        onClick={handleFollow}
      >
        {followed ? "已关注" : "+ 关注"}
      </button>
    </div>
  );
}

/**
 * 渲染三个侧栏 widget。
 */
export default function SidebarWidgets({
  topics,
  authors,
  rank,
}: SidebarWidgetsProps) {
  return (
    <aside className="xhs-sidebar">
      {/* ===== 热门话题 ===== */}
      <div className="xhs-widget">
        <div className="xw-head">
          <h4>
            <Zap />
            热门话题
          </h4>
          <a className="xw-more">更多 ›</a>
        </div>
        <div className="xw-body">
          {topics.map((t) => (
            <div className="xhs-topic" key={t.rank}>
              <span className={`xt-rank${rankClass(t.rank)}`}>{t.rank}</span>
              <span className="xt-name">{t.name}</span>
              {t.tag ? <span className="xt-tag">{t.tag}</span> : null}
              {t.hot ? <span className="xt-hot">{t.hot}</span> : null}
            </div>
          ))}
        </div>
      </div>

      {/* ===== 推荐作者 ===== */}
      <div className="xhs-widget">
        <div className="xw-head">
          <h4>
            <User />
            推荐作者
          </h4>
          <a className="xw-more">换一批</a>
        </div>
        <div className="xw-body">
          {authors.map((a) => (
            <AuthorRow key={a.name} author={a} />
          ))}
        </div>
      </div>

      {/* ===== 热门剧本榜 ===== */}
      <div className="xhs-widget">
        <div className="xw-head">
          <h4>
            <Trophy />
            热门剧本榜
          </h4>
          <a className="xw-more">完整榜 ›</a>
        </div>
        <div className="xw-body">
          {rank.map((r) => (
            <div className="xhs-rank-item" key={r.no}>
              <span className={`xr-no${rankClass(r.rank)}`}>{r.no}</span>
              <div className="xr-cover" style={{ background: r.coverBg }} />
              <div className="xr-info">
                <div className="xr-name">{r.name}</div>
                <div className="xr-sub">{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
