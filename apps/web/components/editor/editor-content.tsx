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
  changeStatus?: NodeChangeStatus;
  diffLabels?: {
    previous: string;
    current: string;
  };
}

type NodeChangeStatus = 'added' | 'modified' | 'removed';
type DiffBlockStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface AlignedDiffBlock {
  previous?: string;
  current?: string;
  status: DiffBlockStatus;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextFromHtml(value: string): string {
  return normalizeDiffText(value);
}

function inlineDiff(
  previousValue: string,
  currentValue: string,
): { previous: string; current: string } {
  const previous = plainTextFromHtml(previousValue);
  const current = plainTextFromHtml(currentValue);
  if (previous === current) {
    return { previous: escapeHtml(previous), current: escapeHtml(current) };
  }
  if (!previous) {
    return { previous: '', current: `<span class="diff-ins">${escapeHtml(current)}</span>` };
  }
  if (!current) {
    return { previous: `<span class="diff-del">${escapeHtml(previous)}</span>`, current: '' };
  }
  if (previous.length * current.length > 250000) {
    return {
      previous: `<span class="diff-del">${escapeHtml(previous)}</span>`,
      current: `<span class="diff-ins">${escapeHtml(current)}</span>`,
    };
  }

  const rows = previous.length + 1;
  const cols = current.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = previous.length - 1; i >= 0; i -= 1) {
    for (let j = current.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        previous[i] === current[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const previousParts: string[] = [];
  const currentParts: string[] = [];
  let deleteBuffer = '';
  let insertBuffer = '';
  const flushDelete = () => {
    if (!deleteBuffer) return;
    previousParts.push(`<span class="diff-del">${escapeHtml(deleteBuffer)}</span>`);
    deleteBuffer = '';
  };
  const flushInsert = () => {
    if (!insertBuffer) return;
    currentParts.push(`<span class="diff-ins">${escapeHtml(insertBuffer)}</span>`);
    insertBuffer = '';
  };
  let i = 0;
  let j = 0;
  while (i < previous.length || j < current.length) {
    if (i < previous.length && j < current.length && previous[i] === current[j]) {
      flushDelete();
      flushInsert();
      previousParts.push(escapeHtml(previous[i]));
      currentParts.push(escapeHtml(current[j]));
      i += 1;
      j += 1;
    } else if (
      j < current.length &&
      (i === previous.length || table[i][j + 1] >= table[i + 1][j])
    ) {
      insertBuffer += current[j];
      j += 1;
    } else if (i < previous.length) {
      deleteBuffer += previous[i];
      i += 1;
    }
  }
  flushDelete();
  flushInsert();

  return { previous: previousParts.join(''), current: currentParts.join('') };
}

function alignDiffBlocks(previousBlocks: string[], currentBlocks: string[]): AlignedDiffBlock[] {
  const previousKeys = previousBlocks.map(normalizeDiffText);
  const currentKeys = currentBlocks.map(normalizeDiffText);
  const rows = previousKeys.length + 1;
  const cols = currentKeys.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = previousKeys.length - 1; i >= 0; i -= 1) {
    for (let j = currentKeys.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        previousKeys[i] === currentKeys[j] && previousKeys[i]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const anchors: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < previousKeys.length && j < currentKeys.length) {
    if (previousKeys[i] === currentKeys[j] && previousKeys[i]) {
      anchors.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const aligned: AlignedDiffBlock[] = [];
  let previousCursor = 0;
  let currentCursor = 0;

  const pushGap = (previousEnd: number, currentEnd: number) => {
    const previousGap = previousBlocks.slice(previousCursor, previousEnd);
    const currentGap = currentBlocks.slice(currentCursor, currentEnd);
    const gapLength = Math.max(previousGap.length, currentGap.length);

    for (let index = 0; index < gapLength; index += 1) {
      const previous = previousGap[index];
      const current = currentGap[index];
      if (previous !== undefined && current !== undefined) {
        aligned.push({
          previous,
          current,
          status: hasTextChanged(current, previous) ? 'modified' : 'unchanged',
        });
      } else if (previous !== undefined) {
        aligned.push({ previous, status: 'removed' });
      } else if (current !== undefined) {
        aligned.push({ current, status: 'added' });
      }
    }
  };

  for (const [previousIndex, currentIndex] of anchors) {
    pushGap(previousIndex, currentIndex);
    aligned.push({
      previous: previousBlocks[previousIndex],
      current: currentBlocks[currentIndex],
      status: 'unchanged',
    });
    previousCursor = previousIndex + 1;
    currentCursor = currentIndex + 1;
  }
  pushGap(previousBlocks.length, currentBlocks.length);

  return aligned.length ? aligned : [{ previous: previousBlocks[0], current: currentBlocks[0], status: 'unchanged' }];
}

function diffBlockHtml(block: AlignedDiffBlock, side: 'previous' | 'current'): string {
  const diff = inlineDiff(block.previous ?? '', block.current ?? '');
  if (side === 'previous') {
    return diff.previous || '<span class="preview-diff-empty">（无内容）</span>';
  }
  return diff.current || '<span class="preview-diff-empty">（无内容）</span>';
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
  changeStatus = 'modified',
  labels,
}: {
  data: CharacterNode;
  previous?: CharacterNode;
  mode: 'highlight' | 'side-by-side';
  changeStatus?: NodeChangeStatus;
  labels: { previous: string; current: string };
}) {
  const currentPages = changeStatus === 'removed' ? [] : data.pages;
  const previousPages = previous?.pages ?? (changeStatus === 'removed' ? data.pages : []);
  const pages = currentPages.length ? currentPages : previousPages;

  if (mode === 'side-by-side') {
    return (
      <div className="preview-diff-pair-list">
        {pages.map((page, idx) => {
          const currentPage = currentPages[idx];
          const previousPage = previousPages[idx];
          const rows = alignDiffBlocks(
            previousPage?.paragraphs ?? [],
            currentPage?.paragraphs ?? [],
          );
          return (
            <section className="act-section" data-act={idx} key={idx}>
              <h2>
                <span className="act-num">{page.act}</span>
                {page.title}
              </h2>
              <div className="preview-diff-grid">
                <div className="preview-diff-column">
                  <div className="preview-diff-column-title">{labels.previous}</div>
                  {rows.map((row, pIdx) => {
                    return (
                      <p
                        key={pIdx}
                        className={`preview-diff-paragraph is-${row.status}`}
                        dangerouslySetInnerHTML={{ __html: diffBlockHtml(row, 'previous') }}
                      />
                    );
                  })}
                </div>
                <div className="preview-diff-column">
                  <div className="preview-diff-column-title">{labels.current}</div>
                  {rows.map((row, pIdx) => {
                    return (
                      <p
                        key={pIdx}
                        className={`preview-diff-paragraph is-${row.status}`}
                        dangerouslySetInnerHTML={{ __html: diffBlockHtml(row, 'current') }}
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
      {pages.map((page, idx) => {
        const currentPage = currentPages[idx];
        const previousPage = previousPages[idx];
        const rows = alignDiffBlocks(previousPage?.paragraphs ?? [], currentPage?.paragraphs ?? []);
        return (
          <div key={idx}>
            {idx > 0 && <hr className="act-divider" />}
            <section className="act-section" data-act={idx}>
              <h2>
                <span className="act-num">{page.act}</span>
                {page.title}
              </h2>
              {rows.map((row, pIdx) => (
                <p
                  key={pIdx}
                  className={`preview-diff-paragraph is-${row.status}`}
                  dangerouslySetInnerHTML={{
                    __html:
                      row.status === 'removed'
                        ? diffBlockHtml(row, 'previous')
                        : diffBlockHtml(row, 'current'),
                  }}
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
  changeStatus = 'modified',
  labels,
}: {
  data: SimpleNode;
  previous?: SimpleNode;
  mode: 'highlight' | 'side-by-side';
  changeStatus?: NodeChangeStatus;
  labels: { previous: string; current: string };
}) {
  const currentBlocks = changeStatus === 'removed' ? [] : splitHtmlBlocks(data.html);
  const previousBlocks =
    previous?.html || changeStatus === 'removed' ? splitHtmlBlocks(previous?.html ?? data.html) : [];
  const rows = alignDiffBlocks(previousBlocks, currentBlocks);

  if (mode === 'side-by-side') {
    return (
      <div className="preview-diff-grid">
        <div className="preview-diff-column">
          <div className="preview-diff-column-title">{labels.previous}</div>
          {rows.map((row, index) => (
            <div
              key={index}
              className={`preview-diff-block is-${row.status}`}
              dangerouslySetInnerHTML={{
                __html: diffBlockHtml(row, 'previous'),
              }}
            />
          ))}
        </div>
        <div className="preview-diff-column">
          <div className="preview-diff-column-title">{labels.current}</div>
          {rows.map((row, index) => (
            <div
              key={index}
              className={`preview-diff-block is-${row.status}`}
              dangerouslySetInnerHTML={{
                __html: diffBlockHtml(row, 'current'),
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {rows.map((row, index) => (
        <div
          key={index}
          className={`preview-diff-block is-${row.status}`}
          dangerouslySetInnerHTML={{
            __html:
              row.status === 'removed'
                ? diffBlockHtml(row, 'previous')
                : diffBlockHtml(row, 'current'),
          }}
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
  changeStatus = 'modified',
  labels,
}: {
  data: ClueOverviewNode;
  previous?: ClueOverviewNode;
  mode: 'highlight' | 'side-by-side';
  changeStatus?: NodeChangeStatus;
  labels: { previous: string; current: string };
}) {
  const currentClues = changeStatus === 'removed' ? [] : data.clues;
  const previousClues = previous?.clues ?? (changeStatus === 'removed' ? data.clues : []);
  const currentByNo = new Map(currentClues.map((clue) => [clue.no, clue]));
  const previousByNo = new Map(previousClues.map((clue) => [clue.no, clue]));
  const clueNos = Array.from(new Set([...previousClues, ...currentClues].map((clue) => clue.no)));
  const clueText = (clue?: ScriptClue) =>
    clue ? `${clue.no} ${clue.title} ${clue.tag} ${clue.loc}` : '';
  const getStatus = (oldClue?: ScriptClue, clue?: ScriptClue): DiffBlockStatus => {
    if (oldClue && !clue) return 'removed';
    if (!oldClue && clue) return 'added';
    return clueText(clue) !== clueText(oldClue) ? 'modified' : 'unchanged';
  };
  const renderClue = (clueNo: string, side: 'previous' | 'current') => {
    const clue = currentByNo.get(clueNo);
    const oldClue = previousByNo.get(clueNo);
    const displayClue = side === 'previous' ? oldClue : clue;
    const status = getStatus(oldClue, clue);
    const noDiff = inlineDiff(oldClue?.no ?? '', clue?.no ?? '');
    const locDiff = inlineDiff(oldClue?.loc ?? '', clue?.loc ?? '');
    const titleDiff = inlineDiff(oldClue?.title ?? '', clue?.title ?? '');
    const tagDiff = inlineDiff(oldClue?.tag ?? '', clue?.tag ?? '');
    const empty = '<span class="preview-diff-empty">（无内容）</span>';

    return (
      <div key={`${side}-${clueNo}`} className={`clue-overview-item preview-diff-block is-${status}`}>
        <div className="co-no">
          <span dangerouslySetInnerHTML={{ __html: noDiff[side] || escapeHtml(clueNo) }} /> ·{' '}
          <span
            dangerouslySetInnerHTML={{
              __html: locDiff[side] || '<span class="preview-diff-empty">（无地点）</span>',
            }}
          />
        </div>
        <div
          className="co-title"
          dangerouslySetInnerHTML={{
            __html: titleDiff[side] || (displayClue ? escapeHtml(displayClue.title) : empty),
          }}
        />
        <span
          className={`co-tag ${displayClue?.tagType ?? ''}`}
          dangerouslySetInnerHTML={{
            __html: tagDiff[side] || (displayClue ? escapeHtml(displayClue.tag) : '缺失'),
          }}
        />
      </div>
    );
  };

  if (mode === 'side-by-side') {
    return (
      <>
        <h2>
          <span className="act-num">{data.actNum}</span>
          {data.title}
        </h2>
        <div className="preview-diff-grid">
          <div className="preview-diff-column">
            <div className="preview-diff-column-title">{labels.previous}</div>
            {clueNos.map((clueNo) => renderClue(clueNo, 'previous'))}
          </div>
          <div className="preview-diff-column">
            <div className="preview-diff-column-title">{labels.current}</div>
            {clueNos.map((clueNo) => renderClue(clueNo, 'current'))}
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
        {clueNos.map((clueNo) => {
          const clue = currentByNo.get(clueNo);
          const oldClue = previousByNo.get(clueNo);
          return renderClue(clueNo, getStatus(oldClue, clue) === 'removed' ? 'previous' : 'current');
        })}
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
  changeStatus,
  diffLabels = { previous: '上一版', current: '当前预览版' },
}: EditorContentProps) {
  const isEditing = useEditorStore((s) => s.isEditing);
  const contentRef = useRef<HTMLDivElement>(null);

  const data = dataMap[nodeId];
  const compareData = compareDataMap?.[nodeId];
  const snapshot = snapshots[nodeId];

  // 进入/退出编辑态：保护标题、分隔符等结构元素不被误编辑
  useEffect(() => {
    if (readOnly || !contentRef.current) return;
    const el = contentRef.current;
    const protectedSelectors = 'h2, hr, .act-divider, .sub-h, .act-num';
    el.querySelectorAll(protectedSelectors).forEach((node) => {
      node.setAttribute('contenteditable', isEditing ? 'false' : 'true');
    });

    if (!isEditing) return;
    // 只让编辑区获得焦点，不强制移动光标位置；
    // 首字下沉在编辑模式下已通过 CSS 临时禁用，光标默认位置不再突兀。
    el.focus({ preventScroll: true });
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
          changeStatus={changeStatus}
          labels={diffLabels}
        />
      ) : diffMode && data?.type === 'clue-overview' ? (
        <ClueOverviewDiff
          data={data}
          previous={compareData?.type === 'clue-overview' ? compareData : undefined}
          mode={diffMode}
          changeStatus={changeStatus}
          labels={diffLabels}
        />
      ) : diffMode && data?.type === 'simple' ? (
        <SimpleContentDiff
          data={data}
          previous={compareData?.type === 'simple' ? compareData : undefined}
          mode={diffMode}
          changeStatus={changeStatus}
          labels={diffLabels}
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
