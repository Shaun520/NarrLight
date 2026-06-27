/**
 * 叙诡识别与手动标记排除（T153）
 *
 * 职责：
 *   1. detect(scriptData)        调用 AI 识别叙诡（时间 / 身份 / 视角）；
 *   2. markAsTrick(issueId)      把漏洞列表中某条"看似漏洞"的条目标记为叙诡，
 *                                后续不再误判为漏洞；
 *   3. excludeFromValidation(id) 把某条问题（漏洞或叙诡）从校验中彻底排除。
 *
 * 维护两类持久化集合：
 *   - markedTrickIds：作者主动声明"这是设计性叙诡，不是漏洞"的 issue id；
 *   - excludedIds：   作者彻底忽略的 issue / trick id。
 *
 * 该 detector 不直接调 AI，而是接收已识别的 tricks 列表，便于上层（service）
 * 决定调用方式与缓存策略。AI 调用见 buildNarrativeTrickPrompt。
 */
import type { AiNarrativeTrick, ScriptValidationData } from '@/lib/ai/prompts/logic-validation';

/** 叙诡类型别名（与 AiNarrativeTrick.type 对齐） */
export type NarrativeTrickType = 'TIME' | 'IDENTITY' | 'PERSPECTIVE';

/** 识别后的叙诡条目（携带标记状态，供前端渲染） */
export interface DetectedTrick extends AiNarrativeTrick {
  /** 是否被作者手动确认 / 标记 */
  isConfirmed: boolean;
  /** 是否被作者从校验中排除 */
  isExcluded: boolean;
}

/** 标记操作结果 */
export interface MarkResult {
  ok: boolean;
  /** 当前标记集合（用于回写到上层 store） */
  markedTrickIds: string[];
}

/** 排除操作结果 */
export interface ExcludeResult {
  ok: boolean;
  excludedIds: string[];
}

/**
 * 叙诡识别器。
 *
 * 单实例维护当前剧本的标记 / 排除状态，按 scriptId 隔离。
 */
export class NarrativeTrickDetector {
  private markedTrickIds = new Set<string>();
  private excludedIds = new Set<string>();
  private detectedTricks: DetectedTrick[] = [];

  /**
   * 识别叙诡。本方法不直接调 AI，而是接收上层（service / route）调用
   * buildNarrativeTrickPrompt 后解析得到的 tricks 列表。
   *
   * 同一 issue id 重复调用会以最新结果覆盖。
   */
  detect(
    _scriptData: ScriptValidationData,
    aiTricks: AiNarrativeTrick[],
  ): DetectedTrick[] {
    // 保留作者已确认 / 已排除的状态
    const prevById = new Map(this.detectedTricks.map((t) => [t.id, t]));
    this.detectedTricks = aiTricks.map((t) => {
      const prev = prevById.get(t.id);
      return {
        ...t,
        isConfirmed: prev?.isConfirmed ?? false,
        isExcluded: prev?.isExcluded ?? this.excludedIds.has(t.id),
      };
    });
    return this.listConfirmed();
  }

  /** 列出当前识别到的叙诡（不含已排除） */
  listConfirmed(): DetectedTrick[] {
    return this.detectedTricks.filter((t) => !t.isExcluded);
  }

  /** 列出所有识别到的叙诡（含已排除，用于"恢复"操作） */
  listAll(): DetectedTrick[] {
    return this.detectedTricks.slice();
  }

  /**
   * 标记某条 issue 为叙诡。
   * 用于把"伏笔未回收"等漏洞中实为叙诡设计的条目剥离出漏洞列表。
   */
  markAsTrick(issueId: string): MarkResult {
    this.markedTrickIds.add(issueId);
    // 若该 id 对应一条已识别的 trick，则同步确认
    const trick = this.detectedTricks.find((t) => t.id === issueId);
    if (trick) trick.isConfirmed = true;
    return { ok: true, markedTrickIds: Array.from(this.markedTrickIds) };
  }

  /** 取消"标记为叙诡" */
  unmarkTrick(issueId: string): MarkResult {
    this.markedTrickIds.delete(issueId);
    const trick = this.detectedTricks.find((t) => t.id === issueId);
    if (trick) trick.isConfirmed = false;
    return { ok: true, markedTrickIds: Array.from(this.markedTrickIds) };
  }

  /** 当前已标记为叙诡的 issue id 列表（供 IssueClassifier.classify 使用） */
  getMarkedTrickIds(): string[] {
    return Array.from(this.markedTrickIds);
  }

  /**
   * 从校验中彻底排除（既不算漏洞，也不算叙诡）。
   * 适用于作者明确表示"忽略此条"的场景。
   */
  excludeFromValidation(id: string): ExcludeResult {
    this.excludedIds.add(id);
    const trick = this.detectedTricks.find((t) => t.id === id);
    if (trick) trick.isExcluded = true;
    return { ok: true, excludedIds: Array.from(this.excludedIds) };
  }

  /** 恢复（取消排除） */
  restore(id: string): ExcludeResult {
    this.excludedIds.delete(id);
    const trick = this.detectedTricks.find((t) => t.id === id);
    if (trick) trick.isExcluded = false;
    return { ok: true, excludedIds: Array.from(this.excludedIds) };
  }

  /** 当前已排除的 id 列表 */
  getExcludedIds(): string[] {
    return Array.from(this.excludedIds);
  }

  /** 按类型聚合（用于右侧叙诡识别卡渲染） */
  groupByType(): Record<NarrativeTrickType, DetectedTrick[]> {
    const groups: Record<NarrativeTrickType, DetectedTrick[]> = {
      TIME: [],
      IDENTITY: [],
      PERSPECTIVE: [],
    };
    for (const t of this.listConfirmed()) {
      groups[t.type].push(t);
    }
    return groups;
  }
}

/** 默认单例（按 scriptId 使用时建议 new 一个新实例） */
export const narrativeTrickDetector = new NarrativeTrickDetector();
