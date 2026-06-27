/**
 * 叙光骨架屏组件 (T401)
 *
 * 提供 DashboardSkeleton（完整布局骨架）与 ContentSkeleton（纯内容区骨架），
 * 供 Next.js App Router 各级 loading.tsx 使用，消除路由跳转卡顿感。
 *
 * 配色与布局对齐 app/(dashboard)/dashboard.css 与 app/globals.css 古风变量。
 * 样式见 ./loading-skeleton.css。
 */
import './loading-skeleton.css';

interface ContentSkeletonProps {
  /** 卡片占位数量，默认 2 */
  cards?: number;
  /** 文本行占位数量，默认 4 */
  rows?: number;
}

/** 文本行宽度池，模拟 60-100% 随机宽度，避免骨架线条整齐划一 */
const ROW_WIDTHS = ['100%', '86%', '92%', '68%', '78%', '95%', '62%'];

/** 侧栏四组导航，每组 3-4 条 */
const NAV_GROUP_ITEMS = [3, 4, 3, 4];

/**
 * 纯内容区骨架（不含侧栏顶栏）。
 * 用于子路由 loading.tsx，配合既有 layout 真实侧栏顶栏展示。
 */
export function ContentSkeleton({ cards = 2, rows = 4 }: ContentSkeletonProps) {
  return (
    <div className="sk-content" role="status" aria-label="加载中">
      <div className="sk-content-title sk-block" />
      <div className="sk-content-cards">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="sk-content-card sk-block" />
        ))}
      </div>
      <div className="sk-text-rows">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="sk-text-row sk-line"
            style={{ width: ROW_WIDTHS[i % ROW_WIDTHS.length] }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 完整 dashboard 布局骨架（侧栏 + 顶栏 + 内容区）。
 * 采用 position:fixed 全屏覆盖，加载完成自动卸载露出真实布局。
 * 用于 (dashboard)/loading.tsx，覆盖无独立 loading 的子路由跳转反馈。
 */
export function DashboardSkeleton() {
  return (
    <div className="sk-app" role="status" aria-label="加载中" aria-busy="true">
      {/* ===== 侧栏骨架 ===== */}
      <aside className="sk-sidebar">
        <div className="sk-brand">
          <div className="sk-brand-mark sk-block" />
          <div className="sk-brand-text">
            <div className="sk-brand-name sk-line" />
            <div className="sk-brand-sub sk-line" />
          </div>
        </div>

        <div className="sk-switch">
          <div className="sk-switch-label sk-line" />
          <div className="sk-switch-title sk-line" />
          <div className="sk-switch-meta sk-line" />
        </div>

        <div className="sk-nav-group">
          {NAV_GROUP_ITEMS.map((count, gi) => (
            <div className="sk-nav-section" key={gi}>
              <div className="sk-nav-title sk-line" />
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="sk-nav-item sk-line"
                  style={{ width: `${70 + ((i * 7) % 25)}%` }}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="sk-foot">
          <div className="sk-foot-avatar sk-block" />
          <div className="sk-foot-info">
            <div className="sk-foot-name sk-line" />
            <div className="sk-foot-quota sk-line" />
          </div>
          <div className="sk-foot-btn sk-block" />
        </div>
      </aside>

      {/* ===== 顶栏骨架 ===== */}
      <header className="sk-topbar">
        <div className="sk-crumb">
          <div className="sk-crumb-line sk-line" />
          <div className="sk-crumb-here sk-line" />
        </div>
        <div className="sk-spacer" />
        <div className="sk-search sk-block" />
        <div className="sk-status sk-block" />
        <div className="sk-icon sk-block" />
        <div className="sk-icon sk-block" />
      </header>

      {/* ===== 内容区骨架 ===== */}
      <main className="sk-main">
        <div className="sk-page-title sk-block" />
        <div className="sk-card-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sk-card sk-block" />
          ))}
        </div>
        <div className="sk-text-rows">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="sk-text-row sk-line"
              style={{ width: ROW_WIDTHS[i % ROW_WIDTHS.length] }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
