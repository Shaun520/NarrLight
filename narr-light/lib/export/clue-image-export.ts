/**
 * 线索卡图片导出与 ZIP 打包（T173）
 *
 * 基于 html-to-image 将线索卡 DOM 节点导出为 PNG：
 *   - 单卡导出 exportClueCardToImage
 *   - 批量导出 exportCluesToImages（有序命名 + 分类分组）
 *   - ZIP 打包 downloadImagesAsZip（动态加载 jszip；未安装时降级为逐张下载）
 *
 * 对齐 FR-014 / FR-015：批量生成、顺序规范、清晰度高、按分类自动打包、有序命名。
 */
import { toPng } from 'html-to-image';
import {
  ACT_LABELS,
  PHASE_LABELS,
  type Clue,
  type ClueAct,
  type CluePhase,
} from '@/components/clue-card/clue-card';

/** 导出分组方式 */
export type ImageGroupBy = 'act' | 'phase' | 'none';

/** html-to-image 选项类型（该库未导出 Options，用 Parameters 推断） */
type HtmlToImageOptions = NonNullable<Parameters<typeof toPng>[1]>;

/** 已导出的图片条目 */
export interface ExportedImage {
  /** 文件名（含扩展名） */
  filename: string;
  /** PNG dataURL */
  dataUrl: string;
  /** 所属分组（用于 ZIP 内子目录） */
  group: string;
  /** 源线索 */
  clue: Clue;
}

/** 图片导出选项 */
export interface ClueImageExportOptions {
  /** 像素倍率，默认 2 */
  pixelRatio?: number;
  /** 分组方式，默认 none */
  groupBy?: ImageGroupBy;
  /** 剧本名（用于命名） */
  scriptTitle?: string;
}

/** 幕次排序权重 */
const ACT_ORDER: Record<ClueAct, number> = { act1: 0, act2: 1, act3: 2, truth: 3 };
/** 环节排序权重 */
const PHASE_ORDER: Record<CluePhase, number> = { public: 0, private: 1, key: 2, trap: 3 };

/** 按幕次+环节+编号排序 */
function orderClues(clues: Clue[]): Clue[] {
  return [...clues].sort((a, b) => {
    const da = ACT_ORDER[a.act] - ACT_ORDER[b.act];
    if (da !== 0) return da;
    const dp = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    if (dp !== 0) return dp;
    return a.code.localeCompare(b.code, 'zh');
  });
}

/** 文件名安全化：去除非法字符 */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/** 分组键 */
function groupKey(clue: Clue, groupBy: ImageGroupBy): string {
  if (groupBy === 'act') return ACT_LABELS[clue.act];
  if (groupBy === 'phase') return PHASE_LABELS[clue.phase];
  return '线索卡';
}

/** 生成有序文件名：序号_编号_标题.png */
function buildFilename(clue: Clue, index: number, options: ClueImageExportOptions): string {
  const script = options.scriptTitle ? `${safeName(options.scriptTitle)}_` : '';
  const seq = String(index + 1).padStart(2, '0');
  return `${script}${seq}_${clue.code.replace('#', '')}_${safeName(clue.title)}.png`;
}

/**
 * 导出单个 DOM 节点为 PNG dataURL。
 * @param node    线索卡 DOM 节点
 * @param options html-to-image 选项
 */
export async function exportClueCardToImage(
  node: HTMLElement,
  options?: HtmlToImageOptions,
): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    ...options,
  });
}

/**
 * 批量导出线索卡为 PNG。
 * 按顺序逐张导出（避免并发引发字体/图片加载竞争），并返回有序命名条目。
 *
 * @param nodes    线索卡 DOM 节点列表（与 clues 一一对应）
 * @param clues    线索数据列表（与 nodes 一一对应）
 * @param options  导出选项
 */
export async function exportCluesToImages(
  nodes: HTMLElement[],
  clues: Clue[],
  options: ClueImageExportOptions = {},
): Promise<ExportedImage[]> {
  if (nodes.length !== clues.length) {
    throw new Error('节点数与线索数不一致');
  }
  const ordered = orderClues(clues);
  // 按 ordered 顺序重排节点（通过 data-clue-id 对齐）
  const nodeMap = new Map<string, HTMLElement>();
  nodes.forEach((n) => {
    const id = n.getAttribute('data-clue-id');
    if (id) nodeMap.set(id, n);
  });

  const results: ExportedImage[] = [];
  const pixelRatio = options.pixelRatio ?? 2;
  for (let i = 0; i < ordered.length; i += 1) {
    const clue = ordered[i];
    const node = nodeMap.get(clue.id);
    if (!node) continue;
    // 临时移除 selected/hover 影响：导出前确保节点可见
    const dataUrl = await toPng(node, { pixelRatio, cacheBust: true });
    results.push({
      filename: buildFilename(clue, i, options),
      dataUrl,
      group: groupKey(clue, options.groupBy ?? 'none'),
      clue,
    });
  }
  return results;
}

/**
 * 触发浏览器下载单张图片。
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 将 JSZip 实例类型抽象为最小可用接口（避免引入类型依赖）。
 */
interface JsZipLike {
  folder(name: string): JsZipLike;
  file(name: string, data: string, opts?: { base64: boolean }): unknown;
  generateAsync(opts: { type: 'blob' }): Promise<Blob>;
}

/**
 * 动态加载 jszip（可选依赖）。未安装时返回 null，调用方走降级分支。
 * 使用 string 类型 specifier 避免 TS 静态解析报错。
 */
async function loadJsZip(): Promise<JsZipLike | null> {
  try {
    const specifier: string = 'jszip';
    const mod = (await import(specifier)) as { default: JsZipLike };
    return mod.default;
  } catch {
    return null;
  }
}

/** dataURL → base64 内容 */
function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

/**
 * 将已导出的图片打包为 ZIP 并触发下载。
 * 若 jszip 未安装，降级为逐张下载。
 *
 * @param images   已导出图片列表
 * @param zipName  ZIP 文件名
 */
export async function downloadImagesAsZip(
  images: ExportedImage[],
  zipName: string,
): Promise<{ zipped: boolean }> {
  const jszip = await loadJsZip();
  if (!jszip) {
    // 降级：逐张下载
    for (const img of images) {
      downloadDataUrl(img.dataUrl, img.filename);
    }
    return { zipped: false };
  }

  // 按分组创建子目录，有序命名
  for (const img of images) {
    const folder = jszip.folder(safeName(img.group));
    folder?.file(img.filename, dataUrlToBase64(img.dataUrl), { base64: true });
  }
  const blob = await jszip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { zipped: true };
}
