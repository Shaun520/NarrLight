/**
 * 关系图例组件（T179）
 *
 * 用于关系图谱页底部图例展示：
 *   - 明线 · 玩家可见（金色实线）
 *   - 暗线 · 真相复盘（朱砂虚线）
 *   - 阵营色说明（6 角色身份对应的描边色）
 *
 * 对齐原型 workbench2.html #view-relations SVG 内的图例样式。
 * 既可在 SVG 内部直接使用 <RelationLegendSvg>，也可在侧栏使用
 * <RelationLegend> 的 div 版本。
 */
import { RELATION_TYPE_LABEL, type RelationType } from '@/lib/services/relation-extractor';

/** 角色身份 → 颜色（与 relation-extractor 中保持一致） */
const ROLE_COLOR_ENTRIES: Array<{ label: string; color: string }> = [
  { label: '死者', color: '#8a1c1c' },
  { label: '凶手', color: '#b08d57' },
  { label: '医者', color: '#4a7c59' },
  { label: '管家', color: '#3a5a7a' },
  { label: '丫鬟', color: '#7a5c3a' },
  { label: '药商', color: '#6a4a8a' },
];

/** 明线 / 暗线图例条目 */
const LINE_LEGEND: Array<{ label: string; color: string; dashed: boolean }> = [
  { label: '明线 · 玩家可见', color: '#b08d57', dashed: false },
  { label: '暗线 · 真相复盘', color: '#8a1c1c', dashed: true },
];

/**
 * SVG 版本图例：直接渲染在关系图 SVG 内部（坐标参考原型）。
 * 位置：左下角 (x=24, y=510)。
 */
export function RelationLegendSvg() {
  return (
    <g
      font-family="'Courier Prime', monospace"
      font-size="10"
      className="relation-legend-svg"
    >
      {LINE_LEGEND.map((item, idx) => {
        const x = 24 + idx * 156;
        return (
          <g key={item.label}>
            <line
              x1={x}
              y1={510}
              x2={x + 30}
              y2={510}
              stroke={item.color}
              strokeWidth={item.dashed ? 1.3 : 1.5}
              strokeDasharray={item.dashed ? '5 4' : undefined}
            />
            <text x={x + 36} y={514} fill={item.color}>
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * 关系类型图例：列出 7 种关系类型对应的中文标签。
 * 用于侧栏 / 编辑面板。
 */
export function RelationTypeLegend() {
  const types = Object.keys(RELATION_TYPE_LABEL) as RelationType[];
  return (
    <div className="rel-type-legend">
      {types.map((t) => (
        <span key={t} className="rel-type-chip" data-rtype={t}>
          {RELATION_TYPE_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

/**
 * 阵营色图例：列出 6 角色身份对应的描边色。
 */
export function RelationCampLegend() {
  return (
    <div className="rel-camp-legend">
      {ROLE_COLOR_ENTRIES.map((entry) => (
        <div key={entry.label} className="rel-camp-item">
          <span
            className="rel-camp-dot"
            style={{ background: entry.color }}
            aria-hidden
          />
          <span className="rel-camp-label">{entry.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 默认导出：完整的图例卡片（明暗线 + 阵营色），用于侧栏。
 */
export default function RelationLegend() {
  return (
    <div className="relation-legend card">
      <div className="card-head">
        <h3>图例</h3>
      </div>
      <div className="card-body">
        <div className="legend-section">
          {LINE_LEGEND.map((item) => (
            <div key={item.label} className="legend-line-item">
              <span
                className="legend-line-swatch"
                style={{
                  borderTop: `2px ${item.dashed ? 'dashed' : 'solid'} ${item.color}`,
                }}
                aria-hidden
              />
              <span style={{ color: item.color }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="legend-section">
          <div className="legend-section-title">阵营色</div>
          <RelationCampLegend />
        </div>
      </div>
    </div>
  );
}
