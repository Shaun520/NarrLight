/**
 * 关系图谱导出（T182）
 *
 * 支持将关系图导出为 PNG / PDF，分辨率可选 1080p / 2K / 4K。
 *
 * 实现方案：
 *   - PNG：使用 html-to-image 的 toPng，按 resolution 配置 pixelRatio 缩放
 *   - PDF：将 PNG 数据 URL 嵌入隐藏 iframe，调用浏览器原生打印对话框
 *         （与 editor-pdf-export.ts 一致的方案，保留古风排版）
 *
 * 所有导出函数均在浏览器端执行（client-only），不会在 SSR 中调用。
 */

/** 导出分辨率档位 */
export type ExportResolution = '1080p' | '2K' | '4K';

/** 分辨率 → 像素比映射（基于设备像素，1x=96dpi 基线） */
const RESOLUTION_PIXEL_RATIO: Record<ExportResolution, number> = {
  '1080p': 2,
  '2K': 3,
  '4K': 4,
};

/** 分辨率 → 标称 DPI（用于 PDF 嵌入元数据） */
const RESOLUTION_DPI: Record<ExportResolution, number> = {
  '1080p': 144,
  '2K': 216,
  '4K': 288,
};

/** 导出选项 */
export interface RelationExportOptions {
  /** 分辨率 */
  resolution?: ExportResolution;
  /** 文件名（不含扩展名） */
  filename?: string;
  /** 背景色（默认深色，与关系图一致） */
  backgroundColor?: string;
  /** 标题（用于 PDF 页眉） */
  title?: string;
  /** 副标题 / 元信息（用于 PDF 页脚） */
  subtitle?: string;
}

/** 默认背景色：与关系图容器一致 */
const DEFAULT_BG = '#25211c';

/** 等待延迟（ms），用于字体 / 布局就绪 */
const RENDER_READY_DELAY = 350;
/** 打印后清理 iframe 的延迟（ms） */
const CLEANUP_DELAY = 1500;

/**
 * 动态加载 html-to-image，避免 SSR 引入。
 */
async function loadHtmlToImage(): Promise<{
  toPng: (el: HTMLElement, opts: Record<string, unknown>) => Promise<string>;
  toBlob: (el: HTMLElement, opts: Record<string, unknown>) => Promise<Blob>;
}> {
  const mod = await import('html-to-image');
  return mod as unknown as {
    toPng: (el: HTMLElement, opts: Record<string, unknown>) => Promise<string>;
    toBlob: (el: HTMLElement, opts: Record<string, unknown>) => Promise<Blob>;
  };
}

/**
 * 解析导出选项，填充默认值。
 */
function resolveOptions(options: RelationExportOptions | undefined) {
  const resolution = options?.resolution ?? '1080p';
  return {
    resolution,
    pixelRatio: RESOLUTION_PIXEL_RATIO[resolution],
    dpi: RESOLUTION_DPI[resolution],
    filename: options?.filename ?? `relation-graph-${Date.now()}`,
    backgroundColor: options?.backgroundColor ?? DEFAULT_BG,
    title: options?.title ?? '人物关系图谱',
    subtitle: options?.subtitle ?? '',
  };
}

/**
 * 等待字体与布局就绪。
 */
function waitForReady(delay = RENDER_READY_DELAY): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * 触发浏览器下载（基于 data URL）。
 */
function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 内部：生成关系图 PNG 的 data URL（不触发下载）。
 */
async function generatePngDataUrl(
  element: HTMLElement,
  options?: RelationExportOptions,
): Promise<{ dataUrl: string; filename: string; opts: ReturnType<typeof resolveOptions> }> {
  const opts = resolveOptions(options);
  const htmlToImage = await loadHtmlToImage();

  await waitForReady();

  const dataUrl = await htmlToImage.toPng(element, {
    pixelRatio: opts.pixelRatio,
    backgroundColor: opts.backgroundColor,
    cacheBust: true,
    // 过滤掉 tooltip / 控件按钮等非图形元素
    filter: (node: Node) => {
      if (!(node instanceof HTMLElement)) return true;
      // 跳过 .rel-toolbar / .side-panel 等非图区域
      const cls = node.className ?? '';
      if (typeof cls === 'string' && cls.includes('rel-toolbar')) return false;
      if (typeof cls === 'string' && cls.includes('side-panel')) return false;
      return true;
    },
  });

  return { dataUrl, filename: opts.filename, opts };
}

/**
 * 导出关系图为 PNG。
 *
 * @param element 关系图容器 DOM 元素
 * @param options 导出选项
 */
export async function exportRelationGraphPng(
  element: HTMLElement,
  options?: RelationExportOptions,
): Promise<string> {
  const { dataUrl, filename } = await generatePngDataUrl(element, options);
  triggerDownload(dataUrl, `${filename}.png`);
  return dataUrl;
}

/**
 * 导出关系图为 PDF。
 *
 * 通过隐藏 iframe 嵌入 PNG 数据 URL，调用浏览器原生打印对话框，
 * 用户可在对话框中选择"另存为 PDF"。
 *
 * @param element 关系图容器 DOM 元素
 * @param options 导出选项
 */
export async function exportRelationGraphPdf(
  element: HTMLElement,
  options?: RelationExportOptions,
): Promise<void> {
  const { dataUrl, opts } = await generatePngDataUrl(element, options);

  // 构造打印文档
  const printDoc = buildPrintDocument({
    title: opts.title,
    subtitle: opts.subtitle,
    imageDataUrl: dataUrl,
    dpi: opts.dpi,
    resolution: opts.resolution,
  });

  printHtmlViaIframe(printDoc);
}

/**
 * 构造打印 HTML 文档：标题 + 关系图 PNG + 页脚元信息。
 */
function buildPrintDocument(params: {
  title: string;
  subtitle: string;
  imageDataUrl: string;
  dpi: number;
  resolution: ExportResolution;
}): string {
  const { title, subtitle, imageDataUrl, dpi, resolution } = params;
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Noto Serif SC", "Songti SC", serif;
      color: #2a1d12;
      background: #fdf8f0;
      margin: 0;
      padding: 12px 8px;
    }
    .doc-head {
      text-align: center;
      border-bottom: 2px solid #8a1c1c;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .doc-head h1 {
      font-size: 22px;
      color: #8a1c1c;
      letter-spacing: 0.15em;
      margin: 0 0 6px;
    }
    .doc-head .meta {
      font-family: "Courier Prime", monospace;
      font-size: 11px;
      color: #7a5c3a;
      letter-spacing: 0.1em;
    }
    .graph-wrap {
      text-align: center;
      page-break-inside: avoid;
    }
    .graph-wrap img {
      max-width: 100%;
      border: 1px solid rgba(122,92,58,0.3);
      box-shadow: 0 2px 8px rgba(26,18,11,0.15);
    }
    .legend {
      margin-top: 14px;
      display: flex;
      justify-content: center;
      gap: 24px;
      font-family: "Courier Prime", monospace;
      font-size: 11px;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-swatch {
      display: inline-block;
      width: 24px;
      height: 0;
      border-top-width: 2px;
      border-top-style: solid;
    }
    .foot {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px dashed rgba(122,92,58,0.3);
      font-family: "Courier Prime", monospace;
      font-size: 10.5px;
      color: #7a5c3a;
      text-align: center;
      letter-spacing: 0.06em;
    }
  </style>
</head>
<body>
  <div class="doc-head">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(subtitle || '明暗双线可视化')} · ${escapeHtml(resolution)} · ${dpi}dpi</div>
  </div>
  <div class="graph-wrap">
    <img src="${imageDataUrl}" alt="${escapeHtml(title)}" />
  </div>
  <div class="legend">
    <div class="legend-item">
      <span class="legend-swatch" style="border-top-color:#b08d57;"></span>
      <span style="color:#b08d57;">明线 · 玩家可见</span>
    </div>
    <div class="legend-item">
      <span class="legend-swatch" style="border-top-color:#8a1c1c; border-top-style:dashed;"></span>
      <span style="color:#8a1c1c;">暗线 · 真相复盘</span>
    </div>
  </div>
  <div class="foot">叙光 NARRLIGHT · 导出于 ${timestamp}</div>
</body>
</html>`;
}

/**
 * HTML 转义，避免标题 / 副标题中的特殊字符破坏文档结构。
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 通过隐藏 iframe 打印 HTML 字符串。
 * 与 editor-pdf-export.ts 中的方案保持一致。
 */
function printHtmlViaIframe(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document ?? iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // 等待图片加载完成后再触发打印
  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // ignore
      }
    }, CLEANUP_DELAY);
  };

  // 等待图片加载
  const img = doc.querySelector('img');
  if (img) {
    if (img.complete) {
      setTimeout(triggerPrint, 100);
    } else {
      img.addEventListener('load', () => setTimeout(triggerPrint, 100));
      img.addEventListener('error', () => setTimeout(triggerPrint, 100));
      // 兜底：3 秒后强制打印
      setTimeout(triggerPrint, 3000);
    }
  } else {
    setTimeout(triggerPrint, 100);
  }
}

/**
 * 默认导出：便捷方法，根据文件类型分发。
 */
export default async function exportRelationGraph(
  element: HTMLElement,
  format: 'png' | 'pdf',
  options?: RelationExportOptions,
): Promise<void> {
  if (format === 'png') {
    await exportRelationGraphPng(element, options);
  } else {
    await exportRelationGraphPdf(element, options);
  }
}
