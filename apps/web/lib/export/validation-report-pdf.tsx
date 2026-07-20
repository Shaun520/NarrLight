/**
 * 校验报告 PDF 导出（T161）
 *
 * 使用 @react-pdf/renderer 生成校验报告，内容包含：
 *   1. 报告头：剧本标题 + 校验时间 + 综合等级；
 *   2. 分级统计：CRITICAL / WARNING / SUGGESTION / NARRATIVE_TRICK 计数；
 *   3. 漏洞列表：每条含 severity 徽章 / type / 标题 / 位置 / 描述 / 建议；
 *   4. 难度评估：5 维度分数 + 综合评分 + 评估说明。
 *
 * 导出方式：
 *   - renderToStream：服务端流式输出（route handler 使用）；
 *   - renderToFile：服务端落盘；
 *   - renderToBlob：客户端下载（需配合 pdf blob url）。
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { ValidationIssue } from '@/lib/validation/logic/issue-classifier';
import type { DifficultyAssessment } from '@/lib/validation/difficulty/assessor';

/** 报告元信息 */
export interface ReportMeta {
  scriptId: string;
  title: string;
  author: string;
  validatedAt: number;
}

/** 报告入参 */
export interface ValidationReportProps {
  meta: ReportMeta;
  issues: ValidationIssue[];
  assessment: DifficultyAssessment;
}

// 等级颜色（PDF 中以 hex 使用，不含 var()）
const SEVERITY_COLOR: Record<ValidationIssue['severity'], string> = {
  CRITICAL: '#8a1c1c',
  WARNING: '#b8841c',
  SUGGESTION: '#3a5a7a',
  NARRATIVE_TRICK: '#6a4a8a',
};

const SEVERITY_LABEL: Record<ValidationIssue['severity'], string> = {
  CRITICAL: '严重缺陷',
  WARNING: '局部警告',
  SUGGESTION: '优化提示',
  NARRATIVE_TRICK: '叙诡识别',
};

// 注册中文字体（PDF 默认不含中文）
// 注：若部署环境无此字体，可改为不注册并使用英文 + 拼音降级。
// 此处保持注释，避免在生产环境未配置字体时报错。
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a120b',
    backgroundColor: '#fdf8f0',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#8a1c1c',
    paddingBottom: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#8a1c1c',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#5c4226',
    fontFamily: 'Courier',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#8a1c1c',
    marginTop: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#a88a64',
    paddingBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: '#a88a64',
    borderRadius: 2,
    backgroundColor: '#f3e9db',
  },
  statLabel: {
    fontSize: 8,
    color: '#5c4226',
    fontFamily: 'Courier',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  issue: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#d4c4b0',
    borderLeftWidth: 3,
    borderRadius: 2,
  },
  issueHead: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  badge: {
    fontSize: 8,
    padding: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },
  issueType: {
    fontSize: 8,
    color: '#5c4226',
    fontFamily: 'Courier',
  },
  issueTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  issueLoc: {
    fontSize: 8,
    color: '#8a1c1c',
    marginBottom: 3,
    fontFamily: 'Courier',
  },
  issueDesc: {
    fontSize: 9,
    color: '#2b2118',
    marginBottom: 4,
    lineHeight: 1.5,
  },
  issueSuggest: {
    fontSize: 9,
    color: '#4a7c59',
    backgroundColor: 'rgba(74,124,89,0.1)',
    padding: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#4a7c59',
  },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    marginBottom: 2,
  },
  diffScore: {
    fontFamily: 'Helvetica-Bold',
    color: '#b08d57',
  },
  note: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#a88a64',
    fontSize: 8,
    color: '#5c4226',
    lineHeight: 1.6,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#a88a64',
    textAlign: 'center',
    fontFamily: 'Courier',
  },
});

/** 分级统计 */
function countBySeverity(issues: ValidationIssue[]): Record<ValidationIssue['severity'], number> {
  const c: Record<ValidationIssue['severity'], number> = {
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0,
    NARRATIVE_TRICK: 0,
  };
  for (const i of issues) c[i.severity] += 1;
  return c;
}

/** 格式化时间 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 校验报告 PDF 文档 */
export function ValidationReportDocument({ meta, issues, assessment }: ValidationReportProps) {
  const counts = countBySeverity(issues);
  const validIssues = issues.filter((i) => i.severity !== 'NARRATIVE_TRICK');

  return (
    <Document title={`逻辑校验报告 - ${meta.title}`} author={meta.author}>
      <Page size="A4" style={styles.page}>
        {/* 报告头 */}
        <View style={styles.header} fixed>
          <Text style={styles.title}>逻辑闭环校验报告</Text>
          <Text style={styles.subtitle}>
            {meta.title} · 作者 {meta.author} · 校验时间 {formatTime(meta.validatedAt)}
          </Text>
        </View>

        {/* 分级统计 */}
        <Text style={styles.sectionTitle}>分级统计</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>CRITICAL</Text>
            <Text style={[styles.statValue, { color: SEVERITY_COLOR.CRITICAL }]}>
              {counts.CRITICAL}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>WARNING</Text>
            <Text style={[styles.statValue, { color: SEVERITY_COLOR.WARNING }]}>
              {counts.WARNING}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SUGGESTION</Text>
            <Text style={[styles.statValue, { color: SEVERITY_COLOR.SUGGESTION }]}>
              {counts.SUGGESTION}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>NARRATIVE_TRICK</Text>
            <Text style={[styles.statValue, { color: SEVERITY_COLOR.NARRATIVE_TRICK }]}>
              {counts.NARRATIVE_TRICK}
            </Text>
          </View>
        </View>

        {/* 漏洞列表 */}
        <Text style={styles.sectionTitle}>漏洞列表（{validIssues.length} 条）</Text>
        {validIssues.map((issue) => (
          <View
            key={issue.id}
            style={[styles.issue, { borderLeftColor: SEVERITY_COLOR[issue.severity] }]}
          >
            <View style={styles.issueHead}>
              <Text style={[styles.badge, { backgroundColor: SEVERITY_COLOR[issue.severity] }]}>
                {SEVERITY_LABEL[issue.severity]}
              </Text>
              <Text style={styles.issueType}>{issue.type}</Text>
            </View>
            <Text style={styles.issueTitle}>{issue.title}</Text>
            <Text style={styles.issueLoc}>▸ {issue.location}</Text>
            <Text style={styles.issueDesc}>{issue.description}</Text>
            {issue.suggestion ? (
              <Text style={styles.issueSuggest}>优化建议：{issue.suggestion}</Text>
            ) : null}
          </View>
        ))}

        {/* 难度评估 */}
        <Text style={styles.sectionTitle} break>
          难度评估
        </Text>
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#b08d57' }}>
            {assessment.overallLevel} · 综合 {assessment.overallScore.toFixed(1)} / 10
          </Text>
        </View>
        {assessment.dimensions.map((dim) => (
          <View key={dim.name} style={styles.diffRow}>
            <Text>{dim.name}（权重 {dim.weight}）</Text>
            <Text style={styles.diffScore}>{dim.score.toFixed(1)}</Text>
          </View>
        ))}
        <View style={styles.note}>
          <Text>EVALUATION NOTE</Text>
          <Text>{assessment.note}</Text>
        </View>

        <Text style={styles.footer} fixed>
          NARRLIGHT · 叙光 · 逻辑闭环校验报告 · 第 {issues.length} 条记录 ·{' '}
          {formatTime(meta.validatedAt)}
        </Text>
      </Page>
    </Document>
  );
}

/**
 * 服务端流式导出 PDF（route handler 使用）。
 *
 * 用法：
 *   import { renderToStream } from '@react-pdf/renderer';
 *   const stream = await renderToStream(<ValidationReportDocument {...} />);
 */
export { ValidationReportDocument as default };
