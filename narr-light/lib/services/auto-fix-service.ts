/**
 * 一键按建议修复服务（T159）
 *
 * 职责：
 *   1. fix(issueId)        按漏洞建议自动修正对应段落；
 *   2. fixBatch(issueIds)  批量修复；
 *   3. applySuggestion(issue) 应用单条建议。
 *
 * 实现说明：
 *   - 本服务为状态机：维护 issueId → patch 映射，供 UI 显示修复进度；
 *   - 实际"改写"动作需调用 AI 改写接口（沿用 lib/ai/prompts），
 *     本服务只负责编排与结果合并；AI 调用入口由上层 route 注入；
 *   - 服务端可由 route handler 实例化后调用；前端通过 hook 消费。
 */
import type { ValidationIssue } from '@/lib/validation/logic/issue-classifier';

/** 单条修复 patch（应用于原文段落） */
export interface FixPatch {
  /** 对应 issueId */
  issueId: string;
  /** 修复前文本（用于 diff 展示） */
  before: string;
  /** 修复后文本 */
  after: string;
  /** 修复位置（与 issue.location 对齐） */
  location: string;
  /** 修复时间戳 */
  appliedAt: number;
}

/** 修复结果 */
export interface FixResult {
  issueId: string;
  ok: boolean;
  patch?: FixPatch;
  error?: string;
}

/** 批量修复结果 */
export interface BatchFixResult {
  results: FixResult[];
  successCount: number;
  failedCount: number;
}

/** AI 改写函数签名（由上层注入，避免服务层直接耦合 provider） */
export type RewriteFn = (
  issue: ValidationIssue,
) => Promise<{ after: string; before: string } | null>;

/**
 * 一键按建议修复服务。
 *
 * 单实例维护修复历史，供前端展示"已修复"状态与回滚。
 */
export class AutoFixService {
  private patches = new Map<string, FixPatch>();
  private fixingIds = new Set<string>();
  private rewriteFn: RewriteFn | null = null;

  /** 注入 AI 改写函数 */
  setRewriteFn(fn: RewriteFn): void {
    this.rewriteFn = fn;
  }

  /** 当前修复中的 issue id（用于按钮 loading） */
  isFixing(issueId: string): boolean {
    return this.fixingIds.has(issueId);
  }

  /** 是否已修复 */
  isFixed(issueId: string): boolean {
    return this.patches.has(issueId);
  }

  /** 取修复 patch */
  getPatch(issueId: string): FixPatch | undefined {
    return this.patches.get(issueId);
  }

  /** 所有修复历史 */
  listPatches(): FixPatch[] {
    return Array.from(this.patches.values()).sort((a, b) => b.appliedAt - a.appliedAt);
  }

  /**
   * 应用单条建议。
   * 默认使用 rewriteFn；若未注入则按 suggestion 文本生成简单 patch。
   */
  async applySuggestion(issue: ValidationIssue): Promise<FixResult> {
    if (!issue.autoFixable) {
      return { issueId: issue.id, ok: false, error: '该漏洞不可自动修复' };
    }
    if (this.fixingIds.has(issue.id)) {
      return { issueId: issue.id, ok: false, error: '正在修复中，请勿重复提交' };
    }

    this.fixingIds.add(issue.id);
    try {
      let after: string;
      let before: string;

      if (this.rewriteFn) {
        const rewritten = await this.rewriteFn(issue);
        if (!rewritten) {
          return { issueId: issue.id, ok: false, error: 'AI 改写未返回结果' };
        }
        after = rewritten.after;
        before = rewritten.before;
      } else {
        // 无 AI 时退化为"在原位置追加建议"的占位 patch
        before = `（原段落：${issue.location}）`;
        after = `${issue.suggestion ?? ''}`;
      }

      const patch: FixPatch = {
        issueId: issue.id,
        before,
        after,
        location: issue.location,
        appliedAt: Date.now(),
      };
      this.patches.set(issue.id, patch);
      return { issueId: issue.id, ok: true, patch };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { issueId: issue.id, ok: false, error: msg };
    } finally {
      this.fixingIds.delete(issue.id);
    }
  }

  /** 单条修复（applySuggestion 的语义别名） */
  async fix(issueId: string, issue?: ValidationIssue): Promise<FixResult> {
    if (!issue) {
      return { issueId, ok: false, error: '缺少 issue 上下文' };
    }
    return this.applySuggestion(issue);
  }

  /** 批量修复 */
  async fixBatch(issues: ValidationIssue[]): Promise<BatchFixResult> {
    const results: FixResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // 串行执行避免 AI 限流
    for (const issue of issues) {
      const r = await this.applySuggestion(issue);
      results.push(r);
      if (r.ok) successCount += 1;
      else failedCount += 1;
    }

    return { results, successCount, failedCount };
  }

  /** 回滚某条修复 */
  rollback(issueId: string): boolean {
    return this.patches.delete(issueId);
  }

  /** 清空所有修复历史 */
  clear(): void {
    this.patches.clear();
    this.fixingIds.clear();
  }
}

/** 默认单例 */
export const autoFixService = new AutoFixService();
