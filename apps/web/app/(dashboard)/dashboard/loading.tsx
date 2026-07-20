/**
 * 概览页加载骨架 (T403)
 * resume-hero 区 + 4 张统计卡 + 工作流列表
 */
import '@/components/common/loading-skeleton.css';

export default function Loading() {
  return (
    <div className="sk-content" role="status" aria-label="概览加载中">
      {/* resume-hero 区 */}
      <div className="sk-hero sk-block" />

      {/* 4 张统计卡 */}
      <div className="sk-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sk-stat-card sk-block" />
        ))}
      </div>

      {/* 工作流列表 */}
      <div className="sk-stack">
        <div className="sk-section-title sk-line" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="sk-list-item" key={i}>
            <div className="sk-icon-box sk-block" />
            <div className="sk-stack-tight" style={{ flex: 1 }}>
              <div className="sk-line" style={{ height: 12, width: '40%' }} />
              <div className="sk-line" style={{ height: 10, width: '72%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
