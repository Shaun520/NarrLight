/**
 * 编辑器 PDF 导出（隐藏 iframe 打印方案）
 *
 * 严格对齐 docs/prototype/workbench2.html downloadPdf() 函数（6489-6985 行）。
 * 通过创建隐藏 iframe 写入打印文档，调用浏览器原生打印对话框，
 * 用户可在对话框中选择"另存为 PDF"。
 *
 * 保留古风排版：朱砂标题、❖ 分隔符、首字下沉、段落缩进。
 */

/** 导出选项 */
export interface ExportPdfOptions {
  /** 文档主标题，默认 "剧本" */
  title?: string;
  /** 自定义附加样式（与默认古风样式合并） */
  extraStyles?: string;
}

/** 默认古风打印样式（对齐原型 printStyles） */
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
    margin: 0 0 22px;
    letter-spacing: 0.15em;
  }
  .act-section { page-break-inside: avoid; margin-bottom: 8px; }
  .act-section h2 {
    font-size: 19px; font-weight: 900; color: #1a120b;
    display: flex; align-items: center; gap: 10px;
    margin: 4px 0 8px; padding-bottom: 8px;
    border-bottom: 1px solid rgba(122,92,58,0.3);
  }
  .act-section h2 .act-num {
    color: #fdf8f0; background: #8a1c1c;
    font-size: 12px; padding: 2px 10px; border-radius: 2px;
  }
  .page-meta {
    font-size: 11px; color: #7a5c3a;
    letter-spacing: 0.1em; margin: -2px 0 14px;
  }
  .act-divider {
    border: none; text-align: center; margin: 24px 0;
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
  p {
    margin: 0 0 12px; text-indent: 2em;
    text-align: justify; line-height: 1.9; font-size: 14px;
  }
  .act-section p:first-of-type { text-indent: 0; }
  .act-section p:first-of-type::first-letter {
    font-family: "ZCOOL XiaoWei", "Noto Serif SC", serif;
    font-size: 2.1em; font-weight: 900; color: #8a1c1c;
    float: left; line-height: 0.95; margin: 5px 8px 0 0;
    padding: 2px 4px;
  }
  .highlight { background: rgba(184,132,28,0.2); border-bottom: 2px solid #b8841c; padding: 1px 2px; }
  .sub-h {
    font-family: "ZCOOL XiaoWei", serif;
    font-size: 16px; color: #8a1c1c;
    margin: 18px 0 8px;
    border-bottom: 1px dashed rgba(138,28,28,0.3);
    padding-bottom: 4px;
  }
  .ai-suggest {
    background: rgba(58,90,122,0.08);
    border-left: 3px solid #3a5a7a;
    padding: 10px 14px; margin: 12px 0;
    font-size: 13px; color: #2a1d12; border-radius: 0 3px 3px 0;
  }
`;

/** 等待延迟（ms），用于字体/布局就绪 */
const PRINT_READY_DELAY = 400;
/** 打印后清理 iframe 的延迟（ms） */
const CLEANUP_DELAY = 1500;

/**
 * 通过隐藏 iframe 打印 HTML 字符串。
 * 内部辅助函数，不直接对外暴露。
 */
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
 * 导出编辑器内容为 PDF（通过浏览器打印对话框）
 *
 * @param innerHtml 编辑器内容 HTML（#editorContent 的 innerHTML）
 * @param options   导出选项
 */
export function exportEditorPdf(
  innerHtml: string,
  options: ExportPdfOptions = {},
): void {
  if (!innerHtml || !innerHtml.trim()) return;

  const title = options.title ?? '剧本';
  const styles = options.extraStyles
    ? `${PRINT_STYLES}\n${options.extraStyles}`
    : PRINT_STYLES;

  const docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${styles}</style></head><body><h1 class="doc-title">${title}</h1>${innerHtml}</body></html>`;

  printHtmlViaIframe(docHtml);
}
