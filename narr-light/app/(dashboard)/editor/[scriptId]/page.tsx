/**
 * 剧本编辑器页（视图3 · T134）
 *
 * 严格对齐原型 workbench2.html #view-editor 结构（4202-4314 行）。
 *
 * 路由：/dashboard/editor/[scriptId]
 *
 * 三栏布局 .editor-layout（220px / 1fr / 280px）：
 *   1. 左：ChapterTree   章节树（可折叠分组）
 *   2. 中：.editor-main   工具栏 + 编辑主区
 *   3. 右：.side-panel    版本历史 + AI 智能调整
 *
 * 客户端组件：使用 useEditorStore 管理 currentNodeId / isEditing / isDirty。
 * 高亮跳转：消费 useSearchParams 的 act/char/highlight 参数与 sessionStorage
 *           payload（由 IssueLocator 写入），切换幕次/角色并滚动高亮对应段落。
 * 本地状态：versions（版本列表）、snapshots（节点 HTML 快照）、
 *           showCompare（版本对比弹层）、showOutline（章节跳转弹层）。
 */

'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  FileText,
  Pencil,
  Save,
  GitCompare,
  Search,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useEditorStore } from '@/lib/stores/editor-store';
import { consumeHighlight, clearHighlight } from '@/components/editor/issue-locator';
import { ChapterTree } from '@/components/editor/chapter-tree';
import { EditorContent } from '@/components/editor/editor-content';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { VersionHistory, type VersionItem } from '@/components/editor/version-history';
import { AiAdjustPanel } from '@/components/editor/ai-adjust-panel';
import { VersionDiff } from '@/components/editor/version-diff';
import { ScriptOutline } from '@/components/editor/script-outline';
import {
  type CharacterNode,
  type CharacterPage,
  type SimpleNode,
  type ClueOverviewNode,
  type ScriptNodeData,
  type TreeGroup,
} from '@/components/editor/script-data';
import { exportEditorPdf } from '@/lib/export/editor-pdf-export';
import './editor.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

interface EditorDataBundle {
  dataMap: Record<string, ScriptNodeData>;
  groups: TreeGroup[];
  labels: Record<string, string>;
  defaultNodeId: string;
  versions: VersionItem[];
}

async function loadEditorData(scriptId: string): Promise<EditorDataBundle | null> {
  const response = await fetch(`/api/editor/${scriptId}`, { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Editor data request failed: ${response.status}`);
  }
  return (await response.json()) as EditorDataBundle;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(data.error ?? `Request failed: ${response.status}`));
  }
  return data as T;
}

/** Toast 提示状态 */
interface ToastState {
  visible: boolean;
  message: string;
  icon: string;
}

interface VersionPreviewState {
  version: string;
  time: string;
  note: string;
  title: string;
  dataMap: Record<string, ScriptNodeData>;
  baseDataMap?: Record<string, ScriptNodeData>;
  baseGroups?: TreeGroup[];
  baseLabels?: Record<string, string>;
  groups: TreeGroup[];
  labels: Record<string, string>;
  defaultNodeId: string;
  touchedNodeId?: string;
  compareBaseVersion?: string;
  changes: Record<
    string,
    { status: NodeChangeStatus; currentLength: number; previousLength: number }
  >;
  changedNodeIds: string[];
}

type VersionPreviewMode = 'highlight' | 'side-by-side';
type NodeChangeStatus = 'added' | 'modified' | 'removed';

function filterGroupsByNodeIds(groups: TreeGroup[], nodeIds: string[]): TreeGroup[] {
  const nodeSet = new Set(nodeIds);
  return groups
    .map((group) => {
      const children = group.children.filter((nodeId) => nodeSet.has(nodeId));
      return {
        ...group,
        children,
        count: children.length,
      };
    })
    .filter((group) => group.children.length > 0);
}

function mergePreviewGroups(
  currentGroups: TreeGroup[],
  baseGroups: TreeGroup[],
  changes: VersionPreviewState['changes'],
): TreeGroup[] {
  const merged = currentGroups.map((group) => ({ ...group, children: [...group.children] }));
  const groupById = new Map(merged.map((group) => [group.group, group]));
  const currentNodeIds = new Set(merged.flatMap((group) => group.children));

  for (const baseGroup of baseGroups) {
    const removedChildren = baseGroup.children.filter(
      (nodeId) => changes[nodeId]?.status === 'removed' && !currentNodeIds.has(nodeId),
    );
    if (!removedChildren.length) continue;

    const target = groupById.get(baseGroup.group);
    if (target) {
      target.children.push(...removedChildren);
      target.count = target.children.length;
    } else {
      merged.push({
        ...baseGroup,
        children: removedChildren,
        count: removedChildren.length,
      });
    }
  }

  return merged;
}

interface SaveEditorNodeRequest {
  nodeId: string;
  nodeType: 'character' | 'simple' | 'clue-overview';
  title: string;
  html: string;
  plainText: string;
  pages?: CharacterPage[];
  sections?: Array<{ actNum: string; title: string; text: string }>;
  clues?: Array<{ no: string; title: string; tag: string; loc: string }>;
  createVersion?: boolean;
}

/** 格式化 HH:MM */
function formatNow(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

/** 提取节点纯文本用于版本对比 */
function getNodePlainText(nodeId: string, dataMap: Record<string, ScriptNodeData>): string {
  const data = dataMap[nodeId];
  if (!data) return '';
  if (data.type === 'character') {
    const c = data as CharacterNode;
    return c.pages
      .map(
        (p) =>
          `${p.act} · ${p.title}\n${p.subtitle}\n${p.paragraphs
            .map((t) => t.replace(/<[^>]+>/g, ''))
            .join('\n')}`,
      )
      .join('\n\n');
  }
  if (data.type === 'clue-overview') {
    const c = data as ClueOverviewNode;
    return c.clues.map((cl) => `${cl.no} ${cl.title} ${cl.tag} ${cl.loc}`).join('\n');
  }
  const s = data as SimpleNode;
  return s.html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

/** 根据角色名查找人物剧本节点 ID（用于高亮跳转的 char 参数） */
function findCharacterNodeId(name: string, dataMap: Record<string, ScriptNodeData>): string | null {
  for (const [id, data] of Object.entries(dataMap)) {
    if (data.type === 'character' && data.name === name) {
      return id;
    }
  }
  return null;
}

function stripHtml(value: string): string {
  if (typeof document === 'undefined') {
    return value.replace(/<[^>]+>/g, ' ');
  }
  const template = document.createElement('template');
  template.innerHTML = value;
  return template.content.textContent ?? '';
}

function displayVersionNote(note: string): string {
  const rollbackMatch = note.match(/^回滚到版本\s*(\d+)$/);
  if (rollbackMatch) return `由 v${rollbackMatch[1]} 恢复后保存`;
  return note || '手动保存';
}

function getText(el: { textContent?: string } | null | undefined): string {
  return (el?.textContent ?? '').trim();
}

function parseCharacterPages(contentEl: HTMLElement, fallback: CharacterNode): CharacterPage[] {
  const sections = Array.from(contentEl.querySelectorAll('.act-section'));
  if (!sections.length) {
    return fallback.pages;
  }

  return sections.map((section, index) => {
    const heading = section.querySelector('h2');
    const act =
      getText(section.querySelector('.act-num')) ||
      fallback.pages[index]?.act ||
      `第${index + 1}幕`;
    const title = heading
      ? getText(heading).replace(act, '').trim()
      : fallback.pages[index]?.title || `第${index + 1}幕`;
    const meta = getText(section.querySelector('.page-meta'));
    const subtitle =
      meta.split(' · ').slice(2).join(' · ') || fallback.pages[index]?.subtitle || '';

    // contenteditable 可能生成 <div> 而非 <p>，优先取 <p>，无 <p> 时取其他块级子元素
    let paragraphEls = Array.from(section.querySelectorAll('p')) as HTMLElement[];
    if (!paragraphEls.length) {
      paragraphEls = Array.from(section.children).filter(
        (child) =>
          child.tagName !== 'H2' &&
          !child.classList.contains('page-meta') &&
          !child.classList.contains('act-divider'),
      ) as HTMLElement[];
    }
    const paragraphs = paragraphEls.map((p) => stripHtml(p.innerHTML).trim()).filter(Boolean);

    return {
      act,
      title: title || act,
      subtitle,
      paragraphs,
    };
  });
}

function parseSimpleSections(
  contentEl: HTMLElement,
  fallback: SimpleNode,
): Array<{ actNum: string; title: string; text: string }> {
  const sections: Array<{ actNum: string; title: string; text: string }> = [];
  let current: { actNum: string; title: string; textParts: string[] } | null = null;

  for (const child of Array.from(contentEl.children)) {
    if (child.tagName === 'H2') {
      const actNum = getText(child.querySelector('.act-num'));
      const heading = getText(child);
      const title = actNum ? heading.replace(actNum, '').trim() : heading.trim();
      if (current) {
        sections.push({
          actNum: current.actNum,
          title: current.title,
          text: current.textParts.join('\n').trim(),
        });
      }
      current = {
        actNum: actNum || fallback.actNum,
        title: title || fallback.title,
        textParts: [],
      };
      continue;
    }

    if (!current) continue;
    const text = stripHtml((child as HTMLElement).innerHTML).trim();
    if (text) current.textParts.push(text);
  }

  if (current) {
    sections.push({
      actNum: current.actNum,
      title: current.title,
      text: current.textParts.join('\n').trim(),
    });
  }

  if (!sections.length) {
    sections.push({
      actNum: fallback.actNum,
      title: fallback.title,
      text: stripHtml(fallback.html).trim(),
    });
  }

  return sections;
}

function parseClues(
  contentEl: HTMLElement,
  fallback: ClueOverviewNode,
): Array<{ no: string; title: string; tag: string; loc: string }> {
  const items = Array.from(contentEl.querySelectorAll('.clue-overview-item'));
  if (!items.length) {
    return fallback.clues.map((clue) => ({
      no: clue.no,
      title: clue.title,
      tag: clue.tag,
      loc: clue.loc,
    }));
  }

  return items.map((item, index) => {
    const no =
      getText(item.querySelector('.co-no')).split(' · ')[0] ||
      fallback.clues[index]?.no ||
      `#${String(index + 1).padStart(3, '0')}`;
    const loc =
      getText(item.querySelector('.co-no')).split(' · ')[1] || fallback.clues[index]?.loc || '';
    const title =
      getText(item.querySelector('.co-title')) ||
      fallback.clues[index]?.title ||
      `线索 ${index + 1}`;
    const tag = getText(item.querySelector('.co-tag')) || fallback.clues[index]?.tag || '线索';
    return { no, title, tag, loc };
  });
}

function buildSavePayload(
  currentNode: ScriptNodeData,
  currentNodeId: string,
  contentEl: HTMLElement,
): SaveEditorNodeRequest {
  const html = contentEl.innerHTML;
  if (currentNode.type === 'character') {
    return {
      nodeId: currentNodeId,
      nodeType: 'character',
      title: currentNode.name,
      html,
      plainText: parseCharacterPages(contentEl, currentNode)
        .map((page) =>
          [page.act, page.title, page.subtitle, ...page.paragraphs].filter(Boolean).join('\n'),
        )
        .join('\n\n'),
      pages: parseCharacterPages(contentEl, currentNode),
    };
  }

  if (currentNode.type === 'clue-overview') {
    return {
      nodeId: currentNodeId,
      nodeType: 'clue-overview',
      title: currentNode.title,
      html,
      plainText: parseClues(contentEl, currentNode)
        .map((clue) => `${clue.no} ${clue.title} ${clue.tag} ${clue.loc}`)
        .join('\n'),
      clues: parseClues(contentEl, currentNode),
    };
  }

  const sections = parseSimpleSections(contentEl, currentNode);
  return {
    nodeId: currentNodeId,
    nodeType: 'simple',
    title: currentNode.title,
    html,
    plainText: sections.map((section) => section.text).join('\n\n'),
    sections,
  };
}

/**
 * 剧本编辑器页
 */
export default function EditorPage({ params }: PageProps) {
  const { scriptId } = use(params);

  // ===== Store 状态 =====
  const currentNodeId = useEditorStore((s) => s.currentNodeId);
  const isEditing = useEditorStore((s) => s.isEditing);
  const isDirty = useEditorStore((s) => s.isDirty);
  const setCurrentNode = useEditorStore((s) => s.setCurrentNode);
  const setActIdx = useEditorStore((s) => s.setActIdx);
  const enterEditMode = useEditorStore((s) => s.enterEditMode);
  const exitEditMode = useEditorStore((s) => s.exitEditMode);
  const markDirty = useEditorStore((s) => s.markDirty);
  const markSaved = useEditorStore((s) => s.markSaved);

  // ===== 本地状态 =====
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [dirtyNodeIds, setDirtyNodeIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [editorData, setEditorData] = useState<EditorDataBundle | null>();
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollingBackVersion, setRollingBackVersion] = useState<string | null>(null);
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<string | null>(null);
  const [pendingDeleteVersion, setPendingDeleteVersion] = useState<string | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<VersionPreviewState | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<VersionPreviewMode>('highlight');
  const [previewChangedOnly, setPreviewChangedOnly] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [previewPortalRoot, setPreviewPortalRoot] = useState<HTMLElement | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    icon: '✓',
  });
  const [toolbarLabel, setToolbarLabel] = useState('');

  /** 章节搜索传入的待高亮关键字 */
  const [searchHighlight, setSearchHighlight] = useState<{
    nodeId: string;
    keyword: string;
  } | null>(null);

  // ===== 高亮跳转参数（来自 IssueLocator 漏洞定位） =====
  const searchParams = useSearchParams();

  // ===== 版本预览弹层挂载点（提升到 .app 层级，避免被 sidebar/topbar 遮挡） =====
  useEffect(() => {
    setPreviewPortalRoot(document.getElementById('editor-portal-root') ?? document.body);
  }, []);
  const highlightInitialized = useRef(false);
  const isEditorDataLoading = editorData === undefined;
  const activeDataMap = useMemo(() => editorData?.dataMap ?? {}, [editorData]);
  const activeDefaultNodeId = editorData?.defaultNodeId ?? null;
  const dirtyNodeSet = useMemo(() => new Set(dirtyNodeIds), [dirtyNodeIds]);
  const hasDirtyDrafts = dirtyNodeIds.length > 0;
  const previewTreeGroups = useMemo(() => {
    if (!previewVersion) return [];
    return mergePreviewGroups(
      previewVersion.groups,
      previewVersion.baseGroups ?? [],
      previewVersion.changes,
    );
  }, [previewVersion]);
  const previewLabels = useMemo(() => {
    if (!previewVersion) return {};
    return { ...(previewVersion.baseLabels ?? {}), ...previewVersion.labels };
  }, [previewVersion]);
  const previewRenderDataMap = useMemo(() => {
    if (!previewVersion) return {};
    return { ...(previewVersion.baseDataMap ?? {}), ...previewVersion.dataMap };
  }, [previewVersion]);
  const previewVisibleGroups = useMemo(() => {
    if (!previewVersion) return [];
    return previewChangedOnly
      ? filterGroupsByNodeIds(previewTreeGroups, previewVersion.changedNodeIds)
      : previewTreeGroups;
  }, [previewChangedOnly, previewTreeGroups, previewVersion]);

  useEffect(() => {
    let cancelled = false;
    setEditorData(undefined);
    loadEditorData(scriptId)
      .then((data) => {
        if (cancelled) return;
        setEditorData(data);
        setVersions(data?.versions ?? []);
        setSnapshots({});
        setDirtyNodeIds([]);
        markSaved();
        if (data?.defaultNodeId) setCurrentNode(data.defaultNodeId);
      })
      .catch((error) => {
        console.warn(`Failed to load editor data for ${scriptId}:`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [markSaved, scriptId, setCurrentNode]);

  // ===== 初始化默认节点 =====
  useEffect(() => {
    if (!activeDefaultNodeId) return;
    if (!currentNodeId || !activeDataMap[currentNodeId]) {
      setCurrentNode(activeDefaultNodeId);
    }
  }, [activeDataMap, activeDefaultNodeId, currentNodeId, setCurrentNode]);

  useEffect(() => {
    if (!previewVersion || !previewChangedOnly) return;
    const activeNode = previewNodeId ?? previewVersion.defaultNodeId;
    if (!previewVersion.changedNodeIds.includes(activeNode)) {
      setPreviewNodeId(previewVersion.changedNodeIds[0] ?? previewVersion.defaultNodeId);
    }
  }, [previewChangedOnly, previewNodeId, previewVersion]);

  useEffect(() => {
    if (dirtyNodeIds.length > 0) {
      markDirty();
    } else {
      markSaved();
    }
  }, [dirtyNodeIds.length, markDirty, markSaved]);

  // ===== 切换预览节点时滚动内容区到顶部 =====
  useEffect(() => {
    if (!previewVersion || !previewNodeId) return;
    const contentEl = document.getElementById('versionPreviewContent');
    if (contentEl) {
      contentEl.scrollTop = 0;
    }
  }, [previewNodeId, previewVersion]);

  // ===== 预览弹层：ESC 关闭 =====
  useEffect(() => {
    if (!previewVersion) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPreviewVersion(null);
      setPreviewNodeId(null);
      setPreviewMode('highlight');
      setPreviewChangedOnly(false);
      setPreviewFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewVersion]);

  // ===== 高亮跳转（消费 sessionStorage payload，切换幕次/角色并滚动高亮） =====
  useEffect(() => {
    if (highlightInitialized.current) return;
    highlightInitialized.current = true;

    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;

    const payload = consumeHighlight();
    if (!payload) return;

    const act = searchParams.get('act');
    const char = searchParams.get('char');

    // 切换到对应幕次（act 为 1-based，store 索引为 0-based）
    if (act) {
      const actNum = parseInt(act, 10);
      if (!Number.isNaN(actNum) && actNum > 0) {
        setActIdx(actNum - 1);
      }
    }

    // 切换到对应角色节点
    if (char) {
      const nodeId = findCharacterNodeId(char, activeDataMap);
      if (nodeId) {
        setCurrentNode(nodeId);
      }
    }

    // 等待内容渲染后滚动到高亮位置并打高亮
    const scrollTimer = window.setTimeout(() => {
      const target =
        document.getElementById('highlight') ||
        document.querySelector(`[data-issue-id="${highlightId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('highlight-pulse');
        window.setTimeout(() => {
          target.classList.remove('highlight-pulse');
          clearHighlight();
        }, 3000);
      } else {
        clearHighlight();
      }
    }, 500);

    return () => window.clearTimeout(scrollTimer);
  }, [activeDataMap, searchParams, setActIdx, setCurrentNode]);

  // ===== 章节搜索：跳转后高亮并滚动到关键字 =====
  useEffect(() => {
    if (!searchHighlight) return;
    if (searchHighlight.nodeId !== currentNodeId) return;

    const scrollTimer = window.setTimeout(() => {
      const contentEl = document.getElementById('editorContent');
      if (!contentEl) return;

      // 清除旧高亮
      contentEl.querySelectorAll('.search-highlight').forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
          parent.normalize();
        }
      });

      const keyword = searchHighlight.keyword.trim();
      if (!keyword) {
        setSearchHighlight(null);
        return;
      }

      // 查找第一个匹配的文本节点
      const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
      let node: Node | null = null;
      let targetMark: HTMLElement | null = null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (idx === -1) continue;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + keyword.length);
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        try {
          range.surroundContents(mark);
          targetMark = mark;
        } catch {
          // 跨元素时 surroundContents 会失败，忽略
        }
        break;
      }

      if (targetMark) {
        targetMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // 3 秒后清除高亮
      const clearTimer = window.setTimeout(() => {
        contentEl.querySelectorAll('.search-highlight').forEach((el) => {
          const parent = el.parentNode;
          if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
            parent.normalize();
          }
        });
        setSearchHighlight(null);
      }, 3000);

      return () => window.clearTimeout(clearTimer);
    }, 300);

    return () => window.clearTimeout(scrollTimer);
  }, [currentNodeId, searchHighlight]);

  // ===== 当前节点数据 =====
  const currentNode = currentNodeId ? activeDataMap[currentNodeId] : null;

  // ===== 计算工具栏标签（对齐原型 editorTbLabel） =====
  useEffect(() => {
    if (!currentNode) {
      setToolbarLabel('');
      return;
    }
    const ts = formatNow();
    const status = hasDirtyDrafts ? `${dirtyNodeIds.length} 个模块未保存` : `自动保存于 ${ts}`;
    if (currentNode.type === 'character') {
      const c = currentNode as CharacterNode;
      setToolbarLabel(`人物剧本 · ${c.name} · ${status}`);
    } else if (currentNode.type === 'clue-overview') {
      const c = currentNode as ClueOverviewNode;
      setToolbarLabel(`${c.fullTitle} · ${hasDirtyDrafts ? status : `加载于 ${ts}`}`);
    } else {
      const s = currentNode as SimpleNode;
      setToolbarLabel(`${s.fullTitle} · ${status}`);
    }
  }, [currentNode, dirtyNodeIds.length, hasDirtyDrafts]);

  // ===== Toast 自动消失 =====
  useEffect(() => {
    if (!toast.visible) return;
    const timer = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [toast.visible, toast.message]);

  const showToast = (message: string, icon = '✓') => {
    setToast({ visible: true, message, icon });
  };

  const markNodeDirty = (nodeId: string) => {
    setDirtyNodeIds((prev) => (prev.includes(nodeId) ? prev : [...prev, nodeId]));
    markDirty();
  };

  const clearSavedDrafts = (nodeIds: string[]) => {
    const savedSet = new Set(nodeIds);
    setSnapshots((prev) => {
      const next = { ...prev };
      for (const nodeId of savedSet) {
        delete next[nodeId];
      }
      return next;
    });
    setDirtyNodeIds((prev) => {
      return prev.filter((nodeId) => !savedSet.has(nodeId));
    });
  };

  const captureCurrentDraft = () => {
    if (!currentNodeId) return null;
    const contentEl = document.getElementById('editorContent');
    if (!contentEl) return null;
    const html = contentEl.innerHTML;
    setSnapshots((prev) => ({ ...prev, [currentNodeId]: html }));
    markNodeDirty(currentNodeId);
    return html;
  };

  const createDraftElement = (html: string): HTMLElement => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  };

  const getSaveElementForNode = (nodeId: string): HTMLElement | null => {
    const liveEl =
      nodeId === currentNodeId
        ? (document.getElementById('editorContent') as HTMLElement | null)
        : null;
    if (liveEl && (dirtyNodeSet.has(nodeId) || !snapshots[nodeId])) {
      return liveEl;
    }
    const draftHtml = snapshots[nodeId];
    return typeof draftHtml === 'string' ? createDraftElement(draftHtml) : liveEl;
  };

  const applySavedContentToEditorData = (nodeId: string, contentEl: HTMLElement) => {
    setEditorData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, dataMap: { ...prev.dataMap } };
      const node = updated.dataMap[nodeId];
      if (!node) return prev;
      if (node.type === 'character') {
        updated.dataMap[nodeId] = {
          ...node,
          pages: parseCharacterPages(contentEl, node as CharacterNode),
        } as ScriptNodeData;
      } else if (node.type === 'simple') {
        updated.dataMap[nodeId] = {
          ...node,
          html: contentEl.innerHTML,
        } as ScriptNodeData;
      } else if (node.type === 'clue-overview') {
        updated.dataMap[nodeId] = {
          ...node,
          clues: parseClues(contentEl, node as ClueOverviewNode),
        } as ScriptNodeData;
      }
      return updated;
    });
  };

  // ===== 切换节点 =====
  const handleSelectNode = (nodeId: string, options?: { keyword?: string }) => {
    if (nodeId === currentNodeId && !options?.keyword) return;
    if (isEditing && currentNodeId && dirtyNodeSet.has(currentNodeId)) {
      captureCurrentDraft();
      showToast('当前改动已暂存，尚未保存', '!');
    }
    if (isEditing) exitEditMode();
    setCurrentNode(nodeId);
    if (options?.keyword) {
      setSearchHighlight({ nodeId, keyword: options.keyword });
    }
  };

  // ===== 切换编辑态 =====
  const handleToggleEdit = async () => {
    if (isEditing) {
      if (currentNodeId && dirtyNodeSet.has(currentNodeId)) {
        const saved = await handleSaveContent();
        if (!saved) return;
        // 强制同步状态更新，确保退出编辑态前 dataMap 已是最新 DOM 内容
        flushSync(() => {});
      }
      exitEditMode();
    } else {
      if (!currentNode) {
        showToast('当前节点暂不支持编辑', '!');
        return;
      }
      enterEditMode();
      showToast('已进入编辑模式 · 可直接修改文字', '✎');
    }
  };

  // ===== 编辑内容变更 =====
  const handleContentInput = () => {
    if (!currentNodeId) return;
    markNodeDirty(currentNodeId);
  };

  // ===== 通用保存当前节点 =====
  const saveCurrentNode = async (createVersion: boolean): Promise<boolean> => {
    if (!currentNode || !currentNodeId) return false;
    const isLoading = createVersion ? isSavingVersion : isSavingContent;
    if (isLoading) return false;
    if (dirtyNodeSet.has(currentNodeId)) {
      captureCurrentDraft();
    }

    const setLoading = createVersion ? setIsSavingVersion : setIsSavingContent;
    setLoading(true);
    try {
      const dirtyIds = new Set(dirtyNodeIds);
      if (dirtyNodeSet.has(currentNodeId)) dirtyIds.add(currentNodeId);
      const nodeIdsToSave = createVersion
        ? Array.from(dirtyIds.size ? dirtyIds : new Set([currentNodeId]))
        : [currentNodeId];
      const versionNodeId = createVersion
        ? nodeIdsToSave.includes(currentNodeId)
          ? currentNodeId
          : nodeIdsToSave[nodeIdsToSave.length - 1]
        : null;

      let result: { snapshot: { versionNumber: number } | null } | null = null;
      const savedNodeIds: string[] = [];

      for (const nodeId of nodeIdsToSave) {
        const node = activeDataMap[nodeId];
        const contentEl = getSaveElementForNode(nodeId);
        if (!node || !contentEl) continue;
        const shouldCreateVersion = createVersion && nodeId === versionNodeId;
        const payload = buildSavePayload(node, nodeId, contentEl);
        result = await postJson<{ snapshot: { versionNumber: number } | null }>(
          `/api/editor/${scriptId}/save`,
          { ...payload, createVersion: shouldCreateVersion },
        );
        applySavedContentToEditorData(nodeId, contentEl);
        savedNodeIds.push(nodeId);
      }

      if (savedNodeIds.length === 0) {
        showToast('没有可保存的编辑内容', '!');
        return false;
      }

      clearSavedDrafts(savedNodeIds);
      const ts = formatNow();
      const labelPrefix =
        currentNode.type === 'character'
          ? `人物剧本 · ${(currentNode as CharacterNode).name}`
          : (currentNode as SimpleNode | ClueOverviewNode).fullTitle;
      setToolbarLabel(`${labelPrefix} · 已保存于 ${ts}`);

      if (createVersion && isEditing) exitEditMode();

      if (createVersion) {
        // 版本保存：重新加载编辑器数据以刷新版本列表
        const fresh = await loadEditorData(scriptId);
        if (fresh) {
          setEditorData(fresh);
          setVersions(fresh.versions ?? []);
          if (fresh.dataMap[currentNodeId]) {
            setCurrentNode(currentNodeId);
          } else if (fresh.defaultNodeId) {
            setCurrentNode(fresh.defaultNodeId);
          }
        }
        if (result?.snapshot) {
          showToast(`版本已保存 · v${result.snapshot.versionNumber}`, '✓');
        } else {
          showToast('版本已保存', '✓');
        }
      } else {
        // 编辑保存：不重新加载全部数据，避免内容闪烁
        showToast('内容已保存', '✓');
      }
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', '!');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ===== 编辑保存：只持久化业务表，不生成版本记录 =====
  const handleSaveContent = () => saveCurrentNode(false);

  // ===== 保存版本：持久化并生成新版本记录 =====
  const handleSaveVersion = () => saveCurrentNode(true);

  // ===== 版本预览 =====
  const handlePreviewVersion = async (version: string) => {
    const target = versions.find((item) => item.version === version);
    if (!target?.versionNumber || isPreviewLoading) {
      showToast(`找不到版本 ${version}`, '!');
      return;
    }

    setIsPreviewLoading(true);
    try {
      const response = await fetch(
        `/api/editor/${scriptId}?previewVersion=${target.versionNumber}`,
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => ({}))) as
        | VersionPreviewState
        | { error?: string };
      if (!response.ok) {
        const fallback =
          response.status === 404
            ? `版本 ${version} 不存在或已被删除，请刷新保存记录`
            : `读取版本失败: ${response.status}`;
        throw new Error(String('error' in data && data.error ? data.error : fallback));
      }
      const preview = data as VersionPreviewState;
      setPreviewVersion(preview);
      setPreviewNodeId(preview.changedNodeIds[0] ?? preview.touchedNodeId ?? preview.defaultNodeId);
      setPreviewMode('highlight');
      setPreviewChangedOnly(false);
      setPreviewFullscreen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '读取版本预览失败', '!');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // ===== 版本恢复 =====
  const handleRollback = async (version: string) => {
    if (isRollingBack) return;
    const target = versions.find((item) => item.version === version);
    if (!target?.versionNumber) {
      showToast(`找不到版本 ${version}`, '!');
      return;
    }

    setIsRollingBack(true);
    setRollingBackVersion(version);
    try {
      await postJson<{ snapshot: { versionNumber: number } }>(`/api/editor/${scriptId}/rollback`, {
        versionNumber: target.versionNumber,
      });

      setSnapshots({});
      setDirtyNodeIds([]);
      const fresh = await loadEditorData(scriptId);
      if (fresh) {
        setEditorData(fresh);
        setVersions(fresh.versions ?? []);
        if (currentNodeId && fresh.dataMap[currentNodeId]) {
          setCurrentNode(currentNodeId);
        } else if (fresh.defaultNodeId) {
          setCurrentNode(fresh.defaultNodeId);
        }
      }

      markSaved();
      if (isEditing) exitEditMode();
      setPendingRestoreVersion(null);
      showToast(`已恢复到 ${version}`, '⇄');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '恢复失败', '!');
    } finally {
      setIsRollingBack(false);
      setRollingBackVersion(null);
    }
  };

  // ===== 删除保存记录 =====
  const handleDeleteVersion = async (version: string) => {
    if (deletingVersion || isRollingBack) return;
    const target = versions.find((item) => item.version === version);
    if (!target?.versionNumber) {
      showToast(`找不到版本 ${version}`, '!');
      return;
    }
    if (target.isCurrent) {
      showToast('当前版本不能删除', '!');
      return;
    }

    setDeletingVersion(version);
    try {
      const response = await fetch(
        `/api/editor/${scriptId}?deleteVersion=${target.versionNumber}`,
        { method: 'DELETE' },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(String(data.error ?? `删除失败: ${response.status}`));
      }

      const fresh = await loadEditorData(scriptId);
      if (fresh) {
        setEditorData(fresh);
        setVersions(fresh.versions ?? []);
      }
      if (previewVersion?.version === version) {
        setPreviewVersion(null);
        setPreviewNodeId(null);
      }
      setPendingDeleteVersion(null);
      showToast(`已删除 ${version} 保存记录`, '✓');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除保存记录失败', '!');
    } finally {
      setDeletingVersion(null);
    }
  };

  // ===== PDF 导出 =====
  const handleExportPdf = () => {
    const contentEl = document.getElementById('editorContent');
    if (!contentEl || !contentEl.innerHTML.trim()) {
      showToast('当前没有可导出的内容', '!');
      return;
    }
    const title =
      currentNode && currentNode.type === 'character'
        ? `${(currentNode as CharacterNode).name} · 剧本`
        : '剧本';
    void scriptId;
    exportEditorPdf(contentEl.innerHTML, { title });
    showToast('正在准备打印 · 在对话框选"另存为 PDF"', '⤓');
  };

  // ===== AI 润色（占位） =====
  const handleAiPolish = () => {
    if (!currentNode) return;
    showToast('AI 润色指令已下发，请稍候…', '✦');
  };

  // ===== AI 智能调整 =====
  const handleAiAdjust = (instruction: string) => {
    showToast(`已执行调整：${instruction}`, '✦');
  };

  // ===== 版本预览变更导航 =====
  const handlePrevChange = () => {
    if (!previewVersion || !previewVersion.changedNodeIds.length) return;
    const activeNodeId = previewNodeId ?? previewVersion.defaultNodeId;
    const currentIndex = previewVersion.changedNodeIds.indexOf(activeNodeId);
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : previewVersion.changedNodeIds.length - 1;
    setPreviewNodeId(previewVersion.changedNodeIds[prevIndex]);
  };

  const handleNextChange = () => {
    if (!previewVersion || !previewVersion.changedNodeIds.length) return;
    const activeNodeId = previewNodeId ?? previewVersion.defaultNodeId;
    const currentIndex = previewVersion.changedNodeIds.indexOf(activeNodeId);
    const nextIndex =
      currentIndex < previewVersion.changedNodeIds.length - 1 ? currentIndex + 1 : 0;
    setPreviewNodeId(previewVersion.changedNodeIds[nextIndex]);
  };

  // ===== 编辑徽章状态 =====
  const badge: 'editing' | 'dirty' | 'saved' | 'hidden' = !isEditing
    ? 'hidden'
    : hasDirtyDrafts || isDirty
      ? 'dirty'
      : 'editing';

  // ===== 版本对比数据 =====
  const diffContent = useMemo(() => {
    if (!currentNodeId) return { a: '', b: '' };
    return {
      a: getNodePlainText(currentNodeId, activeDataMap),
      b:
        snapshots[currentNodeId] ??
        (activeDataMap[currentNodeId]
          ? activeDataMap[currentNodeId].type === 'simple'
            ? (activeDataMap[currentNodeId] as SimpleNode).html.replace(/<[^>]+>/g, ' ')
            : getNodePlainText(currentNodeId, activeDataMap)
          : ''),
    };
  }, [activeDataMap, currentNodeId, snapshots]);

  const versionA = versions[1]?.version ?? 'v1';
  const versionB = versions[0]?.version ?? 'v1';
  const pendingRestoreItem = pendingRestoreVersion
    ? versions.find((item) => item.version === pendingRestoreVersion)
    : null;
  const pendingDeleteItem = pendingDeleteVersion
    ? versions.find((item) => item.version === pendingDeleteVersion)
    : null;

  return (
    <section className="editor-view" id="view-editor">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {'\u5267\u672c\u7f16\u8f91\u5668'} <span className="seal">{'\u7ed3\u6784\u5316'}</span>
          </h1>
          <div className="page-desc">
            {
              '\u6309\u6a21\u5757\u5206\u533a\u6216\u8868\u5355\u5f0f\u7f16\u8f91 \u00b7 \u5f53\u524d'
            }{' '}
            {versions[0]?.version ?? 'v1'}
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowOutline(true)}
            title="Jump search"
          >
            <Search size={14} />
            跳转搜索
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowCompare(true)}>
            <GitCompare size={14} />
            版本对比
          </button>
          {!isEditing ? (
            <button type="button" className="btn btn-edit" onClick={handleToggleEdit}>
              <Pencil size={14} />
              编辑
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-edit active"
              onClick={handleToggleEdit}
              disabled={isSavingContent || isSavingVersion || isRollingBack}
            >
              <FileText size={14} />
              {isSavingContent
                ? '保存中...'
                : dirtyNodeSet.has(currentNodeId ?? '')
                  ? '保存并完成'
                  : '完成编辑'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveVersion}
            disabled={isSavingContent || isSavingVersion || isRollingBack}
          >
            <Save size={14} />
            {isSavingVersion
              ? '保存中...'
              : hasDirtyDrafts
                ? `保存版本（${dirtyNodeIds.length}）`
                : '保存版本'}
          </button>
        </div>
      </div>

      {/* ===== 三栏布局 ===== */}
      <div className="editor-layout">
        {/* 左：章节树 */}
        <div className="card" style={{ padding: '4px 0' }}>
          {isEditorDataLoading ? (
            <div style={{ padding: 24, color: 'var(--sepia)' }}>加载剧本结构中...</div>
          ) : editorData && currentNodeId && currentNode ? (
            <ChapterTree
              activeNodeId={currentNodeId}
              onSelect={handleSelectNode}
              groups={editorData.groups}
              labels={editorData.labels}
              changedNodeIds={dirtyNodeIds}
              changeBadgeLabel="未保存"
            />
          ) : (
            <div style={{ padding: 24, color: 'var(--sepia)' }}>暂无真实剧本数据</div>
          )}
        </div>

        {/* 中：编辑主区 */}
        <div className="editor-main" id="editorMain">
          <EditorToolbar
            label={toolbarLabel}
            badge={badge}
            onExportPdf={handleExportPdf}
            onAiPolish={handleAiPolish}
          />
          <div
            id="editorBody"
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {isEditorDataLoading ? (
              <div className="editor-content" id="editorContent">
                <p style={{ color: 'var(--sepia)' }}>加载剧本内容中...</p>
              </div>
            ) : editorData && currentNodeId && currentNode ? (
              <EditorContent
                nodeId={currentNodeId}
                snapshots={snapshots}
                onInput={handleContentInput}
                dataMap={activeDataMap}
              />
            ) : (
              <div className="editor-content" id="editorContent">
                <p style={{ color: 'var(--sepia)' }}>暂无真实剧本内容，请先完成生成。</p>
              </div>
            )}
          </div>
        </div>

        {/* 右：版本历史 + AI 调整 */}
        <div className="side-panel">
          <VersionHistory
            versions={versions}
            onPreview={handlePreviewVersion}
            onRestoreRequest={setPendingRestoreVersion}
            onDeleteRequest={setPendingDeleteVersion}
            isRollingBack={isRollingBack}
            rollingBackVersion={rollingBackVersion}
            isDeletingVersion={Boolean(deletingVersion)}
            deletingVersion={deletingVersion}
          />
          <AiAdjustPanel onExecute={handleAiAdjust} />
        </div>
      </div>

      {/* ===== 版本对比弹层 ===== */}
      {showCompare && (
        <VersionDiff
          versionA={versionA}
          versionB={versionB}
          contentA={diffContent.a}
          contentB={diffContent.b}
          onClose={() => setShowCompare(false)}
        />
      )}

      {/* ===== 历史版本预览 ===== */}
      {previewVersion &&
        previewPortalRoot &&
        createPortal(
          <div
            className={`vd-modal-overlay${previewFullscreen ? ' is-fullscreen' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${previewVersion.version} 预览`}
          >
            <div className="vd-modal version-preview-modal">
              <div className="vd-head">
                <h3>
                  <span className="vd-tag a">{previewVersion.version}</span>
                  <span>{previewVersion.title}</span>
                  <span className="vd-summary">
                    {previewVersion.note} · {previewVersion.time}
                  </span>
                </h3>
                <div className="vd-head-actions">
                  {previewVersion.compareBaseVersion &&
                    previewVersion.changedNodeIds.length > 0 && (
                      <div className="vd-nav-changes">
                        <button
                          type="button"
                          className="vd-nav-change-btn"
                          aria-label="上一处变更"
                          title="上一处变更"
                          onClick={handlePrevChange}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="vd-nav-change-count">
                          {previewVersion.changedNodeIds.indexOf(
                            previewNodeId ?? previewVersion.defaultNodeId,
                          ) + 1}
                          <span className="vd-nav-change-sep">/</span>
                          {previewVersion.changedNodeIds.length}
                        </span>
                        <button
                          type="button"
                          className="vd-nav-change-btn"
                          aria-label="下一处变更"
                          title="下一处变更"
                          onClick={handleNextChange}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  <button
                    type="button"
                    className="vd-fullscreen-toggle"
                    aria-label={previewFullscreen ? '退出全屏' : '全屏预览'}
                    title={previewFullscreen ? '退出全屏' : '全屏预览'}
                    onClick={() => setPreviewFullscreen((v) => !v)}
                  >
                    {previewFullscreen ? (
                      <Minimize2 size={16} />
                    ) : (
                      <>
                        <Maximize2 size={14} />
                        <span>全屏预览</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="vd-close"
                    aria-label="关闭"
                    onClick={() => {
                      setPreviewVersion(null);
                      setPreviewNodeId(null);
                      setPreviewMode('highlight');
                      setPreviewChangedOnly(false);
                      setPreviewFullscreen(false);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="version-preview-summary">
                <div>
                  {previewVersion.compareBaseVersion ? (
                    <>
                      对比基准 <b>{previewVersion.compareBaseVersion}</b>，共{' '}
                      <b>{previewVersion.changedNodeIds.length}</b> 个模块有变化
                      {previewVersion.changedNodeIds.includes(
                        previewNodeId ?? previewVersion.defaultNodeId,
                      ) && <span className="version-preview-current-flag">当前模块已变更</span>}
                    </>
                  ) : (
                    '这是该剧本的第一条保存记录，暂无上一版本可对比'
                  )}
                </div>
                {previewFullscreen && (
                  <span className="vd-esc-hint">
                    <kbd>ESC</kbd> 退出预览
                  </span>
                )}
              </div>
              <div className="version-preview-controls">
                <div className="version-preview-segmented" role="tablist" aria-label="预览模式">
                  <button
                    type="button"
                    className={previewMode === 'highlight' ? 'active' : ''}
                    onClick={() => setPreviewMode('highlight')}
                  >
                    段落高亮
                  </button>
                  <button
                    type="button"
                    className={previewMode === 'side-by-side' ? 'active' : ''}
                    onClick={() => setPreviewMode('side-by-side')}
                    disabled={!previewVersion.compareBaseVersion}
                  >
                    左右对比
                  </button>
                </div>
                <label className="version-preview-filter">
                  <input
                    type="checkbox"
                    checked={previewChangedOnly}
                    disabled={!previewVersion.changedNodeIds.length}
                    onChange={(event) => {
                      setPreviewChangedOnly(event.target.checked);
                      if (event.target.checked) {
                        setPreviewNodeId(
                          previewVersion.changedNodeIds[0] ?? previewVersion.defaultNodeId,
                        );
                      }
                    }}
                  />
                  只看有变化的模块
                </label>
              </div>
              <div className="version-preview-body">
                <aside className="version-preview-tree">
                  <ChapterTree
                    activeNodeId={previewNodeId ?? previewVersion.defaultNodeId}
                    onSelect={setPreviewNodeId}
                    groups={previewVisibleGroups}
                    labels={previewLabels}
                    changedNodeIds={previewVersion.changedNodeIds}
                    changeMap={previewVersion.changes}
                  />
                </aside>
                <div className="version-preview-main">
                  <EditorContent
                    nodeId={previewNodeId ?? previewVersion.defaultNodeId}
                    snapshots={{}}
                    dataMap={previewRenderDataMap}
                    compareDataMap={previewVersion.baseDataMap}
                    changeStatus={
                      previewVersion.changes[previewNodeId ?? previewVersion.defaultNodeId]?.status
                    }
                    diffMode={previewVersion.compareBaseVersion ? previewMode : undefined}
                    readOnly
                    contentId="versionPreviewContent"
                  />
                </div>
              </div>
            </div>
          </div>,
          previewPortalRoot,
        )}

      {/* ===== 恢复确认 ===== */}
      {pendingRestoreVersion && pendingRestoreItem && (
        <div
          className="vd-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`恢复到 ${pendingRestoreVersion}`}
        >
          <div className="restore-confirm-modal">
            <div className="restore-confirm-head">恢复到 {pendingRestoreVersion}？</div>
            <p>当前内容会生成一个新的保存版本，历史记录不会被删除。</p>
            <div className="restore-confirm-meta">
              {displayVersionNote(pendingRestoreItem.note)} · {pendingRestoreItem.time}
            </div>
            <div className="restore-confirm-actions">
              <button
                type="button"
                className="vi-preview-btn"
                onClick={() => setPendingRestoreVersion(null)}
                disabled={isRollingBack}
              >
                取消
              </button>
              <button
                type="button"
                className="vi-rollback-btn danger"
                onClick={() => handleRollback(pendingRestoreVersion)}
                disabled={isRollingBack}
              >
                {isRollingBack ? '恢复中...' : '确认恢复'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 删除保存记录确认 ===== */}
      {pendingDeleteVersion && pendingDeleteItem && (
        <div
          className="vd-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`删除 ${pendingDeleteVersion} 保存记录`}
        >
          <div className="restore-confirm-modal">
            <div className="restore-confirm-head">删除 {pendingDeleteVersion}？</div>
            <p>只会删除这条保存记录，不会修改当前剧本内容。删除后不能恢复。</p>
            <div className="restore-confirm-meta">
              {displayVersionNote(pendingDeleteItem.note)} · {pendingDeleteItem.time}
            </div>
            <div className="restore-confirm-actions">
              <button
                type="button"
                className="vi-preview-btn"
                onClick={() => setPendingDeleteVersion(null)}
                disabled={Boolean(deletingVersion)}
              >
                取消
              </button>
              <button
                type="button"
                className="vi-delete-btn danger"
                onClick={() => handleDeleteVersion(pendingDeleteVersion)}
                disabled={Boolean(deletingVersion)}
              >
                {deletingVersion ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 章节跳转搜索弹层 ===== */}
      {showOutline && editorData && currentNodeId && (
        <ScriptOutline
          activeNodeId={currentNodeId}
          onJump={handleSelectNode}
          onClose={() => setShowOutline(false)}
          dataMap={activeDataMap}
          groups={editorData.groups}
          labels={editorData.labels}
        />
      )}

      {/* ===== Toast ===== */}
      {toast.visible && (
        <div className="save-toast show" role="status">
          <span className="toast-icon">{toast.icon}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </section>
  );
}
