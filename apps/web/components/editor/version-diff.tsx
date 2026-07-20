/**
 * 版本差异对比组件（T141）
 *
 * 两版并排高亮差异视图，支持按行级 diff 展示新增 / 删除 / 修改。
 * 由父级以 Modal/Drawer 形式呈现，本组件仅负责 diff 内容渲染。
 *
 * diff 算法采用行级 LCS（最长公共子序列），
 * 对齐 types/index.ts VersionDiffResult 的 added / removed / modified 字段。
 */

'use client';

/** 单行差异类型 */
type DiffLineType = 'equal' | 'added' | 'removed';

/** 单行差异条目 */
interface DiffLine {
  type: DiffLineType;
  text: string;
}

interface VersionDiffProps {
  /** 旧版本号 */
  versionA: string;
  /** 新版本号 */
  versionB: string;
  /** 旧版本内容（按行拆分的文本） */
  contentA: string;
  /** 新版本内容（按行拆分的文本） */
  contentB: string;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 行级 LCS diff：将两段文本按行比对，返回差异行数组。
 * 简化实现：O(n*m) DP，适用于编辑器场景的中小段落对比。
 */
function computeLineDiff(a: string, b: string): DiffLine[] {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const n = linesA.length;
  const m = linesB.length;

  // dp[i][j] = linesA[0..i) 与 linesB[0..j) 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯
  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (linesA[i - 1] === linesB[j - 1]) {
      result.unshift({ type: 'equal', text: linesA[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      result.unshift({ type: 'removed', text: linesA[i - 1] });
      i--;
    } else {
      result.unshift({ type: 'added', text: linesB[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    result.unshift({ type: 'removed', text: linesA[i - 1] });
    i--;
  }
  while (j > 0) {
    result.unshift({ type: 'added', text: linesB[j - 1] });
    j--;
  }
  return result;
}

/**
 * 版本差异对比
 */
export function VersionDiff({
  versionA,
  versionB,
  contentA,
  contentB,
  onClose,
}: VersionDiffProps) {
  const diffLines = computeLineDiff(contentA, contentB);
  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;

  return (
    <div
      className="vd-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`版本对比 ${versionA} 与 ${versionB}`}
    >
      <div className="vd-modal">
        <div className="vd-head">
          <h3>
            <span className="vd-tag a">{versionA}</span>
            <span className="vd-arrow">⇄</span>
            <span className="vd-tag b">{versionB}</span>
            <span className="vd-summary">
              新增 <b className="added">{addedCount}</b> · 删除{' '}
              <b className="removed">{removedCount}</b>
            </span>
          </h3>
          <button
            type="button"
            className="vd-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="vd-body">
          <div className="vd-pane vd-pane-a">
            <div className="vd-pane-head">{versionA}</div>
            <div className="vd-pane-content">
              {diffLines.map((line, idx) =>
                line.type === 'added' ? null : (
                  <div
                    key={idx}
                    className={`vd-line ${line.type}`}
                  >
                    <span className="vd-line-no">
                      {line.type === 'removed' ? '-' : ' '}
                    </span>
                    <span className="vd-line-text">{line.text || ' '}</span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="vd-pane vd-pane-b">
            <div className="vd-pane-head">{versionB}</div>
            <div className="vd-pane-content">
              {diffLines.map((line, idx) =>
                line.type === 'removed' ? null : (
                  <div
                    key={idx}
                    className={`vd-line ${line.type}`}
                  >
                    <span className="vd-line-no">
                      {line.type === 'added' ? '+' : ' '}
                    </span>
                    <span className="vd-line-text">{line.text || ' '}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
