/**
 * 章节树组件（T135）
 *
 * 左侧可折叠分组章节树，严格对齐原型 workbench2.html
 * #view-editor .tree 结构（4226-4260 行）。
 *
 * 视觉层级：
 *   .tree
 *     .tree-node.tree-group[data-group]   分组（含 .tree-arrow .count）
 *       .tree-children                     子节点容器（可折叠）
 *         .tree-node.lv2[data-node]        叶子节点
 *
 * 4 分组：chars / organizer / clues-overview / truth
 */

'use client';

import { useState } from 'react';
import {
  Users,
  List,
  CreditCard,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { NODE_LABELS, TREE_GROUPS } from './script-data';

interface ChapterTreeProps {
  /** 当前选中节点 ID */
  activeNodeId: string;
  /** 节点点击回调 */
  onSelect: (nodeId: string) => void;
}

/** 分组 → 图标映射 */
const GROUP_ICON: Record<string, LucideIcon> = {
  chars: Users,
  organizer: List,
  'clues-overview': CreditCard,
  truth: Clock,
};

/** 分组 → 子节点数量（对齐原型 .count） */
const GROUP_COUNT: Record<string, number> = {
  chars: 6,
  organizer: 4,
  'clues-overview': 42,
  truth: 1,
};

/** 初始展开状态：chars / organizer 默认展开 */
const INITIAL_EXPANDED: Record<string, boolean> = {
  chars: true,
  organizer: true,
  'clues-overview': false,
  truth: false,
};

/**
 * 章节树
 */
export function ChapterTree({ activeNodeId, onSelect }: ChapterTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    INITIAL_EXPANDED,
  );

  const toggleGroup = (group: string) => {
    setExpanded((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    action: () => void,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="tree" role="tree" aria-label="章节树">
      {TREE_GROUPS.map((group) => {
        const Icon = GROUP_ICON[group.group] ?? List;
        const isExpanded = expanded[group.group] ?? true;
        const count = GROUP_COUNT[group.group] ?? group.children.length;

        return (
          <div key={group.group}>
            <div
              className={`tree-node tree-group ${isExpanded ? '' : 'collapsed'}`}
              data-group={group.group}
              role="treeitem"
              aria-expanded={isExpanded}
              tabIndex={0}
              onClick={() => toggleGroup(group.group)}
              onKeyDown={(e) => handleKeyDown(e, () => toggleGroup(group.group))}
            >
              <Icon />
              <span>{group.label}</span>
              <span className="count">{count}</span>
              <span className="tree-arrow">▾</span>
            </div>

            <div
              className={`tree-children ${isExpanded ? '' : 'collapsed'}`}
              data-children={group.group}
              role="group"
            >
              {group.children.map((nodeId) => (
                <div
                  key={nodeId}
                  className={`tree-node lv2 ${
                    activeNodeId === nodeId ? 'active' : ''
                  }`}
                  data-node={nodeId}
                  role="treeitem"
                  tabIndex={0}
                  aria-selected={activeNodeId === nodeId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(nodeId);
                  }}
                  onKeyDown={(e) =>
                    handleKeyDown(e, () => onSelect(nodeId))
                  }
                >
                  {NODE_LABELS[nodeId] ?? nodeId}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
