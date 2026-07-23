import "server-only";

import type { KnowledgeCategory, KnowledgeModuleType, KnowledgeStage } from "@narrlight/shared";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type KnowledgeItemRow = {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  moduleType: KnowledgeModuleType;
  stage: KnowledgeStage;
  genre: string | null;
  playerCountMin: number | null;
  playerCountMax: number | null;
  difficulty: string | null;
  enabled: boolean;
  weight: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeUsageRow = {
  id: string;
  scriptId: string | null;
  knowledgeItemId: string;
  knowledgeTitle: string;
  stage: string;
  moduleType: string;
  usageReason: string;
  createdAt: string;
};

export type QualityReportRow = {
  id: string;
  scriptId: string | null;
  stage: string;
  moduleType: string;
  score: number;
  riskLevel: string;
  rewriteRequired: boolean;
  issues: unknown;
  createdAt: string;
};

export type KnowledgeFilters = {
  q?: string;
  category?: string;
  stage?: string;
  enabled?: string;
};

type KnowledgeRecord = {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  module_type: KnowledgeModuleType;
  stage: KnowledgeStage;
  genre: string | null;
  player_count_min: number | null;
  player_count_max: number | null;
  difficulty: string | null;
  enabled: boolean;
  weight: number;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type UsageRecord = {
  id: string;
  script_id: string | null;
  knowledge_item_id: string;
  stage: string;
  module_type: string;
  usage_reason: string;
  created_at: string;
  knowledge_items?: { title?: string | null } | null;
};

type QualityRecord = {
  id: string;
  script_id: string | null;
  stage: string;
  module_type: string;
  score: number;
  risk_level: string;
  rewrite_required: boolean;
  issues: unknown;
  created_at: string;
};

export async function getKnowledgeItems(filters: KnowledgeFilters) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return { items: [], error: "未配置 Supabase service role，无法读取知识库。" };

  let query = supabase
    .from("knowledge_items")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  const q = filters.q?.trim();
  if (q) query = query.or(`title.ilike.%${escapePostgrestValue(q)}%,content.ilike.%${escapePostgrestValue(q)}%`);
  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);
  if (filters.stage && filters.stage !== "all") query = query.eq("stage", filters.stage);
  if (filters.enabled === "true") query = query.eq("enabled", true);
  if (filters.enabled === "false") query = query.eq("enabled", false);

  const { data, error } = await query.returns<KnowledgeRecord[]>();
  if (error) return { items: [], error: `读取知识库失败：${error.message}` };

  return { items: (data ?? []).map(mapKnowledgeItem), error: undefined };
}

export async function getKnowledgeItem(id: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("knowledge_items").select("*").eq("id", id).maybeSingle<KnowledgeRecord>();
  return data ? mapKnowledgeItem(data) : null;
}

export async function getKnowledgeUsageSnapshot() {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return { usages: [], reports: [], error: "未配置 Supabase service role，无法读取引用记录。" };

  const [usageResult, reportResult] = await Promise.all([
    supabase
      .from("generation_knowledge_usages")
      .select("id,script_id,knowledge_item_id,stage,module_type,usage_reason,created_at,knowledge_items(title)")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<UsageRecord[]>(),
    supabase
      .from("generation_quality_reports")
      .select("id,script_id,stage,module_type,score,risk_level,rewrite_required,issues,created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<QualityRecord[]>(),
  ]);

  if (usageResult.error) return { usages: [], reports: [], error: `读取知识引用失败：${usageResult.error.message}` };
  if (reportResult.error) return { usages: [], reports: [], error: `读取质检报告失败：${reportResult.error.message}` };

  return {
    usages: (usageResult.data ?? []).map((row) => ({
      id: row.id,
      scriptId: row.script_id,
      knowledgeItemId: row.knowledge_item_id,
      knowledgeTitle: row.knowledge_items?.title ?? row.knowledge_item_id.slice(0, 8),
      stage: row.stage,
      moduleType: row.module_type,
      usageReason: row.usage_reason,
      createdAt: row.created_at,
    })),
    reports: (reportResult.data ?? []).map((row) => ({
      id: row.id,
      scriptId: row.script_id,
      stage: row.stage,
      moduleType: row.module_type,
      score: row.score,
      riskLevel: row.risk_level,
      rewriteRequired: row.rewrite_required,
      issues: row.issues,
      createdAt: row.created_at,
    })),
    error: undefined,
  };
}

function mapKnowledgeItem(row: KnowledgeRecord): KnowledgeItemRow {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    moduleType: row.module_type,
    stage: row.stage,
    genre: row.genre,
    playerCountMin: row.player_count_min,
    playerCountMax: row.player_count_max,
    difficulty: row.difficulty,
    enabled: row.enabled,
    weight: row.weight,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapePostgrestValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll(",", "\\,");
}
