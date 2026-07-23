"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_MODULE_TYPES,
  KNOWLEDGE_STAGES,
} from "@narrlight/shared";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENRES = ["hardcore", "emotion", "horror", "funny", "mechanism"] as const;
const DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"] as const;

export async function saveKnowledgeItem(formData: FormData) {
  await requireAdmin();
  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("未配置 Supabase service role，无法保存知识条目。");

  const id = stringValue(formData.get("id"));
  const title = stringValue(formData.get("title"));
  const content = stringValue(formData.get("content"));
  const category = enumValue(formData.get("category"), KNOWLEDGE_CATEGORIES, "structure_rule");
  const moduleType = enumValue(formData.get("moduleType"), KNOWLEDGE_MODULE_TYPES, "case_core");
  const stage = enumValue(formData.get("stage"), KNOWLEDGE_STAGES, "case_core");
  const genre = optionalEnumValue(formData.get("genre"), GENRES);
  const difficulty = optionalEnumValue(formData.get("difficulty"), DIFFICULTIES);
  const playerCountMin = optionalNumber(formData.get("playerCountMin"));
  const playerCountMax = optionalNumber(formData.get("playerCountMax"));
  const weight = Math.max(0, Math.min(1000, optionalNumber(formData.get("weight")) ?? 100));
  const enabled = formData.get("enabled") === "on";

  if (!title || !content) throw new Error("标题和内容必填。");

  const payload = {
    title,
    content,
    category,
    module_type: moduleType,
    stage,
    genre,
    player_count_min: playerCountMin,
    player_count_max: playerCountMax,
    difficulty,
    enabled,
    weight,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const result = id && UUID_PATTERN.test(id)
    ? await supabase.from("knowledge_items").update(payload).eq("id", id)
    : await supabase.from("knowledge_items").insert(payload);

  if (result.error) throw new Error(`保存知识条目失败：${result.error.message}`);

  revalidatePath("/knowledge");
  redirect("/knowledge?saved=1");
}

export async function toggleKnowledgeItem(formData: FormData) {
  await requireAdmin();
  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("未配置 Supabase service role，无法更新知识条目。");

  const id = stringValue(formData.get("id"));
  const enabled = formData.get("enabled") === "true";
  if (!UUID_PATTERN.test(id)) redirect("/knowledge");

  const { error } = await supabase
    .from("knowledge_items")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`更新知识条目失败：${error.message}`);
  revalidatePath("/knowledge");
  redirect("/knowledge");
}

export async function deleteKnowledgeItem(formData: FormData) {
  await requireAdmin();
  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("未配置 Supabase service role，无法删除知识条目。");

  const id = stringValue(formData.get("id"));
  if (!UUID_PATTERN.test(id)) redirect("/knowledge");

  const { error } = await supabase.from("knowledge_items").delete().eq("id", id);
  if (error) throw new Error(`删除知识条目失败：${error.message}`);

  revalidatePath("/knowledge");
  redirect("/knowledge");
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = stringValue(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function enumValue<T extends readonly string[]>(
  value: FormDataEntryValue | null,
  options: T,
  fallback: T[number],
): T[number] {
  const raw = stringValue(value);
  return options.includes(raw) ? raw as T[number] : fallback;
}

function optionalEnumValue<T extends readonly string[]>(value: FormDataEntryValue | null, options: T): T[number] | null {
  const raw = stringValue(value);
  return raw && options.includes(raw) ? raw as T[number] : null;
}
