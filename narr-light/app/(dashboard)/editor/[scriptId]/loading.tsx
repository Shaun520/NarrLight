/**
 * 剧本编辑器加载骨架 (T403)
 * 三栏布局：章节树 + 编辑区 + 右侧面板
 */
import '@/components/common/loading-skeleton.css';

export default function Loading() {
  return (
    <div
      className="sk-cols"
      role="status"
      aria-label="编辑器加载中"
      style={{ height: '100%' }}
    >
      {/* 左：章节树 */}
      <div
        className="sk-col-fixed-260 sk-stack"
        style={{ padding: 16, background: 'rgba(253, 248, 240, 0.4)', borderRadius: 4 }}
      >
        <div className="sk-section-title sk-line" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="sk-tree-item sk-line"
            style={{ width: `${80 - (i % 3) * 12}%` }}
          />
        ))}
      </div>

      {/* 中：编辑区 */}
      <div
        className="sk-col-flex sk-stack"
        style={{ padding: 20, background: 'rgba(253, 248, 240, 0.6)', borderRadius: 4 }}
      >
        <div className="sk-line" style={{ height: 24, width: 180 }} />
        <div className="sk-editor-line sk-line" style={{ width: '92%' }} />
        <div className="sk-editor-line sk-line" style={{ width: '88%' }} />
        <div className="sk-editor-line sk-line" style={{ width: '95%' }} />
        <div className="sk-editor-line sk-line" style={{ width: '76%' }} />
        <div className="sk-editor-line sk-line" style={{ width: '90%' }} />
        <div className="sk-editor-line sk-line" style={{ width: '64%' }} />
      </div>

      {/* 右：面板 */}
      <div
        className="sk-col-fixed-320 sk-stack"
        style={{ padding: 16, background: 'rgba(253, 248, 240, 0.4)', borderRadius: 4 }}
      >
        <div className="sk-section-title sk-line" />
        <div className="sk-block" style={{ height: 90 }} />
        <div className="sk-block" style={{ height: 90 }} />
        <div className="sk-block" style={{ height: 60 }} />
      </div>
    </div>
  );
}
