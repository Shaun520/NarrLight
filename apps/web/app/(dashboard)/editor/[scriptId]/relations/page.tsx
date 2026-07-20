/**
 * 人物关系图谱页（T177 · 视图7）
 *
 * 路由：/dashboard/editor/[scriptId]/relations
 *
 * 严格参照原型 workbench2.html #view-relations 结构：
 *   1. .page-head      页头（标题 + 印章 + 重置布局 / 导出图谱）
 *   2. .rel-toolbar     工具栏（两行）
 *      - .rel-tab-row   VIEW 模式（全景/明线/暗线/阵营/亲密度）+ LAYOUT 布局（力导向/环形/层级）
 *      - .rel-filter-row FILTER 筛选（6 chips）+ 明暗开关（3 .tgl）
 *   3. .relation-layout 1fr 320px 双栏
 *      - 左：RelationGraph G6 关系图
 *      - 右：RelationDetailPanel 节点详情
 *   4. RelationEditor   关系编辑 Modal（双击连线触发）
 *
 * 客户端组件：管理 view / layout / filter / 显隐 / 选中节点 / 编辑器等状态。
 */
'use client';

import { use, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, Download } from 'lucide-react';
import RelationGraph, {
  type RelationLayout,
} from '@/components/visualization/relation-graph';
import RelationDetailPanel from '@/components/visualization/relation-detail-panel';
import RelationEditor from '@/components/visualization/relation-editor';
import {
  DEFAULT_RELATION_GRAPH,
  type CharacterCamp,
  type RelationEdge,
  type RelationGraphData,
  type RelationNode,
} from '@/lib/services/relation-extractor';
import {
  exportRelationGraphPng,
  exportRelationGraphPdf,
  type ExportResolution,
} from '@/lib/export/relation-graph-export';
import './relations.css';

/** VIEW 模式 tab 定义 */
interface ViewTab {
  view: 'all' | 'light' | 'dark' | 'camp' | 'affinity';
  label: string;
}
const VIEW_TABS: ViewTab[] = [
  { view: 'all', label: '全景' },
  { view: 'light', label: '明线' },
  { view: 'dark', label: '暗线' },
  { view: 'camp', label: '阵营' },
  { view: 'affinity', label: '亲密度' },
];

/** LAYOUT 布局 tab 定义 */
interface LayoutTab {
  layout: RelationLayout;
  label: string;
  icon: ReactNode;
}
const LAYOUT_TABS: LayoutTab[] = [
  {
    layout: 'force',
    label: '力导向',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8 6h8M6 8v8M18 8v8M8 18h8M9 9l6 6M15 9l-6 6" />
      </svg>
    ),
  },
  {
    layout: 'radial',
    label: '环形',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="4" r="1.5" />
        <circle cx="20" cy="12" r="1.5" />
        <circle cx="12" cy="20" r="1.5" />
        <circle cx="4" cy="12" r="1.5" />
        <path d="M12 7v2.5M14.5 12h2.5M12 14.5v2.5M7 12h2.5" />
      </svg>
    ),
  },
  {
    layout: 'tree',
    label: '层级',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <rect x="3" y="15" width="6" height="4" rx="1" />
        <rect x="15" y="15" width="6" height="4" rx="1" />
        <path d="M12 7v3M6 15v-2h12v2" />
      </svg>
    ),
  },
];

/** FILTER chip 定义 */
interface FilterChip {
  filter: 'all' | CharacterCamp;
  label: string;
}
const FILTER_CHIPS: FilterChip[] = [
  { filter: 'all', label: '全部' },
  { filter: 'shen', label: '沈家' },
  { filter: 'outsider', label: '外人' },
  { filter: 'deceased', label: '死者相关' },
  { filter: 'murderer', label: '凶手相关' },
  { filter: 'healer', label: '医者相关' },
];

/** 明暗开关定义 */
const LINE_TOGGLES = [
  { key: 'light' as const, label: '明线' },
  { key: 'dark' as const, label: '暗线' },
  { key: 'label' as const, label: '标签' },
];

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

/**
 * 人物关系图谱页
 */
export default function RelationsPage({ params }: PageProps) {
  const { scriptId } = use(params);
  void scriptId; // 后续接入 ScriptService 时使用

  // ===== 状态 =====
  const [activeView, setActiveView] = useState<ViewTab['view']>('all');
  const [activeLayout, setActiveLayout] = useState<RelationLayout>('radial');
  const [activeFilter, setActiveFilter] = useState<FilterChip['filter']>('all');
  const [showLight, setShowLight] = useState(true);
  const [showDark, setShowDark] = useState(true);
  const [showLabel, setShowLabel] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    'char-shen-mobai',
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('edit');
  const [editorEdge, setEditorEdge] = useState<RelationEdge | null>(null);

  // 图数据（当前为 Mock，后续可由 ScriptService 注入）
  const [graphData, setGraphData] = useState<RelationGraphData>(DEFAULT_RELATION_GRAPH);

  // 关系图容器引用：用于导出
  const graphContainerRef = useRef<HTMLDivElement>(null);

  // ===== 派生：根据 VIEW / FILTER 计算可见节点 =====
  const visibleData = useMemo(() => {
    // 1. 按 FILTER chip 筛选节点
    let nodes = graphData.nodes;
    if (activeFilter !== 'all') {
      // 死者/凶手/医者相关 = 包含该阵营的节点 + 与之有关系的节点
      if (activeFilter === 'deceased' || activeFilter === 'murderer' || activeFilter === 'healer') {
        const focusNodes = nodes.filter((n) => n.camp === activeFilter);
        const focusIds = new Set(focusNodes.map((n) => n.id));
        // 与 focus 节点有关系的节点也保留
        const relatedIds = new Set<string>();
        graphData.edges.forEach((e) => {
          if (focusIds.has(e.source)) relatedIds.add(e.target);
          if (focusIds.has(e.target)) relatedIds.add(e.source);
        });
        nodes = nodes.filter(
          (n) => focusIds.has(n.id) || relatedIds.has(n.id),
        );
      } else {
        // shen / outsider：直接按阵营过滤
        nodes = nodes.filter((n) => n.camp === activeFilter);
      }
    }

    const nodeIds = new Set(nodes.map((n) => n.id));

    // 2. 按 VIEW 模式筛选边
    let edges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );
    if (activeView === 'light') {
      edges = edges.filter((e) => e.isVisible);
    } else if (activeView === 'dark') {
      edges = edges.filter((e) => e.isHiddenRelation);
    }
    // camp / affinity / all：保留全部边

    return { nodes, edges };
  }, [graphData, activeFilter, activeView]);

  // ===== 派生：选中节点对象 =====
  const selectedNode = useMemo<RelationNode | null>(() => {
    if (!selectedNodeId) return null;
    return graphData.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [graphData.nodes, selectedNodeId]);

  // ===== 派生：VIEW tab 计数 =====
  const viewCounts = useMemo(() => {
    const all = graphData.nodes.length;
    const light = graphData.edges.filter((e) => e.isVisible).length;
    const dark = graphData.edges.filter((e) => e.isHiddenRelation).length;
    const camps = new Set(graphData.nodes.map((n) => n.camp)).size;
    return { all, light, dark, camp: camps, affinity: 0 };
  }, [graphData]);

  // ===== 派生：FILTER chip 计数 =====
  const filterCounts = useMemo<Record<string, number>>(() => {
    const nodes = graphData.nodes;
    const countFor = (camp: CharacterCamp | 'all') => {
      if (camp === 'all') return nodes.length;
      if (camp === 'deceased' || camp === 'murderer' || camp === 'healer') {
        const focus = nodes.filter((n) => n.camp === camp).map((n) => n.id);
        const focusSet = new Set(focus);
        const related = new Set<string>();
        graphData.edges.forEach((e) => {
          if (focusSet.has(e.source)) related.add(e.target);
          if (focusSet.has(e.target)) related.add(e.source);
        });
        return focus.length + related.size;
      }
      return nodes.filter((n) => n.camp === camp).length;
    };
    return {
      all: countFor('all'),
      shen: countFor('shen'),
      outsider: countFor('outsider'),
      deceased: countFor('deceased'),
      murderer: countFor('murderer'),
      healer: countFor('healer'),
      other: 0,
    };
  }, [graphData]);

  // ===== 事件：节点选中 =====
  const handleNodeSelect = (node: RelationNode) => {
    setSelectedNodeId(node.id);
  };

  // ===== 事件：边双击编辑 =====
  const handleEdgeEdit = (edge: RelationEdge) => {
    setEditorEdge(edge);
    setEditorMode('edit');
    setEditorOpen(true);
  };

  // ===== 事件：编辑器提交 =====
  const handleEditorSubmit = (edge: RelationEdge) => {
    setGraphData((prev) => {
      const exists = prev.edges.some((e) => e.id === edge.id);
      const edges = exists
        ? prev.edges.map((e) => (e.id === edge.id ? edge : e))
        : [...prev.edges, { ...edge, id: edge.id || `rel-${Date.now()}` }];
      return { ...prev, edges };
    });
    setEditorOpen(false);
    setEditorEdge(null);
  };

  // ===== 事件：编辑器删除 =====
  const handleEditorDelete = (edgeId: string) => {
    setGraphData((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
    }));
    setEditorOpen(false);
    setEditorEdge(null);
  };

  // ===== 事件：AI 快捷指令 =====
  const handleQuickPrompt = (prompt: string) => {
    // TODO: 接入 AI 关系调整服务
    console.log('[RelationsPage] AI quick prompt:', prompt);
  };

  // ===== 事件：重置布局 =====
  const handleResetLayout = () => {
    // 切换 layout 触发一次重新布局：先切到 force 再切回原 layout
    const target = activeLayout;
    setActiveLayout('force');
    setTimeout(() => setActiveLayout(target), 50);
  };

  // ===== 事件：导出图谱 =====
  const [exporting, setExporting] = useState(false);
  const handleExport = async (format: 'png' | 'pdf') => {
    if (!graphContainerRef.current || exporting) return;
    setExporting(true);
    try {
      const opts = {
        resolution: '2K' as ExportResolution,
        filename: `relation-graph-${Date.now()}`,
        title: '人物关系图谱',
        subtitle: '明暗双线可视化',
      };
      if (format === 'png') {
        await exportRelationGraphPng(graphContainerRef.current, opts);
      } else {
        await exportRelationGraphPdf(graphContainerRef.current, opts);
      }
    } catch (err) {
      console.error('[RelationsPage] export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // ===== 渲染 =====
  return (
    <div className="relations-page">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            人物关系图谱 <span className="seal">{graphData.nodes.length} 人</span>
          </h1>
          <div className="page-desc">
            明暗双线可视化 · SVG 节点可拖拽 · 实时联动剧本段落
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleResetLayout}
            title="重置布局"
          >
            <RotateCcw size={14} />
            重置布局
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            title="导出 PDF"
          >
            <Download size={14} />
            PDF
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleExport('png')}
            disabled={exporting}
            title="导出 PNG"
          >
            <Download size={14} />
            导出图谱
          </button>
        </div>
      </div>

      {/* ===== 工具栏 ===== */}
      <div className="rel-toolbar">
        {/* 第一行：VIEW + LAYOUT */}
        <div className="rel-tab-row">
          <span className="rv-label">VIEW</span>
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.view}
              type="button"
              className={`rel-vtab ${activeView === tab.view ? 'active' : ''}`}
              data-view={tab.view}
              onClick={() => setActiveView(tab.view)}
            >
              {tab.label}
              {tab.view !== 'affinity' ? (
                <span className="rv-num">{viewCounts[tab.view]}</span>
              ) : null}
            </button>
          ))}
          <span className="rv-div" />
          <span className="rv-label">LAYOUT</span>
          {LAYOUT_TABS.map((tab) => (
            <button
              key={tab.layout}
              type="button"
              className={`rel-vtab ${activeLayout === tab.layout ? 'active' : ''}`}
              data-layout={tab.layout}
              onClick={() => setActiveLayout(tab.layout)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 第二行：FILTER + 明暗开关 */}
        <div className="rel-filter-row">
          <span className="rv-label">FILTER</span>
          <div className="rel-chips">
            {FILTER_CHIPS.map((chip) => (
              <span
                key={chip.filter}
                className={`rel-chip ${activeFilter === chip.filter ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveFilter(chip.filter)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveFilter(chip.filter);
                  }
                }}
              >
                {chip.label} <span className="rc-num">{filterCounts[chip.filter]}</span>
              </span>
            ))}
          </div>
          <div className="rel-line-toggle">
            {LINE_TOGGLES.map((tgl) => {
              const checked =
                tgl.key === 'light'
                  ? showLight
                  : tgl.key === 'dark'
                    ? showDark
                    : showLabel;
              const setChecked = (v: boolean) => {
                if (tgl.key === 'light') setShowLight(v);
                else if (tgl.key === 'dark') setShowDark(v);
                else setShowLabel(v);
              };
              return (
                <div key={tgl.key} className="line-toggle">
                  <span className="lt-label">{tgl.label}</span>
                  <label className="tgl">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 双栏布局 ===== */}
      <div className="relation-layout">
        {/* 左：关系图 */}
        <div
          className="card relation-graph-card"
          ref={graphContainerRef}
          style={{ padding: 0, overflow: 'hidden', minHeight: 540, position: 'relative' }}
        >
          <RelationGraph
            data={visibleData}
            layout={activeLayout}
            showLight={showLight}
            showDark={showDark}
            showLabel={showLabel}
            selectedNodeId={selectedNodeId}
            onNodeSelect={handleNodeSelect}
            onEdgeEdit={handleEdgeEdit}
          />
        </div>

        {/* 右：详情面板 */}
        <RelationDetailPanel
          node={selectedNode}
          edges={graphData.edges}
          nodes={graphData.nodes}
          onRelationClick={(edge) => {
            setEditorEdge(edge);
            setEditorMode('edit');
            setEditorOpen(true);
          }}
          onQuickPrompt={handleQuickPrompt}
        />
      </div>

      {/* ===== 关系编辑 Modal ===== */}
      <RelationEditor
        open={editorOpen}
        edge={editorEdge}
        mode={editorMode}
        nodes={graphData.nodes}
        onClose={() => {
          setEditorOpen(false);
          setEditorEdge(null);
        }}
        onSubmit={handleEditorSubmit}
        onDelete={handleEditorDelete}
      />
    </div>
  );
}
