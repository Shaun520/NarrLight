/**
 * 用户 AI 生成额度检查与扣减服务
 *
 * 基于 users 表的 free_quota_used / free_quota_limit / plan_type 字段，
 * 提供免费额度的检查、扣减与套餐升级能力。
 * 服务端使用，依赖 @/lib/supabase/server 创建带会话的客户端。
 */

import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/response";

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
  }
}
