/**
 * 节点详情面板组件（T181）
 *
 * 严格对齐原型 workbench2.html #view-relations .side-panel：
 *   1. 选中节点卡：头像（姓氏首字）+ 姓名 + 角色身份 + 简介
 *   2. 关联关系卡：.rel-list-item 列表（.rel-type.light/dark + 描述 + .rel-strength）
 *   3. AI 关系调整快捷指令 .ai-adjust-box
 *
 * 当未选中节点时显示空状态提示。
 */
import { Sparkles } from 'lucide-react';
import {
  RELATION_STRENGTH_LABEL,
  type RelationEdge,
  type RelationNode,
} from '@/lib/services/relation-extractor';

export interface RelationDetailPanelProps {
  /** 当前选中节点（null 表示未选中） */
  node: RelationNode | null;
  /** 全部边（用于筛选当前节点的关联关系） */
  edges: RelationEdge[];
  /** 全部节点（用于查询关系对端节点的姓名） */
  nodes: RelationNode[];
  /** 点击关联关系项时回调 */
  onRelationClick?: (edge: RelationEdge) => void;
  /** 点击 AI 快捷指令时回调 */
  onQuickPrompt?: (prompt: string) => void;
}

/**
 * 节点详情面板
 */
export default function RelationDetailPanel({
  node,
  edges,
  nodes,
  onRelationClick,
  onQuickPrompt,
}: RelationDetailPanelProps) {
  // 未选中节点：空状态
  if (!node) {
    return (
      <div className="side-panel">
        <div className="card">
          <div className="card-head">
            <h3>选中节点</h3>
          </div>
          <div className="card-body">
            <div className="rel-empty">在关系图中点击节点查看详情</div>
          </div>
        </div>
      </div>
    );
  }

  // 节点关联关系：以 source 或 target 命中当前节点
  const relatedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );

  // 节点头像首字（取姓名首字）
  const avatarChar = node.name.charAt(0);
  // 角色身份简述
  const roleBrief = node.roleIdentity;

  // AI 快捷指令（基于当前节点生成 3 条建议）
  const quickPrompts = buildQuickPrompts(node, relatedEdges, nodes);

  return (
    <div className="side-panel">
      {/* ===== 选中节点卡 ===== */}
      <div className="card">
        <div className="card-head">
          <h3>选中节点</h3>
        </div>
        <div className="card-body">
          <div className="rel-node-head">
            <div
              className="rel-avatar"
              style={{ borderColor: node.color, color: node.color }}
              aria-hidden
            >
              {avatarChar}
            </div>
            <div className="rel-node-info">
              <div className="rel-node-name">{node.name}</div>
              <div className="rel-node-role" style={{ color: node.color }}>
                {roleBrief}
                {node.age ? ` · ${node.age}岁` : ''}
              </div>
            </div>
          </div>
          <div className="rel-node-bio">{node.backgroundStory || '暂无简介'}</div>
          {node.personalTask ? (
            <div className="rel-node-task">
              <span className="rel-task-label">个人任务</span>
              <span className="rel-task-text">{node.personalTask}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ===== 关联关系卡 ===== */}
      <div className="card">
        <div className="card-head">
          <h3>
            关联关系 <span className="count">{relatedEdges.length}</span>
          </h3>
        </div>
        <div className="card-body rel-list">
          {relatedEdges.length === 0 ? (
            <div className="rel-empty">暂无关联关系</div>
          ) : (
            relatedEdges.map((edge) => {
              const otherId = edge.source === node.id ? edge.target : edge.source;
              const other = nodes.find((n) => n.id === otherId);
              const otherName = other?.name ?? '未知';
              const isDark = edge.isHiddenRelation;
              const label = isDark
                ? edge.hiddenLabel || '暗线'
                : edge.label || '明线';
              return (
                <div
                  key={edge.id}
                  className="rel-list-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => onRelationClick?.(edge)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRelationClick?.(edge);
                    }
                  }}
                >
                  <span className={`rel-type ${isDark ? 'dark' : 'light'}`}>
                    {isDark ? '暗线' : '明线'}
                  </span>
                  <span className="rel-desc">
                    {otherName} · {label}
                  </span>
                  <span
                    className="rel-strength"
                    style={
                      edge.strength === 'fatal'
                        ? { color: 'var(--blood)' }
                        : undefined
                    }
                  >
                    {RELATION_STRENGTH_LABEL[edge.strength]}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ===== AI 关系调整快捷指令 ===== */}
      <div className="ai-adjust-box">
        <h4>
          <Sparkles />
          关系调整
        </h4>
        {quickPrompts.map((prompt) => (
          <div
            key={prompt}
            className="quick-prompt"
            role="button"
            tabIndex={0}
            onClick={() => onQuickPrompt?.(prompt)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onQuickPrompt?.(prompt);
              }
            }}
          >
            {prompt}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 基于当前节点生成 AI 关系调整快捷指令（保守的本地建议，可由 AI 替换）。
 */
function buildQuickPrompts(
  node: RelationNode,
  edges: RelationEdge[],
  allNodes: RelationNode[],
): string[] {
  const prompts: string[] = [];

  // 1. 若该节点为死者，建议新增与他人的暗线
  if (node.roleIdentity.includes('死')) {
    const outsider = allNodes.find(
      (n) => n.id !== node.id && n.camp === 'outsider',
    );
    if (outsider) {
      prompts.push(`新增${node.name}与${outsider.name}的暗线：私采乌头`);
    }
  }

  // 2. 若存在共谋关系，建议改为单向知情
  const hasConspiracy = edges.some(
    (e) => e.isHiddenRelation && e.hiddenLabel.includes('共谋'),
  );
  if (hasConspiracy) {
    prompts.push('将"共谋"关系改为单向知情');
  }

  // 3. 弱化明线建议
  const hasLightColleague = edges.some(
    (e) => e.isVisible && e.relationType === 'colleague',
  );
  if (hasLightColleague) {
    prompts.push(`弱化${node.name}明线，转为旁观者`);
  }

  // 兜底：至少展示一条建议
  if (prompts.length === 0) {
    prompts.push(`为${node.name}新增一条暗线关系`);
  }

  return prompts.slice(0, 3);
}
