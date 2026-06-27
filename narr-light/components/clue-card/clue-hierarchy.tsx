/**
 * 深入 / 隐藏线索解锁层级展示（T170）
 *
 * 递归展示线索的前置解锁链路（requires），标注解锁层级（unlockLevel）。
 * 深入线索（deep）/ 隐藏线索（hidden）需满足前置条件后方可获得（FR：线索层级关联）。
 *
 * 通过 allClues 解析 requires 中引用的线索 ID，递归构建解锁树，带环检测保护。
 */
'use client';

import { Lock, Unlock, Link2, CornerDownRight } from 'lucide-react';
import { CLUE_TYPE_LABELS, type Clue } from './clue-card';

interface ClueHierarchyProps {
  /** 当前线索 */
  clue: Clue;
  /** 全部线索，用于解析前置依赖 */
  allClues: Clue[];
  /** 选中前置线索（点击节点跳转） */
  onSelectClue?: (clue: Clue) => void;
}

interface HierarchyNode {
  clue: Clue;
  depth: number;
  isRoot: boolean;
}

/**
 * 递归收集前置依赖节点（带 visited 环检测）。
 */
function collectChain(
  clue: Clue,
  allClues: Clue[],
  depth: number,
  isRoot: boolean,
  visited: Set<string>,
  out: HierarchyNode[],
): void {
  if (visited.has(clue.id)) return;
  visited.add(clue.id);
  out.push({ clue, depth, isRoot });
  if (clue.requires && clue.requires.length > 0) {
    for (const reqId of clue.requires) {
      const req = allClues.find((c) => c.id === reqId);
      if (req) collectChain(req, allClues, depth + 1, false, visited, out);
    }
  }
}

/**
 * 解锁层级展示组件
 */
export function ClueHierarchy({ clue, allClues, onSelectClue }: ClueHierarchyProps) {
  const chain: HierarchyNode[] = [];
  collectChain(clue, allClues, 0, true, new Set(), chain);

  // 反转：根节点在前，前置依赖逐层缩进在后
  const ordered = [...chain].reverse();
  const hasPrereq = chain.length > 1;

  return (
    <div className="clue-hierarchy">
      <div className="ch-title">
        <Link2 size={13} /> 解锁层级
      </div>
      {hasPrereq ? (
        <ul className="ch-tree">
          {ordered.map((node) => (
            <li
              key={node.clue.id}
              className={`ch-node ${node.isRoot ? 'root' : 'prereq'}`}
              style={{ paddingLeft: 12 + node.depth * 18 }}
            >
              <span className="ch-node-icon">
                {node.isRoot ? <Unlock size={13} /> : <Lock size={12} />}
              </span>
              <span className="ch-node-code">{node.clue.code}</span>
              <span className="ch-node-title">{node.clue.title}</span>
              {!node.isRoot && <CornerDownRight size={12} className="ch-arrow" />}
              <span className="ch-node-type">{CLUE_TYPE_LABELS[node.clue.type]}</span>
              {typeof node.clue.unlockLevel === 'number' && node.clue.unlockLevel > 0 && (
                <span className="ch-level">L{node.clue.unlockLevel}</span>
              )}
              {!node.isRoot && onSelectClue && (
                <button
                  type="button"
                  className="ch-jump"
                  onClick={() => onSelectClue(node.clue)}
                >
                  查看
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="ch-empty">
          <Unlock size={14} />
          <span>无前置线索，表层即可获得</span>
        </div>
      )}
    </div>
  );
}

export default ClueHierarchy;
