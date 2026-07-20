/**
 * 线索卡版式模板配置（T171）
 *
 * 定义线索卡导出版式：A5 / A6 / 自定义尺寸，以及 4 种风格模板参数
 * （ink 水墨古风 / film 胶片暗调 / hand 手写便签 / mini 极简白卡）。
 *
 * 供 clue-pdf-export.tsx 与 clue-image-export.tsx 共用，确保 PDF 与图片导出
 * 版式一致、元素不缺失（FR-014 / FR-015）。
 */
import type { ClueCardStyle } from '@/components/clue-card/clue-card';

/** 卡片尺寸预设 */
export type ClueCardSize = 'A5' | 'A6' | 'custom';

/** 尺寸（单位 px，导出图片用；PDF 由 inch 换算） */
export interface ClueCardSizePreset {
  /** 尺寸标识 */
  id: ClueCardSize;
  /** 展示名 */
  label: string;
  /** 宽 px */
  width: number;
  /** 高 px */
  height: number;
  /** 对应 PDF 尺寸（inch） */
  widthIn: number;
  heightIn: number;
}

/** 卡片版式模板参数 */
export interface ClueCardTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名 */
  name: string;
  /** 视觉风格 */
  style: ClueCardStyle;
  /** 尺寸预设 */
  size: ClueCardSize;
  /** 内边距 px */
  padding: number;
  /** 圆角 px */
  borderRadius: number;
  /** 是否展示大写汉字序号 */
  showCorner: boolean;
  /** 是否展示标签 */
  showTag: boolean;
  /** 是否展示编号 / 位置页脚 */
  showFoot: boolean;
  /** 字体族 */
  fontFamily: string;
  /** 背景样式（CSS background 简写） */
  background: string;
  /** 文字颜色 */
  color: string;
  /** 边框颜色 */
  border: string;
  /** 阴影（CSS box-shadow） */
  boxShadow: string;
}

/** 尺寸预设（对齐打印常用规格） */
export const CLUE_CARD_SIZES: Record<ClueCardSize, ClueCardSizePreset> = {
  A5: { id: 'A5', label: 'A5 (148×210mm)', width: 440, height: 620, widthIn: 5.83, heightIn: 8.27 },
  A6: { id: 'A6', label: 'A6 (105×148mm)', width: 310, height: 440, widthIn: 4.13, heightIn: 5.83 },
  custom: { id: 'custom', label: '自定义', width: 360, height: 480, widthIn: 4.5, heightIn: 6 },
};

/** 4 种风格的背景 / 字体 / 边框 / 阴影参数（对齐原型 CSS 2426-2454 行） */
const STYLE_PARAMS: Record<
  ClueCardStyle,
  Pick<ClueCardTemplate, 'fontFamily' | 'background' | 'color' | 'border' | 'boxShadow' | 'borderRadius'>
> = {
  ink: {
    fontFamily: '"Noto Serif SC", serif',
    background:
      'radial-gradient(circle at 85% 12%, rgba(26,18,11,0.1) 0%, transparent 45%), linear-gradient(135deg, #f3e9db 0%, #e6d3c0 100%)',
    color: '#2b2118',
    border: '1px solid rgba(122,92,58,0.28)',
    boxShadow: '0 8px 20px rgba(60,30,10,0.18), inset 0 0 22px rgba(122,92,58,0.06)',
    borderRadius: 2,
  },
  film: {
    fontFamily: '"Special Elite", monospace',
    background: 'linear-gradient(135deg, #25211c 0%, #1a1713 100%)',
    color: '#e8e0d0',
    border: '1px solid rgba(200,180,150,0.22)',
    boxShadow: '0 8px 22px rgba(0,0,0,0.4), inset 0 0 24px rgba(0,0,0,0.3)',
    borderRadius: 2,
  },
  hand: {
    fontFamily: '"ZCOOL XiaoWei", "Ma Shan Zheng", serif',
    background:
      'radial-gradient(circle at 20% 80%, rgba(122,92,58,0.1) 0%, transparent 50%), linear-gradient(135deg, #fdf8f0 0%, #f5efe3 100%)',
    color: '#5a4632',
    border: '1px solid rgba(122,92,58,0.22)',
    boxShadow: '0 7px 18px rgba(0,0,0,0.12)',
    borderRadius: 2,
  },
  mini: {
    fontFamily: '"PingFang SC", "Helvetica Neue", sans-serif',
    background: '#fafafa',
    color: '#2b2118',
    border: '1px solid #e0e0e0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    borderRadius: 2,
  },
};

/** 默认模板：4 种风格 × A6 尺寸 */
export const CLUE_CARD_TEMPLATES: ClueCardTemplate[] = (
  ['ink', 'film', 'hand', 'mini'] as ClueCardStyle[]
).map((style) => ({
  id: `${style}-a6`,
  name: `${STYLE_PARAMS[style].fontFamily.includes('Noto') ? '水墨古风' : style === 'film' ? '胶片暗调' : style === 'hand' ? '手写便签' : '极简白卡'} · A6`,
  style,
  size: 'A6',
  padding: 18,
  showCorner: true,
  showTag: true,
  showFoot: true,
  ...STYLE_PARAMS[style],
}));

/**
 * 按风格 + 尺寸取模板（尺寸为 custom 时保留风格默认尺寸参数）。
 */
export function getTemplate(
  style: ClueCardStyle,
  size: ClueCardSize = 'A6',
): ClueCardTemplate {
  const params = STYLE_PARAMS[style];
  return {
    id: `${style}-${size}`,
    name: `${style.toUpperCase()} · ${CLUE_CARD_SIZES[size].label}`,
    style,
    size,
    padding: 18,
    showCorner: true,
    showTag: true,
    showFoot: true,
    ...params,
  };
}

/** 默认模板（ink · A6） */
export const DEFAULT_CLUE_CARD_TEMPLATE = getTemplate('ink', 'A6');
