/**
 * 时间线校验报告 PDF 导出（T316）
 *
 * 使用隐藏 iframe 打印方案（参照 editor-pdf-export.ts），通过浏览器原生
 * 打印对话框让用户选择"另存为 PDF"。内容包含：
 *   1. 报告头：剧本标题 + 校验时间 + 冲突统计；
 *   2. 时间线图：以 HTML 表格形式按角色 × 时间窗渲染事件块；
 *   3. 冲突列表：每条含严重等级徽章 / 类型 / 标题 / 描述 / 位置；
 *   4. 角色时间表：按角色分组列出该角色全部事件，含起止时间 / 地点 / 幕次。
 *
 * 保留古风排版：朱砂标题、❖ 分隔符、Courier 副标。
 */
import type { TimelineEvent } from '@/lib/validation/timeline/extractor';
import {
  SEVERITY_LABELS,
  CONFLICT_TYPE_LABELS,
  type ConflictItem,
  type ConflictSeverity,
} from '@/lib/validation/timeline/conflict-detector';

/** 角色元信息（与页面 CHARACTERS 结构对齐） */
export interface TimelineReportCharacter {
  id: string;
  name: string;
  color: string;
}

/** 报告入参 */
export interface TimelineReportData {
  scriptId: string;
  /** 剧本标题 */
  scriptTitle: string;
  /** 全部时间线事件 */
  events: TimelineEvent[];
  /** 全部冲突条目 */
  conflicts: ConflictItem[];
  /** 角色元信息（用于时间线图分组与角色时间表） */
  characters: TimelineReportCharacter[];
  /** 校验时间戳 */
  validatedAt: number;
}

/** 默认古风打印样式（对齐 editor-pdf-export.ts 的 PRINT_STYLES 风格） */
const PRINT_STYLES = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Noto Serif SC", "Songti SC", serif;
    color: #2a1d12;
    background: #fdf8f0;
    padding: 8px 4px;
  }
  h1.doc-title {
    text-align: center;
    font-size: 22px;
    color: #8a1c1c;
    border-bottom: 2px solid #8a1c1c;
    padding-bottom: 10px;
    margin: 0 0 8px;
    letter-spacing: 0.15em;
  }
  .page-meta {
    font-size: 11px; color: #7a5c3a;
    letter-spacing: 0.1em; margin: 0 0 18px;
    text-align: center;
    font-family: "Courier Prime", monospace;
  }
  .act-divider {
    border: none; text-align: center; margin: 20px 0;
    position: relative; height: 0;
  }
  .act-divider::before {
    content: ""; position: absolute; left: 0; right: 0; top: 50%;
    border-top: 1px dashed rgba(122,92,58,0.4);
  }
  .act-divider::after {
    content: "❖"; position: relative; top: -11px;
    background: #fdf8f0; color: #8a1c1c; padding: 0 14px; font-size: 14px;
  }
  h2.section-title {
    font-family: "ZCOOL XiaoWei", "Noto Serif SC", serif;
    font-size: 17px; color: #8a1c1c;
    margin: 8px 0 10px;
    border-bottom: 1px dashed rgba(138,28,28,0.3);
    padding-bottom: 4px;
  }
  .stats-row {
    display: flex; gap: 8px; margin-bottom: 14px;
  }
  .stat-box {
    flex: 1; padding: 8px 10px;
    border: 1px solid #a88a64; border-radius: 2px;
    background: #f3e9db;
  }
  .stat-label {
    font-size: 9px; color: #5c4226;
    font-family: "Courier Prime", monospace;
    margin-bottom: 2px; letter-spacing: 0.05em;
  }
  .stat-value {
    font-size: 16px; font-weight: 900;
  }
  .stat-severe { color: #8a1c1c; }
  .stat-warning { color: #b8841c; }
  .stat-hint { color: #3a5a7a; }
  .stat-trick { color: #6a4a8a; }

  /* 时间线图（HTML 表格形式） */
  table.tl-chart {
    width: 100%; border-collapse: collapse;
    font-size: 10px; margin-bottom: 6px;
  }
  table.tl-chart th, table.tl-chart td {
    border: 1px solid #d4c4b0; padding: 4px 6px; vertical-align: top;
  }
  table.tl-chart thead th {
    background: #f0e4d0; color: #5c4226;
    font-family: "Courier Prime", monospace; font-size: 9px;
  }
  table.tl-chart td.char-cell {
    font-weight: 900; color: #fdf8f0;
    text-align: center; width: 70px;
    font-family: "ZCOOL XiaoWei", serif;
  }
  table.tl-chart td.events-cell {
    line-height: 1.6;
  }
  .ev-block {
    display: inline-block; margin: 2px 4px 2px 0;
    padding: 2px 6px; border-radius: 2px;
    background: rgba(184,132,28,0.12);
    border-left: 3px solid #b08d57;
    color: #2a1d12;
  }
  .ev-block .ev-time {
    font-family: "Courier Prime", monospace;
    color: #8a1c1c; font-size: 9px; margin-right: 4px;
  }
  .ev-block.is-conflict {
    background: rgba(138,28,28,0.12);
    border-left-color: #8a1c1c;
  }

  /* 冲突列表 */
  .conflict-item {
    margin-bottom: 10px; padding: 8px 10px;
    border: 1px solid #d4c4b0; border-left-width: 3px;
    border-radius: 2px; background: #fbf6ec;
  }
  .conflict-item.sev-severe  { border-left-color: #8a1c1c; }
  .conflict-item.sev-warning { border-left-color: #b8841c; }
  .conflict-item.sev-hint    { border-left-color: #3a5a7a; }
  .conflict-head {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 4px; font-size: 11px;
  }
  .conflict-badge {
    font-size: 9px; padding: 2px 6px; border-radius: 2px;
    color: #ffffff; font-weight: 900; letter-spacing: 0.05em;
  }
  .badge-severe  { background: #8a1c1c; }
  .badge-warning { background: #b8841c; }
  .badge-hint    { background: #3a5a7a; }
  .conflict-type {
    font-family: "Courier Prime", monospace;
    font-size: 9px; color: #5c4226;
  }
  .conflict-title {
    font-weight: 900; font-size: 12px; color: #1a120b;
    margin-bottom: 3px;
  }
  .conflict-loc {
    font-size: 9px; color: #8a1c1c;
    font-family: "Courier Prime", monospace;
    margin-bottom: 3px;
  }
  .conflict-desc {
    font-size: 10px; color: #2b2118; line-height: 1.6;
  }
  .empty-hint {
    padding: 14px; text-align: center;
    color: #7a5c3a; font-size: 11px;
    border: 1px dashed #d4c4b0; border-radius: 2px;
    margin-bottom: 10px;
  }

  /* 角色时间表 */
  .char-schedule {
    margin-bottom: 10px;
    page-break-inside: avoid;
  }
  .char-schedule h3 {
    font-family: "ZCOOL XiaoWei", serif;
    font-size: 13px; margin: 6px 0 4px;
    padding: 3px 8px; color: #fdf8f0;
    display: inline-block;
  }
  table.char-tbl {
    width: 100%; border-collapse: collapse;
    font-size: 10px; margin-bottom: 4px;
  }
  table.char-tbl th, table.char-tbl td {
    border: 1px solid #d4c4b0; padding: 4px 6px;
  }
  table.char-tbl thead th {
    background: #f0e4d0; color: #5c4226;
    font-family: "Courier Prime", monospace; font-size: 9px;
    text-align: left;
  }

  .footer {
    margin-top: 16px; padding-top: 8px;
    border-top: 1px solid #a88a64;
    text-align: center; font-size: 9px; color: #a88a64;
    font-family: "Courier Prime", monospace;
  }
`;

/** 等待延迟（ms），用于字体/布局就绪 */
const PRINT_READY_DELAY = 400;
/** 打印后清理 iframe 的延迟（ms） */
const CLEANUP_DELAY = 1500;

/** 严重等级 → 中文标签 */
const SEV_LABEL: Record<ConflictSeverity, string> = {
  severe: '严重缺陷',
  warning: '局部警告',
  hint: '优化提示',
};

/** 严重等级 → CSS 后缀 */
const SEV_CSS_SUFFIX: Record<ConflictSeverity, string> = {
  severe: 'severe',
  warning: 'warning',
  hint: 'hint',
};

/** 分钟数转 HH:MM */
function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

/** 格式化校验时间戳 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 转义 HTML 特殊字符，避免注入 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 计算冲突统计 */
function computeStats(conflicts: ConflictItem[]): {
  total: number;
  severe: number;
  warning: number;
  hint: number;
} {
  const stats = { total: conflicts.length, severe: 0, warning: 0, hint: 0 };
  for (const c of conflicts) {
    if (c.severity === 'severe') stats.severe += 1;
    else if (c.severity === 'warning') stats.warning += 1;
    else stats.hint += 1;
  }
  return stats;
}

/** 渲染时间线图（HTML 表格：行=角色，列=时间窗刻度） */
function renderTimelineChart(
  events: TimelineEvent[],
  characters: TimelineReportCharacter[],
  conflictEventIds: Set<string>,
): string {
  if (events.length === 0) {
    return '<div class="empty-hint">◇ 暂无时间线事件</div>';
  }

  // 时间窗：18:00–次日 01:00（与原型一致，跨日 7 小时）
  const startMin = 18 * 60;
  const endMin = 25 * 60;

  const rows = characters
    .map((c) => {
      const evs = events
        .filter((e) => e.characterId === c.id)
        .sort((a, b) => a.startMinutes - b.startMinutes);
      const blocks = evs
        .map((e) => {
          const cls = conflictEventIds.has(e.id) ? 'ev-block is-conflict' : 'ev-block';
          const time = `${escapeHtml(e.startTime)}–${escapeHtml(e.endTime)}`;
          const name = escapeHtml(e.eventName);
          const loc = e.location ? ` · ${escapeHtml(e.location)}` : '';
          return `<span class="${cls}"><span class="ev-time">${time}</span>${name}${loc}</span>`;
        })
        .join('');
      return `<tr><td class="char-cell" style="background:${c.color}">${escapeHtml(c.name)}</td><td class="events-cell">${blocks || '<span style="color:#a88a64">—</span>'}</td></tr>`;
    })
    .join('');

  const head = `<thead><tr><th>角色</th><th>事件流（${toHHMM(startMin)} – ${toHHMM(endMin)}）</th></tr></thead>`;
  return `<table class="tl-chart">${head}<tbody>${rows}</tbody></table>`;
}

/** 渲染冲突列表 */
function renderConflictList(conflicts: ConflictItem[]): string {
  if (conflicts.length === 0) {
    return '<div class="empty-hint">✓ 未检测到时间线冲突，时序结构良好</div>';
  }
  return conflicts
    .map((c) => {
      const sevClass = `sev-${SEV_CSS_SUFFIX[c.severity]}`;
      const badgeClass = `badge-${SEV_CSS_SUFFIX[c.severity]}`;
      const typeLabel = CONFLICT_TYPE_LABELS[c.type];
      return `<div class="conflict-item ${sevClass}">
        <div class="conflict-head">
          <span class="conflict-badge ${badgeClass}">${SEV_LABEL[c.severity]}</span>
          <span class="conflict-type">#${c.index} · ${escapeHtml(typeLabel)}</span>
        </div>
        <div class="conflict-title">${escapeHtml(c.title)}</div>
        <div class="conflict-loc">${escapeHtml(c.loc)}</div>
        <div class="conflict-desc">${escapeHtml(c.desc)}</div>
      </div>`;
    })
    .join('');
}

/** 渲染角色时间表（按角色分组，列出该角色全部事件） */
function renderCharacterSchedule(
  events: TimelineEvent[],
  characters: TimelineReportCharacter[],
): string {
  if (events.length === 0) {
    return '<div class="empty-hint">◇ 暂无角色时间表数据</div>';
  }
  return characters
    .map((c) => {
      const evs = events
        .filter((e) => e.characterId === c.id)
        .sort((a, b) => a.startMinutes - b.startMinutes);
      if (evs.length === 0) return '';
      const rows = evs
        .map((e) => {
          const actLabel = `第${e.actOrder}幕`;
          return `<tr>
            <td>${escapeHtml(e.startTime)}–${escapeHtml(e.endTime)}</td>
            <td>${escapeHtml(e.eventName)}</td>
            <td>${escapeHtml(e.location || '—')}</td>
            <td>${escapeHtml(actLabel)}</td>
          </tr>`;
        })
        .join('');
      return `<div class="char-schedule">
        <h3 style="background:${c.color}">${escapeHtml(c.name)} · 时间表</h3>
        <table class="char-tbl">
          <thead><tr><th>时间</th><th>事件</th><th>地点</th><th>幕次</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join('');
}

/** 通过隐藏 iframe 打印 HTML 字符串 */
function printHtmlViaIframe(docHtml: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    if (iframe.parentNode) document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(docHtml);
  doc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // 忽略打印异常（部分浏览器跨域限制）
    }
    window.setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, CLEANUP_DELAY);
  }, PRINT_READY_DELAY);
}

/**
 * 导出时间线校验报告为 PDF（通过浏览器打印对话框）。
 *
 * 调用方仅需传入 `TimelineReportData`，函数会组装 HTML 并触发打印，
 * 用户在打印对话框中选择"另存为 PDF"即可保存。
 */
export function exportTimelineReportPdf(data: TimelineReportData): void {
  const {
    scriptTitle,
    events,
    conflicts,
    characters,
    validatedAt,
  } = data;

  const stats = computeStats(conflicts);
  const conflictEventIds = new Set(conflicts.flatMap((c) => c.eventIds));

  const titleHtml = `<h1 class="doc-title">${escapeHtml(scriptTitle)} · 时间线校验报告</h1>`;
  const metaHtml = `<div class="page-meta">// NARRLIGHT · TIMELINE VALIDATION · ${formatTime(validatedAt)}</div>`;

  const statsHtml = `<div class="stats-row">
    <div class="stat-box"><div class="stat-label">TOTAL</div><div class="stat-value">${stats.total}</div></div>
    <div class="stat-box"><div class="stat-label">SEVERE</div><div class="stat-value stat-severe">${stats.severe}</div></div>
    <div class="stat-box"><div class="stat-label">WARNING</div><div class="stat-value stat-warning">${stats.warning}</div></div>
    <div class="stat-box"><div class="stat-label">HINT</div><div class="stat-value stat-hint">${stats.hint}</div></div>
    <div class="stat-box"><div class="stat-label">EVENTS</div><div class="stat-value stat-trick">${events.length}</div></div>
  </div>`;

  const chartSection = `<h2 class="section-title">时间线图</h2>${renderTimelineChart(events, characters, conflictEventIds)}`;
  const conflictSection = `<hr class="act-divider" /><h2 class="section-title">冲突列表（${conflicts.length} 条）</h2>${renderConflictList(conflicts)}`;
  const scheduleSection = `<hr class="act-divider" /><h2 class="section-title">角色时间表</h2>${renderCharacterSchedule(events, characters)}`;

  const footerHtml = `<div class="footer">NARRLIGHT · 叙光 · 时间线校验报告 · 共 ${conflicts.length} 条冲突 · ${formatTime(validatedAt)}</div>`;

  const docHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(scriptTitle)} · 时间线校验报告</title><style>${PRINT_STYLES}</style></head><body>${titleHtml}${metaHtml}${statsHtml}${chartSection}${conflictSection}${scheduleSection}${footerHtml}</body></html>`;

  printHtmlViaIframe(docHtml);
}

/** 重新导出标签以便外部使用 */
export { SEVERITY_LABELS, CONFLICT_TYPE_LABELS };
