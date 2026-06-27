/**
 * 编辑器主内容区组件（T136）
 *
 * 严格对齐原型 workbench2.html renderNode / renderCharacterBook /
 * renderSimpleContent / renderClueOverview 函数（6647-6774 行）。
 *
 * 三种渲染分支：
 *   1. character     人物剧本：多幕长卷排版，.act-section + .act-divider
 *   2. simple        简单内容：预渲染 HTML（组织者手册 / 真相复盘）
 *   3. clue-overview 线索卡总览：42 张 .clue-overview-item 网格
 *
 * 编辑态：contenteditable=true，监听 input 标记 isDirty。
 * 古风排版：首字下沉、text-indent 2em、justify、.highlight / .sub-h / .ai-suggest
 */

'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/lib/stores/editor-store';
import {
  SCRIPT_DATA,
  type CharacterNode,
  type ClueOverviewNode,
  type SimpleNode,
  type ScriptClue,
} from './script-data';

interface EditorContentProps {
  /** 当前节点 ID */
  nodeId: string;
  /** 已保存的快照（nodeId → innerHTML），优先于默认数据 */
  snapshots: Record<string, string>;
  /** 内容变更回调（contenteditable input 事件） */
  onInput?: () => void;
}

/**
 * 渲染人物剧本：多幕长卷
 * 对齐原型 renderCharacterBook：每幕一个 .act-section，幕间 .act-divider
 */
function CharacterBook({ data }: { data: CharacterNode }) {
  return (
    <>
      {data.pages.map((page, idx) => (
        <div key={idx}>
          {idx > 0 && <hr className="act-divider" />}
          <section className="act-section" data-act={idx}>
            <h2>
              <span className="act-num">{page.act}</span>
              {page.title}
            </h2>
            <div className="page-meta">
              {data.name} · {data.role} · {page.subtitle}
            </div>
            {page.paragraphs.map((text, pIdx) => (
              <p
                key={pIdx}
                dangerouslySetInnerHTML={{ __html: text }}
              />
            ))}
          </section>
        </div>
      ))}
    </>
  );
}

/**
 * 渲染简单内容：预渲染 HTML
 */
function SimpleContent({ data }: { data: SimpleNode }) {
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}

/**
 * 渲染线索卡总览
 */
function ClueOverview({ data }: { data: ClueOverviewNode }) {
  const keyCount = data.clues.filter((c) => c.tagType === 'blood').length;
  const fakeCount = data.clues.filter((c) => c.tagType === 'ok').length;

  const handleClickClue = (clue: ScriptClue) => {
    // 对齐原型：toast 提示（这里简单 alert 由父级可扩展）
    if (typeof window !== 'undefined') {
      console.log(`线索 ${clue.no} · ${clue.title} · ${clue.loc}`);
    }
  };

  return (
    <>
      <h2>
        <span className="act-num">{data.actNum}</span>
        {data.title}
      </h2>
      <p
        style={{
          marginBottom: '14px',
          color: 'var(--sepia)',
          fontSize: '12.5px',
        }}
      >
        点击任意线索卡查看完整内容 · 共 {data.clues.length} 张 · 关键线索{' '}
        {keyCount} 张 · 伪线索 {fakeCount} 张
      </p>
      <div className="clue-overview-list">
        {data.clues.map((clue) => (
          <div
            key={clue.no}
            className="clue-overview-item"
            data-no={clue.no}
            role="button"
            tabIndex={0}
            onClick={() => handleClickClue(clue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClickClue(clue);
              }
            }}
          >
            <div className="co-no">
              {clue.no} · {clue.loc}
            </div>
            <div className="co-title">{clue.title}</div>
            <span className={`co-tag ${clue.tagType ?? ''}`}>{clue.tag}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * 编辑器主内容区
 */
export function EditorContent({
  nodeId,
  snapshots,
  onInput,
}: EditorContentProps) {
  const isEditing = useEditorStore((s) => s.isEditing);
  const contentRef = useRef<HTMLDivElement>(null);

  const data = SCRIPT_DATA[nodeId];
  const snapshot = snapshots[nodeId];

  // 进入编辑态时，光标移到末尾（对齐原型 enterEditMode）
  useEffect(() => {
    if (!isEditing || !contentRef.current) return;
    const el = contentRef.current;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [isEditing, nodeId]);

  const handleInput = () => {
    onInput?.();
  };

  if (!data) {
    return (
      <div className="editor-content" id="editorContent">
        <p style={{ color: 'var(--sepia)' }}>未找到节点内容</p>
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      id="editorContent"
      className="editor-content"
      contentEditable={isEditing}
      suppressContentEditableWarning
      onInput={handleInput}
      role="textbox"
      aria-label="剧本编辑区"
      aria-multiline="true"
    >
      {snapshot ? (
        <div dangerouslySetInnerHTML={{ __html: snapshot }} />
      ) : data.type === 'character' ? (
        <CharacterBook data={data} />
      ) : data.type === 'clue-overview' ? (
        <ClueOverview data={data} />
      ) : (
        <SimpleContent data={data} />
      )}
    </div>
  );
}
