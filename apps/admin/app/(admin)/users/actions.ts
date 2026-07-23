"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function toggleUserBanStatus(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("未配置 Supabase service role，无法更新用户状态。");
  }

  const userId = String(formData.get("userId") ?? "");
  const nextIsBanned = String(formData.get("nextIsBanned")) === "true";
  const returnTo = String(formData.get("returnTo") ?? "/users");

  if (!userId) {
    throw new Error("缺少用户 ID。");
  }

  const { data: previousUser } = await supabase
    .from("users")
    .select("id,email,nickname,is_banned,banned_at,banned_reason,banned_by")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("users")
    .update({
      is_banned: nextIsBanned,
      banned_at: nextIsBanned ? new Date().toISOString() : null,
      banned_reason: nextIsBanned ? "后台手动封禁" : null,
      banned_by: nextIsBanned ? admin.username : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`更新用户状态失败：${error.message}`);
  }

  const requestHeaders = await headers();
  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    admin_id: admin.id,
    action: nextIsBanned ? "user.ban" : "user.unban",
    target_type: "user",
    target_id: userId,
    payload: {
      before: previousUser ?? null,
      after: {
        is_banned: nextIsBanned,
        banned_reason: nextIsBanned ? "后台手动封禁" : null,
        banned_by: nextIsBanned ? admin.username : null,
      },
    },
    reason: nextIsBanned ? "后台手动封禁" : "后台手动启用",
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: requestHeaders.get("user-agent"),
    created_at: new Date().toISOString(),
  });

  if (auditError) {
    console.warn(`[users] 审计日志写入失败：${auditError.message}`);
  }

  revalidatePath("/users");
  revalidatePath("/audit");
  redirect(returnTo.startsWith("/users") ? returnTo : "/users");
}

export async function adjustUserCredits(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("未配置 Supabase service role，无法调整创作点。");
  }

  const userId = String(formData.get("userId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/users");
  const mode = String(formData.get("mode") ?? "grant");
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) {
    throw new Error("缺少用户 ID。");
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("创作点必须是大于等于 0 的整数。");
  }
  if (!reason) {
    throw new Error("请填写调整原因。");
  }
  if (mode !== "grant" && mode !== "deduct" && mode !== "set") {
    throw new Error("不支持的创作点调整方式。");
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id,email,nickname,plan_type")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) {
    throw new Error(`读取用户失败：${userError?.message ?? "用户不存在"}`);
  }

  const { data: currentCredit, error: creditError } = await supabase
    .from("user_credits")
    .select("balance,monthly_grant")
    .eq("user_id", userId)
    .maybeSingle();

  if (creditError) {
    throw new Error(`读取创作点失败：${creditError.message}`);
  }

  const beforeBalance = currentCredit?.balance ?? 0;
  const monthlyGrant = currentCredit?.monthly_grant ?? (user.plan_type === "pro" ? 1000 : 30);
  const nextBalance =
    mode === "set" ? amount : mode === "deduct" ? Math.max(0, beforeBalance - amount) : beforeBalance + amount;
  const delta = nextBalance - beforeBalance;
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase.from("user_credits").upsert(
    {
      user_id: userId,
      balance: nextBalance,
      monthly_grant: monthlyGrant,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    throw new Error(`更新创作点失败：${upsertError.message}`);
  }

  const { error: txError } = await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: delta,
    type: "adjustment",
    reason,
    metadata: {
      mode,
      beforeBalance,
      nextBalance,
      adminId: admin.id,
      adminUsername: admin.username,
    },
  });

  if (txError) {
    throw new Error(`写入创作点流水失败：${txError.message}`);
  }

  const requestHeaders = await headers();
  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    admin_id: admin.id,
    action: "user.credit_adjust",
    target_type: "user",
    target_id: userId,
    payload: {
      user: {
        email: user.email,
        nickname: user.nickname,
      },
      before: { balance: beforeBalance },
      after: { balance: nextBalance },
      delta,
      mode,
    },
    reason,
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: requestHeaders.get("user-agent"),
    created_at: now,
  });

  if (auditError) {
    console.warn(`[users] 审计日志写入失败：${auditError.message}`);
  }

  revalidatePath("/users");
  revalidatePath("/audit");
  redirect(returnTo.startsWith("/users") ? returnTo : "/users");
}
