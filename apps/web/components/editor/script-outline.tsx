/**
 * 章节跳转与关键词搜索面板组件（T142）
 *
 * 提供章节快速跳转 + 全文关键词搜索，用于 10 万字以上长剧本的快速定位。
 * 由父级以浮层 / 抽屉形式呈现，本组件仅负责面板内容渲染。
 *
 * 跳转：按章节树分组列出所有节点，点击跳转。
 * 搜索：在所有节点文本中检索关键词，返回命中段落预览，点击跳转。
 */

'use client';

import { useMemo, useState } from 'react';
import { Search, CornerDownRight } from 'lucide-react';
import {
  SCRIPT_DATA,
  TREE_GROUPS,
  NODE_LABELS,
  type CharacterNode,
  type SimpleNode,
  type ClueOverviewNode,
  type ScriptNodeData,
  type TreeGroup,
} from './script-data';

interface ScriptOutlineProps {
  /** 当前节点 ID */
  activeNodeId: string;
  /** 跳转到指定节点，可选携带搜索关键字用于正文高亮 */
  onJump: (nodeId: string, options?: { keyword?: string }) => void;
  /** 关闭面板 */
  onClose: () => void;
  dataMap?: Record<string, ScriptNodeData>;
  groups?: TreeGroup[];
  labels?: Record<string, string>;
}

/** 搜索命中条目 */
interface SearchHit {
  nodeId: string;
  nodeLabel: string;
  /** 命中片段（已去除 HTML 标签） */
  snippet: string;
  /** 命中字符在该节点纯文本中的起始位置 */
  offset: number;
}

/** 从可能含 HTML 标签的字符串中提取纯文本 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/** 转义正则特殊字符 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 高亮片段中的关键字 */
function HighlightSnippet({ snippet, keyword }: { snippet: string; keyword: string }) {
  if (!keyword.trim()) return <>{snippet}</>;
  const parts = snippet.split(new RegExp(`(${escapeRegExp(keyword)})`, 'gi'));
  return (
    <>
      {parts.map((part, idx) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={idx} className="so-hit-keyword">
            {part}
          </mark>
        ) : (
          <span key={idx}>{part}</span>
        ),
      )}
    </>
  );
}

/** 收集单个节点的纯文本与可搜索段落列表 */
function collectNodeSearchable(
  nodeId: string,
  dataMap: Record<string, ScriptNodeData>,
): { paragraphs: string[] } | null {
  const data = dataMap[nodeId];
  if (!data) return null;

  if (data.type === 'character') {
    const charNode = data as CharacterNode;
    const paragraphs: string[] = [];
    for (const page of charNode.pages) {
      paragraphs.push(`${page.act} · ${page.title} · ${page.subtitle}`);
      for (const p of page.paragraphs) {
        paragraphs.push(stripHtml(p));
      }
    }
    return { paragraphs };
  }
  if (data.type === 'clue-overview') {
    const clueNode = data as ClueOverviewNode;
    const paragraphs = clueNode.clues.map(
      (c) => `${c.no} ${c.title} ${c.tag} ${c.loc}`,
    );
    paragraphs.unshift(`${clueNode.actNum} · ${clueNode.title}`);
    return { paragraphs };
  }
  // simple
  const simpleNode = data as SimpleNode;
  const paragraphs = stripHtml(simpleNode.html)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { paragraphs };
}

/** 在所有节点中搜索关键词，返回命中条目（最多 50 条） */
function searchKeyword(
  keyword: string,
  dataMap: Record<string, ScriptNodeData>,
  labels: Record<string, string>,
): SearchHit[] {
  if (!keyword.trim()) return [];
  const kw = keyword.trim();
  const hits: SearchHit[] = [];
  for (const nodeId of Object.keys(dataMap)) {
    const searchable = collectNodeSearchable(nodeId, dataMap);
    if (!searchable) continue;
    for (const para of searchable.paragraphs) {
      let idx = para.toLowerCase().indexOf(kw.toLowerCase());
      while (idx !== -1 && hits.length < 50) {
        const start = Math.max(0, idx - 12);
        const end = Math.min(para.length, idx + kw.length + 24);
        const snippet = `${start > 0 ? '…' : ''}${para.slice(start, end)}${end < para.length ? '…' : ''}`;
        hits.push({
          nodeId,
          nodeLabel: labels[nodeId] ?? nodeId,
          snippet,
          offset: idx,
        });
        idx = para.toLowerCase().indexOf(kw.toLowerCase(), idx + kw.length);
      }
      if (hits.length >= 50) break;
    }
    if (hits.length >= 50) break;
  }
  return hits;
}

/**
 * 章节跳转与关键词搜索面板
 */
export function ScriptOutline({
  activeNodeId,
  onJump,
  onClose,
  dataMap = SCRIPT_DATA,
  groups = TREE_GROUPS,
  labels = NODE_LABELS,
}: ScriptOutlineProps) {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');

  const hits = useMemo(() => searchKeyword(query, dataMap, labels), [dataMap, labels, query]);

  const handleSearch = () => {
    setQuery(keyword);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div
      className="vd-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="章节跳转与搜索"
    >
      <div className="vd-modal so-modal">
        <div className="vd-head">
          <h3>章节跳转 · 关键词搜索</h3>
          <button
            type="button"
            className="vd-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="so-body">
          {/* ===== 搜索框 ===== */}
          <div className="so-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="输入关键词，回车搜索（人物 / 线索 / 剧情…）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="搜索关键词"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSearch}
            >
              搜索
            </button>
          </div>

          {query ? (
            // ===== 搜索结果 =====
            <div className="so-section">
              <div className="so-section-head">
                搜索 “{query}” · 命中 {hits.length} 条
              </div>
              {hits.length === 0 ? (
                <div className="so-empty">未找到匹配内容</div>
              ) : (
                <div className="so-hits">
                  {hits.map((hit, idx) => (
                    <div
                      key={idx}
                      className={`so-hit ${
                        hit.nodeId === activeNodeId ? 'active' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onJump(hit.nodeId, { keyword: query });
                        onClose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onJump(hit.nodeId, { keyword: query });
                          onClose();
                        }
                      }}
                    >
                      <div className="so-hit-head">
                        <CornerDownRight size={12} />
                        <span className="so-hit-node">{hit.nodeLabel}</span>
                      </div>
                      <div className="so-hit-snippet">
                        <HighlightSnippet snippet={hit.snippet} keyword={query} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // ===== 章节跳转 =====
            <div className="so-section">
              <div className="so-section-head">章节跳转</div>
              <div className="so-outline">
                {groups.map((group) => (
                  <div key={group.group} className="so-group">
                    <div className="so-group-title">{group.label}</div>
                    {group.children.map((nodeId) => (
                      <div
                        key={nodeId}
                        className={`so-outline-item ${
                          nodeId === activeNodeId ? 'active' : ''
                        }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          onJump(nodeId);
                          onClose();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onJump(nodeId);
                            onClose();
                          }
                        }}
                      >
                          {labels[nodeId] ?? nodeId}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
