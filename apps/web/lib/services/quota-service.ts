/**
 * 用户 AI 生成额度检查与扣减服务
 *
 * 基于 users 表的 free_quota_used / free_quota_limit / plan_type 字段，
 * 提供免费额度的检查、扣减与套餐升级能力。
 * 服务端使用，依赖 @/lib/supabase/server 创建带会话的客户端。
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/response";
import type { Json } from "@/lib/supabase/types";

/** 用户额度信息 */
export interface QuotaInfo {
  /** 已使用次数 */
  used: number;
  /** 额度上限 */
  limit: number;
  /** 剩余次数 */
  remaining: number;
  /** 当前套餐类型 */
  planType: "free" | "pro";
}

export interface CreditInfo {
  balance: number;
  monthlyGrant: number;
  planType: "free" | "pro";
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: "grant" | "consume" | "refund" | "adjustment";
  reason: string;
  metadata: Json;
  createdAt: string;
}

interface UserCreditRow {
  balance: number;
  monthly_grant: number;
}

interface CreditTransactionRow {
  id: string;
  amount: number;
  type: CreditTransaction["type"];
  reason: string;
  metadata: Json;
  created_at: string;
}

const PLAN_MONTHLY_GRANT: Record<QuotaInfo["planType"], number> = {
  free: 30,
  pro: 1000,
};

export const GENERATION_CREDIT_COSTS = {
  "story-bible": 10,
  "character-profiles": 10,
  "act-structure": 10,
  "character-script": 15,
  clues: 15,
  "organizer-manual": 15,
  "truth-review": 10,
  "timeline-structure": 10,
} as const;

export type GenerationCreditPhase = keyof typeof GENERATION_CREDIT_COSTS;

/**
 * 用户 AI 生成额度服务
 */
export class QuotaService {
  /**
   * 检查用户是否还有可用额度。
   * pro 套餐始终返回 true；free 套餐在剩余额度大于 0 时返回 true。
   * @param userId 用户 ID
   */
  async checkQuota(userId: string): Promise<boolean> {
    const info = await this.getQuotaInfo(userId);
    if (info.planType === "pro") return true;
    return info.remaining > 0;
  }

  /**
   * 扣减一次免费额度（free_quota_used += 1）。
   * @param userId 用户 ID
   * @throws {ApiError} QUOTA_EXCEEDED 当免费用户额度用尽时抛出 (429)
   * @throws {ApiError} NOT_FOUND 当用户不存在时抛出 (404)
   */
  async deductQuota(userId: string): Promise<void> {
    const supabase = await createClient();
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("free_quota_used, free_quota_limit, plan_type")
      .eq("id", userId)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        throw new ApiError("NOT_FOUND", "用户不存在", 404);
      }
      throw new ApiError("DB_QUERY_ERROR", fetchError.message, 500);
    }
    if (!user) {
      throw new ApiError("NOT_FOUND", "用户不存在", 404);
    }

    if (
      user.plan_type === "free" &&
      user.free_quota_used >= user.free_quota_limit
    ) {
      throw new ApiError("QUOTA_EXCEEDED", "免费额度已用尽", 429);
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        free_quota_used: user.free_quota_used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      throw new ApiError("DB_UPDATE_ERROR", updateError.message, 500);
    }
  }

  /**
   * 获取用户额度详情。
   * @param userId 用户 ID
   */
  async getQuotaInfo(userId: string): Promise<QuotaInfo> {
    const supabase = await createClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("free_quota_used, free_quota_limit, plan_type")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new ApiError("NOT_FOUND", "用户不存在", 404);
      }
      throw new ApiError("DB_QUERY_ERROR", error.message, 500);
    }
    if (!user) {
      throw new ApiError("NOT_FOUND", "用户不存在", 404);
    }

    const used = user.free_quota_used;
    const limit = user.free_quota_limit;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      planType: user.plan_type,
    };
  }

  async getCreditInfo(userId: string): Promise<CreditInfo> {
    const planType = await this.getPlanType(userId);
    const credit = await this.ensureCreditAccount(userId, planType);
    return {
      balance: credit.balance,
      monthlyGrant: credit.monthly_grant,
      planType,
    };
  }

  async getCreditTransactions(userId: string, limit = 20): Promise<CreditTransaction[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("id, amount, type, reason, metadata, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ApiError("DB_QUERY_ERROR", error.message, 500);
    }

    return ((data ?? []) as CreditTransactionRow[]).map((row) => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      reason: row.reason,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  async consumeCredits(
    userId: string,
    amount: number,
    reason: string,
    metadata: Json = {},
  ): Promise<string | null> {
    if (amount <= 0) return null;

    const supabase = this.getBillingWriteClient();
    const planType = await this.getPlanType(userId);
    const credit = await this.ensureCreditAccount(userId, planType);

    if (credit.balance < amount) {
      throw new ApiError("CREDIT_EXCEEDED", "创作点余额不足", 429);
    }

    const nextBalance = credit.balance - amount;
    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        balance: nextBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      throw new ApiError("DB_UPDATE_ERROR", updateError.message, 500);
    }

    const { data: transaction, error: txError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: -amount,
        type: "consume",
        reason,
        metadata,
      })
      .select("id")
      .single();

    if (txError) {
      await supabase
        .from("user_credits")
        .update({
          balance: credit.balance,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      throw new ApiError("DB_INSERT_ERROR", txError.message, 500);
    }

    return (transaction as { id: string }).id;
  }

  async refundCredits(
    userId: string,
    amount: number,
    reason: string,
    metadata: Json = {},
  ): Promise<void> {
    if (amount <= 0) return;

    const supabase = this.getBillingWriteClient();
    const planType = await this.getPlanType(userId);
    const credit = await this.ensureCreditAccount(userId, planType);

    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        balance: credit.balance + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      throw new ApiError("DB_UPDATE_ERROR", updateError.message, 500);
    }

    const { error: txError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount,
        type: "refund",
        reason,
        metadata,
      });

    if (txError) {
      throw new ApiError("DB_INSERT_ERROR", txError.message, 500);
    }
  }

  async grantCredits(
    userId: string,
    amount: number,
    reason: string,
    metadata: Json = {},
  ): Promise<string | null> {
    if (amount <= 0) return null;

    const supabase = this.getBillingWriteClient();
    const planType = await this.getPlanType(userId);
    const credit = await this.ensureCreditAccount(userId, planType);

    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        balance: credit.balance + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      throw new ApiError("DB_UPDATE_ERROR", updateError.message, 500);
    }

    const { data: transaction, error: txError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount,
        type: "grant",
        reason,
        metadata,
      })
      .select("id")
      .single();

    if (txError) {
      await supabase
        .from("user_credits")
        .update({
          balance: credit.balance,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      throw new ApiError("DB_INSERT_ERROR", txError.message, 500);
    }

    return (transaction as { id: string }).id;
  }

  async consumeGenerationPhase(
    userId: string,
    phase: GenerationCreditPhase,
    scriptId: string,
  ): Promise<{ amount: number; transactionId: string | null }> {
    const amount = GENERATION_CREDIT_COSTS[phase];
    const transactionId = await this.consumeCredits(userId, amount, `生成阶段：${phase}`, {
      phase,
      scriptId,
    });
    return { amount, transactionId };
  }

  /**
   * 将用户套餐升级为 pro。
   * @param userId 用户 ID
   */
  async upgradePlan(userId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({
        plan_type: "pro",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      throw new ApiError("DB_UPDATE_ERROR", error.message, 500);
    }

    const credit = await this.ensureCreditAccount(userId, "pro");
    const targetGrant = PLAN_MONTHLY_GRANT.pro;
    if (credit.monthly_grant >= targetGrant) return;

    const billingClient = this.getBillingWriteClient();
    const delta = targetGrant - credit.monthly_grant;
    const { error: creditError } = await billingClient
      .from("user_credits")
      .update({
        balance: credit.balance + delta,
        monthly_grant: targetGrant,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (creditError) {
      throw new ApiError("DB_UPDATE_ERROR", creditError.message, 500);
    }

    const { error: grantError } = await billingClient
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: delta,
        type: "grant",
        reason: "升级专业版补发创作点",
        metadata: { planType: "pro" },
      });

    if (grantError) {
      throw new ApiError("DB_INSERT_ERROR", grantError.message, 500);
    }
  }

  private async getPlanType(userId: string): Promise<QuotaInfo["planType"]> {
    const supabase = this.getBillingWriteClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("plan_type")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new ApiError("NOT_FOUND", "用户不存在", 404);
      }
      throw new ApiError("DB_QUERY_ERROR", error.message, 500);
    }

    return user.plan_type === "pro" ? "pro" : "free";
  }

  private async ensureCreditAccount(
    userId: string,
    planType: QuotaInfo["planType"],
  ): Promise<UserCreditRow> {
    const supabase = this.getBillingWriteClient();
    const { data, error } = await supabase
      .from("user_credits")
      .select("balance, monthly_grant")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new ApiError("DB_QUERY_ERROR", error.message, 500);
    }
    if (data) return data as UserCreditRow;

    const monthlyGrant = PLAN_MONTHLY_GRANT[planType];
    const { data: inserted, error: insertError } = await supabase
      .from("user_credits")
      .insert({
        user_id: userId,
        balance: monthlyGrant,
        monthly_grant: monthlyGrant,
      })
      .select("balance, monthly_grant")
      .single();

    if (insertError) {
      throw new ApiError("DB_INSERT_ERROR", insertError.message, 500);
    }

    const { error: grantError } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: monthlyGrant,
        type: "grant",
        reason: "开发期初始创作点",
        metadata: { planType },
      });

    if (grantError) {
      throw new ApiError("DB_INSERT_ERROR", grantError.message, 500);
    }

    return inserted as UserCreditRow;
  }

  private getBillingWriteClient() {
    return createAdminClient();
  }
}
