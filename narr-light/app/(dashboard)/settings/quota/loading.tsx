/**
 * 额度管理页加载骨架 (T403)
 * 套餐卡 + 进度条 + 历史列表
 */
import '@/components/common/loading-skeleton.css';

export default function Loading() {
  return (
    <div className="sk-content" role="status" aria-label="额度页加载中">
      {/* 套餐卡 */}
      <div className="sk-plan-card sk-block" />

      {/* 进度条 */}
      <div className="sk-stack">
        <div className="sk-line" style={{ height: 14, width: 160 }} />
        <div className="sk-progress">
          <div className="sk-progress-fill" />
        </div>
      </div>

      {/* 历史列表 */}
      <div className="sk-stack">
        <div className="sk-section-title sk-line" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="sk-list-item" key={i}>
            <div className="sk-icon-box sk-block" />
            <div className="sk-stack-tight" style={{ flex: 1 }}>
              <div className="sk-line" style={{ height: 12, width: '45%' }} />
              <div className="sk-line" style={{ height: 10, width: '75%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
