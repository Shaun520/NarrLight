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
  type CharacterNode,
  type ClueOverviewNode,
  type SimpleNode,
  type ScriptClue,
  type ScriptNodeData,
} from './script-data';

interface EditorContentProps {
  /** 当前节点 ID */
  nodeId: string;
  /** 已保存的快照（nodeId → innerHTML），优先于默认数据 */
  snapshots: Record<string, string>;
  /** 内容变更回调（contenteditable input 事件） */
  onInput?: () => void;
  dataMap: Record<string, ScriptNodeData>;
  /** 只读渲染，用于历史版本预览 */
  readOnly?: boolean;
  /** 内容容器 id，避免页面内多个预览产生重复 id */
  contentId?: string;
  compareDataMap?: Record<string, ScriptNodeData>;
  diffMode?: 'highlight' | 'side-by-side';
}

function normalizeDiffText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTextChanged(current: string, previous = ''): boolean {
  return normalizeDiffText(current) !== normalizeDiffText(previous);
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
              <p key={pIdx} dangerouslySetInnerHTML={{ __html: text }} />
            ))}
          </section>
        </div>
      ))}
    </>
  );
}

function CharacterBookDiff({
  data,
  previous,
  mode,
}: {
  data: CharacterNode;
  previous?: CharacterNode;
  mode: 'highlight' | 'side-by-side';
}) {
  if (mode === 'side-by-side') {
    return (
      <div className="preview-diff-pair-list">
        {data.pages.map((page, idx) => {
          const previousPage = previous?.pages[idx];
          return (
            <section className="act-section" data-act={idx} key={idx}>
              <h2>
                <span className="act-num">{page.act}</span>
                {page.title}
              </h2>
              <div className="preview-diff-grid">
                <div className="preview-diff-column">
                  <div className="preview-diff-column-title">上一版</div>
                  {Array.from({
                    length: Math.max(
                      page.paragraphs.length,
                      previousPage?.paragraphs.length ?? 0,
                      1,
                    ),
                  }).map((_, pIdx) => {
                    const text = previousPage?.paragraphs[pIdx] ?? '';
                    return (
                      <p
                        key={pIdx}
                        className={
                          hasTextChanged(page.paragraphs[pIdx] ?? '', text)
                            ? 'preview-diff-paragraph is-removed'
                            : ''
                        }
                        dangerouslySetInnerHTML={{ __html: text || '（无内容）' }}
                      />
                    );
                  })}
                </div>
                <div className="preview-diff-column">
                  <div className="preview-diff-column-title">当前预览版</div>
                  {Array.from({
                    length: Math.max(
                      page.paragraphs.length,
                      previousPage?.paragraphs.length ?? 0,
                      1,
                    ),
                  }).map((_, pIdx) => {
                    const text = page.paragraphs[pIdx] ?? '';
                    return (
                      <p
                        key={pIdx}
                        className={
                          hasTextChanged(text, previousPage?.paragraphs[pIdx])
                            ? 'preview-diff-paragraph is-added'
                            : ''
                        }
                        dangerouslySetInnerHTML={{ __html: text || '（无内容）' }}
                      />
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {data.pages.map((page, idx) => {
        const previousPage = previous?.pages[idx];
        return (
          <div key={idx}>
            {idx > 0 && <hr className="act-divider" />}
            <section className="act-section" data-act={idx}>
              <h2>
                <span className="act-num">{page.act}</span>
                {page.title}
              </h2>
              <div className="page-meta">
                {data.name} 路 {data.role} 路 {page.subtitle}
              </div>
              {page.paragraphs.map((text, pIdx) => (
                <p
                  key={pIdx}
                  className={
                    hasTextChanged(text, previousPage?.paragraphs[pIdx])
                      ? 'preview-diff-paragraph is-added'
                      : ''
                  }
                  dangerouslySetInnerHTML={{ __html: text }}
                />
              ))}
            </section>
          </div>
        );
      })}
    </>
  );
}

/**
 * 渲染简单内容：预渲染 HTML
 */
function SimpleContent({ data }: { data: SimpleNode }) {
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}

function splitHtmlBlocks(html: string): string[] {
  const blocks = html.match(/<(h2|p|div)\b[\s\S]*?<\/\1>/gi);
  return blocks?.map((block) => block.trim()).filter(Boolean) ?? [html];
}

function SimpleContentDiff({
  data,
  previous,
  mode,
}: {
  data: SimpleNode;
  previous?: SimpleNode;
  mode: 'highlight' | 'side-by-side';
}) {
  const currentBlocks = splitHtmlBlocks(data.html);
  const previousBlocks = splitHtmlBlocks(previous?.html ?? '');

  if (mode === 'side-by-side') {
    const length = Math.max(currentBlocks.length, previousBlocks.length);
    return (
      <div className="preview-diff-grid">
        <div className="preview-diff-column">
          <div className="preview-diff-column-title">上一版</div>
          {Array.from({ length }).map((_, index) => (
            <div
              key={index}
              className={
                hasTextChanged(currentBlocks[index] ?? '', previousBlocks[index] ?? '')
                  ? 'preview-diff-block is-removed'
                  : 'preview-diff-block'
              }
              dangerouslySetInnerHTML={{ __html: previousBlocks[index] || '<p>（无内容）</p>' }}
            />
          ))}
        </div>
        <div className="preview-diff-column">
          <div className="preview-diff-column-title">当前预览版</div>
          {Array.from({ length }).map((_, index) => (
            <div
              key={index}
              className={
                hasTextChanged(currentBlocks[index] ?? '', previousBlocks[index] ?? '')
                  ? 'preview-diff-block is-added'
                  : 'preview-diff-block'
              }
              dangerouslySetInnerHTML={{ __html: currentBlocks[index] || '<p>（无内容）</p>' }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {currentBlocks.map((block, index) => (
        <div
          key={index}
          className={
            hasTextChanged(block, previousBlocks[index] ?? '')
              ? 'preview-diff-block is-added'
              : 'preview-diff-block'
          }
          dangerouslySetInnerHTML={{ __html: block }}
        />
      ))}
    </>
  );
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
        点击任意线索卡查看完整内容 · 共 {data.clues.length} 张 · 关键线索 {keyCount} 张 · 伪线索{' '}
        {fakeCount} 张
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

function ClueOverviewDiff({
  data,
  previous,
  mode,
}: {
  data: ClueOverviewNode;
  previous?: ClueOverviewNode;
  mode: 'highlight' | 'side-by-side';
}) {
  const previousByNo = new Map(previous?.clues.map((clue) => [clue.no, clue]) ?? []);
  const clueText = (clue?: ScriptClue) =>
    clue ? `${clue.no} ${clue.title} ${clue.tag} ${clue.loc}` : '';

  if (mode === 'side-by-side') {
    return (
      <>
        <h2>
          <span className="act-num">{data.actNum}</span>
          {data.title}
        </h2>
        <div className="preview-diff-grid">
          <div className="preview-diff-column">
            <div className="preview-diff-column-title">上一版</div>
            {data.clues.map((clue) => {
              const oldClue = previousByNo.get(clue.no);
              return (
                <div
                  key={clue.no}
                  className={
                    clueText(clue) !== clueText(oldClue)
                      ? 'clue-overview-item preview-diff-block is-removed'
                      : 'clue-overview-item preview-diff-block'
                  }
                >
                  <div className="co-no">
                    {oldClue?.no ?? clue.no} 路 {oldClue?.loc ?? '（无地点）'}
                  </div>
                  <div className="co-title">{oldClue?.title ?? '（无内容）'}</div>
                  <span className={`co-tag ${oldClue?.tagType ?? ''}`}>
                    {oldClue?.tag ?? '缺失'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="preview-diff-column">
            <div className="preview-diff-column-title">当前预览版</div>
            {data.clues.map((clue) => (
              <div
                key={clue.no}
                className={
                  clueText(clue) !== clueText(previousByNo.get(clue.no))
                    ? 'clue-overview-item preview-diff-block is-added'
                    : 'clue-overview-item preview-diff-block'
                }
              >
                <div className="co-no">
                  {clue.no} 路 {clue.loc}
                </div>
                <div className="co-title">{clue.title}</div>
                <span className={`co-tag ${clue.tagType ?? ''}`}>{clue.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>
        <span className="act-num">{data.actNum}</span>
        {data.title}
      </h2>
      <div className="clue-overview-list">
        {data.clues.map((clue) => (
          <div
            key={clue.no}
            className={
              clueText(clue) !== clueText(previousByNo.get(clue.no))
                ? 'clue-overview-item preview-diff-block is-added'
                : 'clue-overview-item'
            }
          >
            <div className="co-no">
              {clue.no} 路 {clue.loc}
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
  dataMap,
  readOnly = false,
  contentId = 'editorContent',
  compareDataMap,
  diffMode,
}: EditorContentProps) {
  const isEditing = useEditorStore((s) => s.isEditing);
  const contentRef = useRef<HTMLDivElement>(null);

  const data = dataMap[nodeId];
  const compareData = compareDataMap?.[nodeId];
  const snapshot = snapshots[nodeId];

  // 进入编辑态时，光标移到末尾（对齐原型 enterEditMode）
  useEffect(() => {
    if (readOnly || !isEditing || !contentRef.current) return;
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
  }, [isEditing, nodeId, readOnly]);

  const handleInput = () => {
    onInput?.();
  };

  if (!data) {
    return (
      <div className="editor-content" id={contentId}>
        <p style={{ color: 'var(--sepia)' }}>未找到节点内容</p>
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      id={contentId}
      className="editor-content"
      contentEditable={!readOnly && isEditing}
      suppressContentEditableWarning
      onInput={handleInput}
      role="textbox"
      aria-label="剧本编辑区"
      aria-multiline="true"
    >
      {diffMode && data?.type === 'character' ? (
        <CharacterBookDiff
          data={data}
          previous={compareData?.type === 'character' ? compareData : undefined}
          mode={diffMode}
        />
      ) : diffMode && data?.type === 'clue-overview' ? (
        <ClueOverviewDiff
          data={data}
          previous={compareData?.type === 'clue-overview' ? compareData : undefined}
          mode={diffMode}
        />
      ) : diffMode && data?.type === 'simple' ? (
        <SimpleContentDiff
          data={data}
          previous={compareData?.type === 'simple' ? compareData : undefined}
          mode={diffMode}
        />
      ) : snapshot ? (
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
