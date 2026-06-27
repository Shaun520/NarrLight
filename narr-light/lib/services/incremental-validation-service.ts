/**
 * 增量复检服务（T160）
 *
 * 全量校验成本较高（调 AI），剧本/线索局部修改后只需校验变更区域。
 *
 *   1. revalidate(scriptId, changedAreas) 仅校验变更区域：
 *        - 解析变更区域 → 受影响 issue id（基于 location 模糊匹配）；
 *        - 对受影响 issue 重新跑校验（调 AI）；
 *        - 返回新旧合并结果。
 *   2. mergeResults(oldResults, newResults) 合并新旧结果：
 *        - 新结果覆盖旧结果中同 id 的条目；
 *        - 不在变更区域的旧条目保留；
 *        - 已"排除"的条目不重新校验。
 *
 * 变更区域 changedAreas 由上层（编辑器 / 线索管理页）上报，
 * 形如：{ module: 'editor'|'clues'|'truth', actIndex?, clueId?, characterName? }。
 */
import type { AiValidationIssue, AiNarrativeTrick } from '@/lib/ai/prompts/logic-validation';
import type { ValidationIssue } from '@/lib/validation/logic/issue-classifier';

/** 变更区域描述 */
export interface ChangedArea {
  /** 模块 */
  module: 'editor' | 'clues' | 'truth';
  /** 幕次序号（editor / truth 有效） */
  actIndex?: number;
  /** 段落序号 */
  paragraphIndex?: number;
  /** 线索号（clues 有效） */
  clueId?: string;
  /** 角色名（editor 有效） */
  characterName?: string;
}

/** 校验结果集合 */
export interface ValidationResultSet {
  issues: AiValidationIssue[];
  tricks: AiNarrativeTrick[];
  /** 已排除的 id 集合 */
  excludedIds: string[];
  /** 已标记为叙诡的 issue id 集合 */
  markedTrickIds: string[];
  /** 校验时间戳 */
  validatedAt: number;
}

/** AI 增量校验函数签名（由上层注入） */
export type IncrementalValidateFn = (
  scriptId: string,
  areas: ChangedArea[],
) => Promise<{ issues: AiValidationIssue[]; tricks: AiNarrativeTrick[] }>;

/**
 * 增量复检服务。
 *
 * 不直接调 AI，由上层注入 incrementalValidateFn。
 */
export class IncrementalValidationService {
  private validateFn: IncrementalValidateFn | null = null;

  /** 注入增量校验函数 */
  setValidateFn(fn: IncrementalValidateFn): void {
    this.validateFn = fn;
  }

  /**
   * 仅校验变更区域。
   *
   * 流程：
   *   1. 从旧结果中筛出"位置命中变更区域"的 issue（受影响集）；
   *   2. 调 AI 仅校验这些区域，得到新结果；
   *   3. 调用 mergeResults 合并；
   *   4. 返回合并后的结果集。
   *
   * 若未注入 validateFn，则只做受影响集筛选 + 直接返回旧结果（dry run）。
   */
  async revalidate(
    scriptId: string,
    changedAreas: ChangedArea[],
    oldResults: ValidationResultSet,
  ): Promise<ValidationResultSet> {
    // 1. 没有变更直接返回旧结果
    if (changedAreas.length === 0) return oldResults;

    // 2. 受影响 issue id（位置模糊匹配）
    const affectedIssueIds = this.findAffectedIssues(oldResults.issues, changedAreas);

    // 3. 调 AI 增量校验
    if (!this.validateFn) {
      // dry run：仅打标，不实际校验
      return {
        ...oldResults,
        validatedAt: Date.now(),
      };
    }

    const fresh = await this.validateFn(scriptId, changedAreas);

    // 4. 合并：新结果覆盖受影响 issue，未受影响的保留
    const merged = this.mergeResults(oldResults, fresh, affectedIssueIds);
    return merged;
  }

  /**
   * 合并新旧结果。
   *
   * 策略：
   *   - newResults 中 id 命中 affectedIds 的条目，替换 oldResults 同 id 条目；
   *   - newResults 中新增 id 直接加入；
   *   - oldResults 中"未受影响"的条目保留；
   *   - excludedIds / markedTrickIds 沿用 oldResults（作者标记不丢失）；
   *   - tricks 同样以 id 去重合并。
   */
  mergeResults(
    oldResults: ValidationResultSet,
    newResults: { issues: AiValidationIssue[]; tricks: AiNarrativeTrick[] },
    affectedIds?: string[],
  ): ValidationResultSet {
    const affectedSet = new Set(affectedIds ?? newResults.issues.map((i) => i.id));

    // 旧 issue 中不受影响的保留
    const keptOldIssues = oldResults.issues.filter((i) => !affectedSet.has(i.id));
    // 新 issue 覆盖受影响的
    const mergedIssues = [...keptOldIssues, ...newResults.issues];

    // tricks 按 id 去重（新优先）
    const trickIds = new Set(newResults.tricks.map((t) => t.id));
    const keptOldTricks = oldResults.tricks.filter((t) => !trickIds.has(t.id));
    const mergedTricks = [...keptOldTricks, ...newResults.tricks];

    return {
      issues: mergedIssues,
      tricks: mergedTricks,
      excludedIds: oldResults.excludedIds.slice(),
      markedTrickIds: oldResults.markedTrickIds.slice(),
      validatedAt: Date.now(),
    };
  }

  /**
   * 找出位置命中变更区域的旧 issue id。
   * 使用宽松匹配：location 文本包含 actIndex / clueId / characterName 任一关键字的视为命中。
   */
  findAffectedIssues(
    issues: AiValidationIssue[],
    areas: ChangedArea[],
  ): string[] {
    const keywords: string[] = [];
    for (const a of areas) {
      if (a.actIndex) {
        keywords.push(this.actLabel(a.actIndex));
      }
      if (a.clueId) keywords.push(`#${a.clueId}`);
      if (a.characterName) keywords.push(a.characterName);
      if (a.module === 'truth') keywords.push('真相复盘');
    }

    if (keywords.length === 0) return issues.map((i) => i.id);

    const affected: string[] = [];
    for (const issue of issues) {
      if (keywords.some((kw) => issue.location.includes(kw))) {
        affected.push(issue.id);
      }
    }
    return affected;
  }

  /** 幕次序号 → 中文幕次标签 */
  private actLabel(actIndex: number): string {
    const map = ['', '第一幕', '第二幕', '第三幕', '第四幕', '第五幕'];
    return map[actIndex] ?? `第${actIndex}幕`;
  }
}

/** 默认单例 */
export const incrementalValidationService = new IncrementalValidationService();

/**
 * 兼容原型"增量复检"按钮：返回新旧结果合并后的扁平 issue 列表。
 * 用于 UI 一次拿到最新漏洞集合。
 */
export function flattenResultSet(
  resultSet: ValidationResultSet,
  markedTrickIds: string[],
  excludedIds: string[],
): ValidationIssue[] {
  const markedSet = new Set(markedTrickIds);
  const excludedSet = new Set(excludedIds);
  const out: ValidationIssue[] = [];

  for (const is of resultSet.issues) {
    if (excludedSet.has(is.id)) continue;
    const isMarked = markedSet.has(is.id);
    out.push({
      id: is.id,
      severity: isMarked ? 'NARRATIVE_TRICK' : is.severity,
      type: isMarked ? '叙诡' : is.type,
      title: is.title,
      description: is.description,
      location: is.location,
      suggestion: is.suggestion,
      autoFixable: is.autoFixable,
      isMarkedAsTrick: isMarked,
      isExcluded: false,
    });
  }

  return out;
}
