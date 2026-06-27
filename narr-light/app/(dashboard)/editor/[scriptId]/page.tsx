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
import { useSearchParams } from 'next/navigation';
import { FileText, Pencil, Save, GitCompare, Search } from 'lucide-react';
import { useEditorStore } from '@/lib/stores/editor-store';
import { consumeHighlight, clearHighlight } from '@/components/editor/issue-locator';
import { ChapterTree } from '@/components/editor/chapter-tree';
import { EditorContent } from '@/components/editor/editor-content';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import {
  VersionHistory,
  type VersionItem,
} from '@/components/editor/version-history';
import { AiAdjustPanel } from '@/components/editor/ai-adjust-panel';
import { VersionDiff } from '@/components/editor/version-diff';
import { ScriptOutline } from '@/components/editor/script-outline';
import {
  SCRIPT_DATA,
  DEFAULT_NODE_ID,
  type CharacterNode,
  type SimpleNode,
  type ClueOverviewNode,
} from '@/components/editor/script-data';
import { exportEditorPdf } from '@/lib/export/editor-pdf-export';
import './editor.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

/** 默认版本列表（对齐原型 4287-4299 行） */
const DEFAULT_VERSIONS: VersionItem[] = [
  {
    version: 'v3',
    time: '14:32 今日',
    note: '第二幕新增公共搜证环节',
    isCurrent: true,
  },
  {
    version: 'v2',
    time: '昨日 21:08',
    note: '补全柳如烟童年背景，强化动机',
  },
  {
    version: 'v1',
    time: '2 天前',
    note: 'AI 初版全本生成',
  },
];

/** Toast 提示状态 */
interface ToastState {
  visible: boolean;
  message: string;
  icon: string;
}

/** 格式化 HH:MM */
function formatNow(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

/** 提取节点纯文本用于版本对比 */
function getNodePlainText(nodeId: string): string {
  const data = SCRIPT_DATA[nodeId];
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
  return s.html.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim();
}

/** 根据角色名查找人物剧本节点 ID（用于高亮跳转的 char 参数） */
function findCharacterNodeId(name: string): string | null {
  for (const [id, data] of Object.entries(SCRIPT_DATA)) {
    if (data.type === 'character' && data.name === name) {
      return id;
    }
  }
  return null;
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
  const [versions, setVersions] = useState<VersionItem[]>(DEFAULT_VERSIONS);
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [showCompare, setShowCompare] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    icon: '✓',
  });
  const [toolbarLabel, setToolbarLabel] = useState('');

  // ===== 高亮跳转参数（来自 IssueLocator 漏洞定位） =====
  const searchParams = useSearchParams();
  const highlightInitialized = useRef(false);

  // ===== 初始化默认节点 =====
  useEffect(() => {
    if (!currentNodeId) {
      setCurrentNode(DEFAULT_NODE_ID);
    }
  }, [currentNodeId, setCurrentNode]);

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
      const nodeId = findCharacterNodeId(char);
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
  }, [searchParams, setActIdx, setCurrentNode]);

  // ===== 当前节点数据 =====
  const currentNode = currentNodeId ? SCRIPT_DATA[currentNodeId] : null;

  // ===== 计算工具栏标签（对齐原型 editorTbLabel） =====
  useEffect(() => {
    if (!currentNode) {
      setToolbarLabel('');
      return;
    }
    const ts = formatNow();
    if (currentNode.type === 'character') {
      const c = currentNode as CharacterNode;
      setToolbarLabel(`人物剧本 · ${c.name} · 自动保存于 ${ts}`);
    } else if (currentNode.type === 'clue-overview') {
      const c = currentNode as ClueOverviewNode;
      setToolbarLabel(`${c.fullTitle} · 加载于 ${ts}`);
    } else {
      const s = currentNode as SimpleNode;
      setToolbarLabel(`${s.fullTitle} · 自动保存于 ${ts}`);
    }
  }, [currentNode]);

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

  // ===== 切换节点 =====
  const handleSelectNode = (nodeId: string) => {
    if (nodeId === currentNodeId) return;
    // 切节点前若有未保存改动，自动暂存快照
    if (isDirty && currentNodeId) {
      const contentEl = document.getElementById('editorContent');
      if (contentEl) {
        setSnapshots((prev) => ({
          ...prev,
          [currentNodeId]: contentEl.innerHTML,
        }));
      }
      markSaved();
      showToast('检测到未保存改动，已自动暂存', '!');
    }
    if (isEditing) exitEditMode();
    setCurrentNode(nodeId);
  };

  // ===== 切换编辑态 =====
  const handleToggleEdit = () => {
    if (isEditing) {
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
    if (!isDirty) markDirty();
  };

  // ===== 保存版本（对齐原型 saveVersion） =====
  const handleSaveVersion = () => {
    if (!currentNode || !currentNodeId) return;
    const contentEl = document.getElementById('editorContent');
    if (!contentEl) return;

    // 保存整段 HTML 快照
    setSnapshots((prev) => ({
      ...prev,
      [currentNodeId]: contentEl.innerHTML,
    }));

    markSaved();
    const ts = formatNow();
    const labelPrefix =
      currentNode.type === 'character'
        ? `人物剧本 · ${(currentNode as CharacterNode).name}`
        : (currentNode as SimpleNode | ClueOverviewNode).fullTitle;
    setToolbarLabel(`${labelPrefix} · 已保存于 ${ts}`);

    // 在版本历史中追加一条（对齐原型 prepend 逻辑）
    setVersions((prev) => {
      const nextVersion = `v${prev.length + 1}`;
      const newItem: VersionItem = {
        version: nextVersion,
        time: `${ts} 刚刚`,
        note: `手动保存 · ${
          currentNode.type === 'character'
            ? (currentNode as CharacterNode).name
            : (currentNode as SimpleNode | ClueOverviewNode).title
        }`,
        isCurrent: true,
      };
      return [
        newItem,
        ...prev.map((v) => ({ ...v, isCurrent: false })),
      ];
    });

    if (isEditing) exitEditMode();
    showToast(`版本已保存 · v${versions.length + 1}`, '✓');
  };

  // ===== 版本回退 =====
  const handleRollback = (version: string) => {
    // 清除当前节点快照（回到默认数据）
    if (currentNodeId) {
      setSnapshots((prev) => {
        const next = { ...prev };
        delete next[currentNodeId];
        return next;
      });
    }
    markSaved();
    setVersions((prev) =>
      prev.map((v) => ({ ...v, isCurrent: v.version === version })),
    );
    if (isEditing) exitEditMode();
    showToast(`已回退到 ${version}`, '⇄');
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

  // ===== 编辑徽章状态 =====
  const badge: 'editing' | 'dirty' | 'saved' | 'hidden' = !isEditing
    ? 'hidden'
    : isDirty
      ? 'dirty'
      : 'editing';

  // ===== 版本对比数据 =====
  const diffContent = useMemo(() => {
    if (!currentNodeId) return { a: '', b: '' };
    return {
      a: getNodePlainText(currentNodeId),
      b: snapshots[currentNodeId] ?? getNodePlainText(currentNodeId),
    };
  }, [currentNodeId, snapshots]);

  const versionA = versions[1]?.version ?? 'v1';
  const versionB = versions[0]?.version ?? 'v1';

  return (
    <section className="view editor-view" id="view-editor">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            剧本编辑器 <span className="seal">结构化</span>
          </h1>
          <div className="page-desc">
            // 按模块分区域表单式编辑 · 修改自动触发关联校验 · 当前{' '}
            {versions[0]?.version ?? 'v1'}
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowOutline(true)}
            title="章节跳转与搜索"
          >
            <Search size={14} />
            跳转搜索
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowCompare(true)}
          >
            <GitCompare size={14} />
            版本对比
          </button>
          <button
            type="button"
            className={`btn btn-edit ${isEditing ? 'active' : ''}`}
            onClick={handleToggleEdit}
          >
            {isEditing ? <FileText size={14} /> : <Pencil size={14} />}
            {isEditing ? '完成编辑' : '编辑'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveVersion}
          >
            <Save size={14} />
            保存版本
          </button>
        </div>
      </div>

      {/* ===== 三栏布局 ===== */}
      <div className="editor-layout">
        {/* 左：章节树 */}
        <div className="card" style={{ padding: '4px 0' }}>
          {currentNodeId && (
            <ChapterTree
              activeNodeId={currentNodeId}
              onSelect={handleSelectNode}
            />
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
            {currentNodeId && (
              <EditorContent
                nodeId={currentNodeId}
                snapshots={snapshots}
                onInput={handleContentInput}
              />
            )}
          </div>
        </div>

        {/* 右：版本历史 + AI 调整 */}
        <div className="side-panel">
          <VersionHistory
            versions={versions}
            onRollback={handleRollback}
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

      {/* ===== 章节跳转搜索弹层 ===== */}
      {showOutline && currentNodeId && (
        <ScriptOutline
          activeNodeId={currentNodeId}
          onJump={handleSelectNode}
          onClose={() => setShowOutline(false)}
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
