/**
 * 剧本列表加载骨架 (T403)
 * 卡片网格 3 列 × 2 行
 */
import '@/components/common/loading-skeleton.css';

export default function Loading() {
  return (
    <div className="sk-content" role="status" aria-label="剧本列表加载中">
      <div className="sk-section-title sk-line" style={{ width: 180, height: 24 }} />
      <div className="sk-grid-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="sk-stack-tight" key={i}>
            <div className="sk-script-card sk-block" />
            <div className="sk-line" style={{ height: 14, width: '70%' }} />
            <div className="sk-line" style={{ height: 10, width: '50%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
