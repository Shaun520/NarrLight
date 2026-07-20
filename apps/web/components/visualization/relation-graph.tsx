/**
 * 关系图组件（T178）
 *
 * 基于 AntV G6 v5 实现的人物关系图：
 *   - 3 种布局：力导向 / 环形 / 层级
 *   - 节点：角色色描边 + 姓名 + 角色标签
 *   - 明线实线金色 (#b08d57)
 *   - 暗线虚线朱砂 (#8a1c1c)
 *   - 节点拖拽、画布缩放平移
 *   - 节点点击选中、双击连线编辑
 *
 * 通过动态 import G6 避免 SSR 问题（G6 依赖 canvas / DOM）。
 */
'use client';

import { useEffect, useRef } from 'react';
import type {
  RelationEdge,
  RelationGraphData,
  RelationNode,
} from '@/lib/services/relation-extractor';

/** 布局类型：force 力导向 / radial 环形 / tree 层级 */
export type RelationLayout = 'force' | 'radial' | 'tree';

export interface RelationGraphProps {
  /** 图谱数据 */
  data: RelationGraphData;
  /** 当前布局 */
  layout: RelationLayout;
  /** 是否显示明线 */
  showLight: boolean;
  /** 是否显示暗线 */
  showDark: boolean;
  /** 是否显示关系标签 */
  showLabel: boolean;
  /** 当前选中的节点 ID */
  selectedNodeId: string | null;
  /** 节点点击回调 */
  onNodeSelect?: (node: RelationNode) => void;
  /** 边双击回调（用于触发编辑） */
  onEdgeEdit?: (edge: RelationEdge) => void;
}

/** 明线 / 暗线颜色（与原型 SVG 一致） */
const LIGHT_COLOR = '#b08d57';
const DARK_COLOR = '#8a1c1c';
/** 节点填充色 */
const NODE_FILL = '#1a1410';
/** 节点姓名色 */
const NAME_COLOR = '#e8dcc4';
/** 背景色 */
const BG_COLOR = '#25211c';

/**
 * 将业务节点 / 边转换为 G6 格式
 */
function toG6Data(
  data: RelationGraphData,
  showLight: boolean,
  showDark: boolean,
  showLabel: boolean,
) {
  const nodes = data.nodes.map((n) => ({
    id: n.id,
    data: {
      ...n,
      // 节点样式
      type: 'circle',
      size: n.radius * 2,
      style: {
        fill: NODE_FILL,
        stroke: n.color,
        lineWidth: 2,
        labelText: n.name,
        labelFill: NAME_COLOR,
        labelFontSize: 12,
        labelFontWeight: 700,
        labelFontFamily: 'Noto Serif SC, serif',
        labelPosition: 'center',
        // 副标签：角色身份
        badgeText: n.roleIdentity,
        badgeFill: n.color,
        badgeFontSize: 9,
        badgeFontFamily: 'Courier Prime, monospace',
        badgePadding: [2, 4],
        badgePosition: 'bottom',
      },
    },
  }));

  const edges = data.edges
    .filter((e) => {
      if (e.isVisible && showLight) return true;
      if (e.isHiddenRelation && showDark) return true;
      return false;
    })
    .map((e) => {
      const isDark = e.isHiddenRelation;
      const labelText = showLabel
        ? isDark
          ? e.hiddenLabel
          : e.label
        : '';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        data: { ...e },
        style: {
          stroke: isDark ? DARK_COLOR : LIGHT_COLOR,
          strokeWidth: isDark ? 1.3 : 1.5,
          lineDash: isDark ? [5, 4] : undefined,
          opacity: 0.85,
          endArrow: false,
          labelText: labelText || undefined,
          labelFill: isDark ? DARK_COLOR : LIGHT_COLOR,
          labelFontSize: 10,
          labelFontFamily: 'Courier Prime, monospace',
          labelBackground: true,
          labelBackgroundFill: BG_COLOR,
          labelBackgroundOpacity: 0.7,
          labelBackgroundPadding: [1, 4],
          labelBackgroundRadius: 2,
        },
      };
    });

  return { nodes, edges };
}

/**
 * 根据 layout 类型构造 G6 布局配置
 */
function buildLayoutConfig(layout: RelationLayout) {
  switch (layout) {
    case 'force':
      return {
        type: 'force',
        preventOverlap: true,
        nodeSize: 60,
        nodeStrength: -150,
        linkDistance: 160,
        collideStrength: 0.8,
        alpha: 0.3,
      };
    case 'radial':
      return {
        type: 'radial',
        unitRadius: 110,
        preventOverlap: true,
        nodeSize: 60,
        strictRadial: false,
      };
    case 'tree':
      return {
        type: 'dagre',
        rankdir: 'TB',
        nodesep: 40,
        ranksep: 80,
      };
    default:
      return { type: 'force' };
  }
}

/**
 * 关系图组件
 */
export default function RelationGraph({
  data,
  layout,
  showLight,
  showDark,
  showLabel,
  selectedNodeId,
  onNodeSelect,
  onEdgeEdit,
}: RelationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<unknown>(null);
  const callbacksRef = useRef({ onNodeSelect, onEdgeEdit });
  // 同步最新回调（避免每次重建 graph）
  callbacksRef.current = { onNodeSelect, onEdgeEdit };

  // ===== 初始化 G6 图（仅一次）=====
  useEffect(() => {
    let cancelled = false;

    const initGraph = async () => {
      if (!containerRef.current) return;
      try {
        // 动态 import G6，避免 SSR / 构建期依赖 canvas
        const G6 = await import('@antv/g6');
        if (cancelled || !containerRef.current) return;

        const GraphClass = (G6 as { Graph: new (cfg: Record<string, unknown>) => unknown }).Graph;
        const graph = new GraphClass({
          container: containerRef.current,
          width: containerRef.current.clientWidth || 720,
          height: containerRef.current.clientHeight || 540,
          autoFit: 'view',
          background: BG_COLOR,
          data: toG6Data(data, showLight, showDark, showLabel),
          layout: buildLayoutConfig(layout),
          node: {
            type: 'circle',
            state: {
              selected: {
                shadowColor: LIGHT_COLOR,
                shadowBlur: 16,
                lineWidth: 3,
              },
            },
          },
          edge: {
            type: 'line',
            state: {
              selected: {
                strokeWidth: 2.5,
              },
            },
          },
          behaviors: [
            'drag-canvas',
            'zoom-canvas',
            'drag-element',
            {
              type: 'click-select',
              multiple: false,
            },
          ],
          plugins: [
            {
              type: 'tooltip',
              getContent: (e: { targetType: string; target: { data?: Record<string, unknown> } }) => {
                if (e.targetType === 'node' && e.target?.data) {
                  const d = e.target.data;
                  return `<div style="padding:6px 8px;font-size:12px;color:#e8dcc4;background:#1a1410;border:1px solid ${d.color ?? '#b08d57'};border-radius:2px;">${d.name ?? ''} · ${d.roleIdentity ?? ''}</div>`;
                }
                return '';
              },
            },
          ],
        });

        graphRef.current = graph;

        // 渲染
        const renderable = graph as unknown as {
          render: () => Promise<void>;
          on: (event: string, handler: (e: unknown) => void) => void;
        };
        await renderable.render();

        // 节点点击：触发选中
        renderable.on('node:click', (evt: unknown) => {
          const e = evt as {
            target: { id?: string; data?: RelationNode };
          };
          const nodeData = e?.target?.data;
          const nodeId = e?.target?.id ?? nodeData?.id;
          if (nodeId && nodeData) {
            callbacksRef.current.onNodeSelect?.(nodeData);
          }
        });

        // 边双击：触发编辑
        renderable.on('edge:dblclick', (evt: unknown) => {
          const e = evt as {
            target: { id?: string; data?: RelationEdge };
          };
          const edgeData = e?.target?.data;
          if (edgeData) {
            callbacksRef.current.onEdgeEdit?.(edgeData);
          }
        });
      } catch (err) {
        // G6 初始化失败时静默降级（不影响页面其他部分）
        console.error('[RelationGraph] G6 init failed:', err);
      }
    };

    initGraph();

    return () => {
      cancelled = true;
      // 销毁图实例
      const graph = graphRef.current;
      if (graph) {
        try {
          (graph as { destroy?: () => void }).destroy?.();
        } catch {
          // ignore
        }
        graphRef.current = null;
      }
    };
    // 仅在挂载时初始化一次；data/layout 等变化走下方 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 数据 / 显隐变化时重新设置数据并重绘 =====
  useEffect(() => {
    const graph = graphRef.current as
      | {
          setData: (data: unknown) => void;
          render: () => Promise<void>;
          draw: () => Promise<void>;
        }
      | null;
    if (!graph) return;
    try {
      graph.setData(toG6Data(data, showLight, showDark, showLabel));
      void graph.render();
    } catch (err) {
      console.error('[RelationGraph] setData failed:', err);
    }
  }, [data, showLight, showDark, showLabel]);

  // ===== 布局变化时切换布局 =====
  useEffect(() => {
    const graph = graphRef.current as
      | { setLayout: (layout: unknown) => void; draw: () => Promise<void> }
      | null;
    if (!graph) return;
    try {
      graph.setLayout(buildLayoutConfig(layout));
      void graph.draw();
    } catch (err) {
      console.error('[RelationGraph] setLayout failed:', err);
    }
  }, [layout]);

  // ===== 选中节点变化时更新状态 =====
  useEffect(() => {
    const graph = graphRef.current as
      | {
          setItemState: (id: string, state: string, value: boolean) => void;
          focusElement: (id: string) => void;
        }
      | null;
    if (!graph) return;
    try {
      // 清除所有节点的 selected 状态后再设置当前
      data.nodes.forEach((n) => {
        graph.setItemState(n.id, 'selected', n.id === selectedNodeId);
      });
      if (selectedNodeId) {
        graph.focusElement?.(selectedNodeId);
      }
    } catch (err) {
      console.error('[RelationGraph] setItemState failed:', err);
    }
  }, [selectedNodeId, data.nodes]);

  return (
    <div
      className="relation-graph-container"
      ref={containerRef}
      role="img"
      aria-label="人物关系图"
      style={{ width: '100%', height: '100%', minHeight: 540 }}
    />
  );
}
