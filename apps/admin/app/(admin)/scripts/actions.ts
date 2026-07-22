"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function deleteAdminScripts(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("未配置 Supabase service role，无法删除剧本数据。");
  }

  const deleteMode = String(formData.get("deleteMode") ?? "bulk");
  const returnTo = normalizeReturnTo(String(formData.get("returnTo") ?? "/scripts"));
  const scriptIds = resolveScriptIds(formData, deleteMode);

  if (scriptIds.length === 0) {
    redirect(returnTo);
  }

  const { data: previousScripts, error: readError } = await supabase
    .from("scripts")
    .select("id,title,author_id,status,word_count,updated_at")
    .in("id", scriptIds);

  if (readError) {
    throw new Error(`读取待删除剧本失败：${readError.message}`);
  }

  if (!previousScripts || previousScripts.length === 0) {
    redirect(returnTo);
  }

  const idsToDelete = previousScripts.map((script) => script.id);
  const { error: deleteError } = await supabase.from("scripts").delete().in("id", idsToDelete);

  if (deleteError) {
    throw new Error(`删除剧本失败：${deleteError.message}`);
  }

  const requestHeaders = await headers();
  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    admin_id: admin.id,
    action: idsToDelete.length > 1 ? "scripts.bulk_delete" : "script.delete",
    target_type: "script",
    target_id: idsToDelete.length === 1 ? idsToDelete[0] : null,
    payload: {
      deleted_count: idsToDelete.length,
      deleted_scripts: previousScripts,
      cascade: "scripts foreign keys with ON DELETE CASCADE",
    },
    reason: idsToDelete.length > 1 ? "后台批量删除剧本" : "后台删除剧本",
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: requestHeaders.get("user-agent"),
    created_at: new Date().toISOString(),
  });

  if (auditError) {
    console.warn(`[scripts] 审计日志写入失败：${auditError.message}`);
  }

  revalidatePath("/scripts");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
  redirect(returnTo);
}

function resolveScriptIds(formData: FormData, deleteMode: string) {
  if (deleteMode.startsWith("single:")) {
    return normalizeScriptIds([deleteMode.slice("single:".length)]);
  }

  return normalizeScriptIds(formData.getAll("scriptIds").map(String));
}

function normalizeScriptIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => UUID_PATTERN.test(value)))].slice(0, 100);
}

function normalizeReturnTo(value: string) {
  return value.startsWith("/scripts") ? value : "/scripts";
}
