/**
 * 线索卡 PDF 导出（T172）
 *
 * 基于 @react-pdf/renderer 生成线索卡 PDF：
 *   - 支持批量导出（每页一张线索卡）
 *   - 支持分类打包（按 act / phase 分组，插入分组分隔页）
 *   - 有序命名（act_phase_序号_标题）
 *
 * 字体说明：react-pdf 默认字体不含 CJK 字形，正式环境需通过 Font.register
 * 注册 Noto Serif SC / Special Elite 等字体；本模块保留 Font.register 占位
 * 注释，调用方按需启用。
 *
 * 对齐 FR-014 / FR-015：一键导出可打印 PDF，支持自定义尺寸与版式模板。
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import {
  ACT_LABELS,
  PHASE_LABELS,
  toChineseOrdinal,
  type Clue,
  type ClueAct,
  type CluePhase,
} from '@/components/clue-card/clue-card';
import {
  CLUE_CARD_SIZES,
  getTemplate,
  type ClueCardTemplate,
} from './clue-card-templates';

// ===== 字体注册（占位，正式环境取消注释并提供字体 URL） =====
// 正式启用 CJK 字体渲染时，从 '@react-pdf/renderer' 导入 Font 并调用：
// Font.register({ family: 'Noto Serif SC', src: '/fonts/NotoSerifSC-Regular.ttf' });
// Font.register({ family: 'Special Elite', src: '/fonts/SpecialElite.ttf' });
// 默认 react-pdf 字体不含 CJK 字形，导出中文需先注册上述字体。

/** 导出分组方式 */
export type PdfGroupBy = 'act' | 'phase' | 'none';

/** PDF 导出选项 */
export interface CluePdfExportOptions {
  /** 版式模板（默认 ink · A6） */
  template?: ClueCardTemplate;
  /** 分组方式，默认 none */
  groupBy?: PdfGroupBy;
  /** 剧本名（用于文件名） */
  scriptTitle?: string;
}

/** 导出结果 */
export interface CluePdfExportResult {
  /** PDF 二进制 */
  blob: Blob;
  /** 推荐文件名 */
  filename: string;
  /** 已导出线索数量 */
  count: number;
}

/** 幕次排序权重 */
const ACT_ORDER: Record<ClueAct, number> = { act1: 0, act2: 1, act3: 2, truth: 3 };
/** 环节排序权重 */
const PHASE_ORDER: Record<CluePhase, number> = { public: 0, private: 1, key: 2, trap: 3 };

/** 风格对应的纯色背景（react-pdf 不支持 CSS 渐变，用纯色近似） */
const SOLID_BG: Record<string, string> = {
  ink: '#f3e9db',
  film: '#25211c',
  hand: '#fdf8f0',
  mini: '#fafafa',
};

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    padding: 0,
  },
  card: {
    position: 'relative',
    height: '100%',
    padding: 18,
    borderWidth: 1,
  },
  corner: {
    position: 'absolute',
    top: 10,
    right: 12,
    fontSize: 22,
    fontWeight: 700,
    color: '#8a1c1c',
  },
  tag: {
    fontSize: 11,
    padding: 2,
    marginBottom: 12,
    letterSpacing: 0.5,
    alignSelf: 'flex-start',
  },
  body: {
    flex: 1,
    marginTop: 18,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 6,
  },
  text: {
    fontSize: 13,
    lineHeight: 1.7,
  },
  foot: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#999',
    fontSize: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionPage: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 2,
    color: '#8a1c1c',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: 900,
    color: '#1a120b',
  },
});

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

/** 分组键 */
function groupKey(clue: Clue, groupBy: PdfGroupBy): string {
  if (groupBy === 'act') return ACT_LABELS[clue.act];
  if (groupBy === 'phase') return PHASE_LABELS[clue.phase];
  return '';
}

interface PdfCardPageProps {
  clue: Clue;
  template: ClueCardTemplate;
  index: number;
}

/** 单张线索卡 PDF 页 */
function PdfCardPage({ clue, template, index }: PdfCardPageProps) {
  const bg = SOLID_BG[template.style] ?? '#f3e9db';
  const isDark = template.style === 'film';
  const corner = clue.corner ?? toChineseOrdinal(index + 1);
  const size = CLUE_CARD_SIZES[template.size];

  return (
    <Page
      size={[size.widthIn, size.heightIn]}
      style={{ ...styles.page, backgroundColor: bg }}
    >
      <View
        style={{
          ...styles.card,
          borderColor: isDark ? 'rgba(200,180,150,0.4)' : 'rgba(122,92,58,0.4)',
        }}
      >
        {template.showCorner && (
          <Text style={{ ...styles.corner, color: isDark ? '#c9a56a' : '#8a1c1c' }}>
            {corner}
          </Text>
        )}
        {template.showTag && (
          <Text
            style={{
              ...styles.tag,
              color: isDark ? '#e8e0d0' : '#2b2118',
            }}
          >
            {clue.tag}
          </Text>
        )}
        <View style={styles.body}>
          <Text style={{ ...styles.title, color: template.color }}>{clue.title}</Text>
          <Text style={{ ...styles.text, color: template.color }}>{clue.text}</Text>
        </View>
        {template.showFoot && (
          <View
            style={{
              ...styles.foot,
              borderTopColor: isDark ? 'rgba(200,180,150,0.3)' : 'rgba(0,0,0,0.2)',
            }}
          >
            <Text style={{ color: isDark ? '#c9b8a4' : '#5c4226' }}>{clue.code}</Text>
            <Text style={{ color: isDark ? '#c9b8a4' : '#5c4226' }}>{clue.location}</Text>
          </View>
        )}
      </View>
    </Page>
  );
}

/** 分组分隔页 */
function PdfSectionPage({ title }: { title: string }) {
  return (
    <Page size={[CLUE_CARD_SIZES.A6.widthIn, CLUE_CARD_SIZES.A6.heightIn]} style={styles.sectionPage}>
      <Text style={styles.sectionLabel}>SECTION</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </Page>
  );
}

/**
 * 导出线索卡为 PDF（批量、可分类打包、有序命名）。
 * @param clues    待导出线索
 * @param options  导出选项
 * @returns { blob, filename, count }
 */
export async function exportCluesToPdf(
  clues: Clue[],
  options: CluePdfExportOptions = {},
): Promise<CluePdfExportResult> {
  const template: ClueCardTemplate = options.template ?? getTemplate('ink', 'A6');
  const groupBy: PdfGroupBy = options.groupBy ?? 'none';
  const ordered = orderClues(clues);

  if (ordered.length === 0) {
    throw new Error('无可导出的线索卡');
  }

  const pages: ReactElement[] = [];
  if (groupBy === 'none') {
    ordered.forEach((clue, i) =>
      pages.push(<PdfCardPage key={clue.id} clue={clue} template={template} index={i} />),
    );
  } else {
    let currentGroup = '';
    ordered.forEach((clue, i) => {
      const g = groupKey(clue, groupBy);
      if (g !== currentGroup) {
        currentGroup = g;
        pages.push(<PdfSectionPage key={`sec-${g}`} title={g} />);
      }
      pages.push(<PdfCardPage key={clue.id} clue={clue} template={template} index={i} />);
    });
  }

  const doc = <Document>{pages}</Document>;
  const blob = await pdf(doc).toBlob();
  const filename = buildFilename(ordered, options);

  return { blob, filename, count: ordered.length };
}

/** 生成有序文件名 */
function buildFilename(clues: Clue[], options: CluePdfExportOptions): string {
  const script = options.scriptTitle ? `${options.scriptTitle}_` : '';
  const groupPart = options.groupBy && options.groupBy !== 'none' ? `${options.groupBy}_` : '';
  return `${script}线索卡_${groupPart}${clues.length}张.pdf`;
}

/**
 * 触发浏览器下载 PDF。
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


