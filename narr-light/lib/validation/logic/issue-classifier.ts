/**
 * 漏洞严重等级分类与筛选（T152）
 *
 * 与原型 workbench2.html #view-logic 的 4 级 tab 对齐：
 *   - CRITICAL        严重缺陷  红  .sev-err / .s-err
 *   - WARNING         局部警告  橙  .sev-warn / .s-warn
 *   - SUGGESTION      优化提示  蓝  .sev-info / .s-info
 *   - NARRATIVE_TRICK 叙诡识别  紫  （从漏洞中剥离的设计性诡计）
 *
 * 提供 classify / filter / countBySeverity 三个能力，供页面 tab 渲染与列表筛选使用。
 */
import type { AiValidationIssue, AiNarrativeTrick } from '@/lib/ai/prompts/logic-validation';

/** 严重等级（4 级） */
export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'NARRATIVE_TRICK';

/** 展示用的漏洞项（合并 trick 后统一字段） */
export interface ValidationIssue {
  id: string;
  /** 严重等级 */
  severity: IssueSeverity;
  /** 类型标签，如 "伏笔未回收" / "身份叙诡" */
  type: string;
  /** 标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 位置 */
  location: string;
  /** 优化建议（叙诡项可为空） */
  suggestion?: string;
  /** 是否可一键修复 */
  autoFixable: boolean;
  /** 是否被手动标记为叙诡 */
  isMarkedAsTrick: boolean;
  /** 是否被作者排除（不再算作漏洞） */
  isExcluded: boolean;
  /** 叙诡子类型（仅 severity=NARRATIVE_TRICK 时有效） */
  trickType?: 'TIME' | 'IDENTITY' | 'PERSPECTIVE';
}

/** 按等级分组的漏洞集合 */
export interface GroupedIssues {
  CRITICAL: ValidationIssue[];
  WARNING: ValidationIssue[];
  SUGGESTION: ValidationIssue[];
  NARRATIVE_TRICK: ValidationIssue[];
}

/** 等级中文标签（对齐原型 tab 文字） */
export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  CRITICAL: '严重缺陷',
  WARNING: '局部警告',
  SUGGESTION: '优化提示',
  NARRATIVE_TRICK: '叙诡识别',
};

/** 等级对应的 CSS class 后缀（对齐原型 .sev-err/.sev-warn/.sev-info） */
export const SEVERITY_CSS: Record<IssueSeverity, string> = {
  CRITICAL: 'sev-err',
  WARNING: 'sev-warn',
  SUGGESTION: 'sev-info',
  NARRATIVE_TRICK: 'sev-trick',
};

/** 等级对应的 sev 徽章 class（.s-err/.s-warn/.s-info） */
export const SEVERITY_BADGE_CSS: Record<IssueSeverity, string> = {
  CRITICAL: 's-err',
  WARNING: 's-warn',
  SUGGESTION: 's-info',
  NARRATIVE_TRICK: 's-trick',
};

/** 叙诡子类型中文标签 */
export const TRICK_TYPE_LABEL: Record<'TIME' | 'IDENTITY' | 'PERSPECTIVE', string> = {
  TIME: '时间叙诡',
  IDENTITY: '身份叙诡',
  PERSPECTIVE: '视角叙诡',
};

/**
 * 漏洞分类器：按 severity 分组、筛选、计数。
 *
 * 单例工具类，无状态；可由 IssueClassifier.default() 取实例。
 */
export class IssueClassifier {
  /**
   * 将 AI 返回的 issues + tricks 合并、补全默认字段后按等级分组。
   * 调用方传入已标记/排除的 id 集合，用于状态持久化。
   */
  classify(
    issues: AiValidationIssue[],
    tricks: AiNarrativeTrick[],
    markedTrickIds: string[] = [],
    excludedIds: string[] = [],
  ): GroupedIssues {
    const markedSet = new Set(markedTrickIds);
    const excludedSet = new Set(excludedIds);

    const result: GroupedIssues = {
      CRITICAL: [],
      WARNING: [],
      SUGGESTION: [],
      NARRATIVE_TRICK: [],
    };

    // 1. 普通漏洞：被标记为叙诡的进入 NARRATIVE_TRICK，被排除的丢弃
    for (const is of issues) {
      if (excludedSet.has(is.id)) continue;
      const isMarkedAsTrick = markedSet.has(is.id);
      const issue: ValidationIssue = {
        id: is.id,
        severity: isMarkedAsTrick ? 'NARRATIVE_TRICK' : is.severity,
        type: isMarkedAsTrick ? '叙诡' : is.type,
        title: is.title,
        description: is.description,
        location: is.location,
        suggestion: is.suggestion,
        autoFixable: is.autoFixable,
        isMarkedAsTrick,
        isExcluded: false,
      };
      result[issue.severity].push(issue);
    }

    // 2. 设计性叙诡：直接进入 NARRATIVE_TRICK
    for (const tr of tricks) {
      if (excludedSet.has(tr.id)) continue;
      result.NARRATIVE_TRICK.push({
        id: tr.id,
        severity: 'NARRATIVE_TRICK',
        type: TRICK_TYPE_LABEL[tr.type],
        title: tr.description,
        description: tr.description,
        location: tr.location,
        autoFixable: false,
        isMarkedAsTrick: true,
        isExcluded: false,
        trickType: tr.type,
      });
    }

    return result;
  }

  /** 按等级筛选（NARRATIVE_TRICK 视为独立分组，不与漏洞合并） */
  filter(issues: ValidationIssue[], severity: IssueSeverity): ValidationIssue[] {
    return issues.filter((i) => i.severity === severity);
  }

  /** 各等级计数（用于 tab 上的 .count 徽章） */
  countBySeverity(issues: ValidationIssue[]): Record<IssueSeverity, number> {
    const counts: Record<IssueSeverity, number> = {
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
      NARRATIVE_TRICK: 0,
    };
    for (const i of issues) {
      counts[i.severity] += 1;
    }
    return counts;
  }

  /** 从分组结果扁平化为数组 */
  flatten(grouped: GroupedIssues): ValidationIssue[] {
    return [
      ...grouped.CRITICAL,
      ...grouped.WARNING,
      ...grouped.SUGGESTION,
      ...grouped.NARRATIVE_TRICK,
    ];
  }
}

/** 默认单例 */
export const issueClassifier = new IssueClassifier();
