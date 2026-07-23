import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScriptGenerationParams } from "@/lib/ai/prompts/script-generation";

export type GenerationKnowledgeStage =
  | "case_core"
  | "characters"
  | "clues"
  | "acts"
  | "player_script"
  | "dm_manual"
  | "review";

export type GenerationKnowledgeItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  moduleType: string;
  stage: string;
  weight: number;
};

type KnowledgeRecord = {
  id: string;
  title: string;
  content: string;
  category: string;
  module_type: string;
  stage: string;
  weight: number;
};

const STAGE_CATEGORIES: Record<GenerationKnowledgeStage, string[]> = {
  case_core: ["structure_rule", "timeline_pattern", "anti_novelization_rule", "quality_metric"],
  characters: ["character_pattern", "structure_rule", "anti_novelization_rule", "quality_metric"],
  clues: ["clue_pattern", "structure_rule", "anti_pattern", "quality_metric"],
  acts: ["structure_rule", "timeline_pattern", "anti_novelization_rule", "quality_metric"],
  player_script: ["character_pattern", "anti_novelization_rule", "quality_metric"],
  dm_manual: ["dm_flow_rule", "structure_rule", "anti_novelization_rule", "quality_metric"],
  review: ["anti_novelization_rule", "quality_metric", "anti_pattern"],
};

export async function retrieveStageKnowledge(
  supabase: SupabaseClient,
  input: {
    stage: GenerationKnowledgeStage;
    params: ScriptGenerationParams;
    limit?: number;
  },
): Promise<GenerationKnowledgeItem[]> {
  const query = supabase
    .from("knowledge_items")
    .select("id,title,content,category,module_type,stage,weight")
    .eq("enabled", true)
    .in("stage", [input.stage, "review"])
    .in("category", STAGE_CATEGORIES[input.stage])
    .or(`genre.is.null,genre.eq.${input.params.genre}`)
    .or(`difficulty.is.null,difficulty.eq.${input.params.difficulty}`)
    .or(`player_count_min.is.null,player_count_min.lte.${input.params.players}`)
    .or(`player_count_max.is.null,player_count_max.gte.${input.params.players}`)
    .order("weight", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 6);

  const { data, error } = await query.returns<KnowledgeRecord[]>();
  if (error) {
    console.warn(`[knowledge] retrieve failed: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    moduleType: row.module_type,
    stage: row.stage,
    weight: row.weight,
  }));
}

export function appendKnowledgeToPrompt(userPrompt: string, items: GenerationKnowledgeItem[]) {
  if (items.length === 0) return userPrompt;

  const lines = [
    userPrompt,
    "",
    "【创作知识库约束】",
    "以下知识仅用于结构、规则和质检参考，不得复刻人物、桥段、台词或作案手法。",
    ...items.map((item, index) => [
      `知识 ${index + 1}`,
      `类型: ${item.category}`,
      `阶段: ${item.stage}`,
      `用途: ${item.moduleType}`,
      `标题: ${item.title}`,
      `内容: ${item.content}`,
    ].join("\n")),
  ];

  return lines.join("\n\n");
}

export async function recordKnowledgeUsages(
  supabase: SupabaseClient,
  input: {
    generationTaskId?: string;
    scriptId: string;
    stage: GenerationKnowledgeStage;
    moduleType: string;
    items: GenerationKnowledgeItem[];
  },
) {
  if (input.items.length === 0) return;

  const { error } = await supabase.from("generation_knowledge_usages").insert(
    input.items.map((item) => ({
      generation_task_id: input.generationTaskId ?? null,
      script_id: input.scriptId,
      knowledge_item_id: item.id,
      stage: input.stage,
      module_type: input.moduleType,
      usage_reason: `${input.stage} 阶段规则引用`,
    })),
  );

  if (error) console.warn(`[knowledge] usage record failed: ${error.message}`);
}

export function assessNovelizationRisk(content: unknown) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const length = text.length;
  const descriptiveHits = countMatches(text, /(心中|眼前|仿佛|雨声|月光|低头|沉默|回忆|泪|苦涩|颤抖|空气|窗外)/g);
  const playableHits = countMatches(text, /(任务|目标|线索|证据|时间线|搜证|盘问|投票|复盘|嫌疑|动机|秘密|隐瞒|公开信息|私密信息)/g);
  const paragraphRisk = countMatches(text, /。[^。]{120,}。/g);

  let score = 20;
  score += Math.min(35, descriptiveHits * 4);
  score += Math.min(25, paragraphRisk * 8);
  score -= Math.min(30, playableHits * 3);
  if (length > 0 && playableHits === 0) score += 20;

  const normalized = Math.max(0, Math.min(100, score));
  return {
    score: normalized,
    riskLevel: normalized > 60 ? "high" : normalized > 30 ? "medium" : "low",
    rewriteRequired: normalized > 30,
    issues: buildIssues(descriptiveHits, playableHits, paragraphRisk),
  };
}

export async function recordQualityReport(
  supabase: SupabaseClient,
  input: {
    generationTaskId?: string;
    scriptId: string;
    stage: GenerationKnowledgeStage;
    moduleType: string;
    content: unknown;
  },
) {
  const report = assessNovelizationRisk(input.content);
  const { error } = await supabase.from("generation_quality_reports").insert({
    generation_task_id: input.generationTaskId ?? null,
    script_id: input.scriptId,
    stage: input.stage,
    module_type: input.moduleType,
    score: report.score,
    risk_level: report.riskLevel,
    issues: report.issues,
    rewrite_required: report.rewriteRequired,
  });

  if (error) console.warn(`[knowledge] quality record failed: ${error.message}`);
  return report;
}

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function buildIssues(descriptiveHits: number, playableHits: number, paragraphRisk: number) {
  const issues: Array<{ type: string; severity: string; message: string }> = [];
  if (descriptiveHits >= 5) {
    issues.push({ type: "descriptive_overload", severity: "medium", message: "存在较多心理或氛围描写。" });
  }
  if (paragraphRisk > 0) {
    issues.push({ type: "long_narrative_paragraph", severity: "medium", message: "存在过长连续叙事段落。" });
  }
  if (playableHits === 0) {
    issues.push({ type: "missing_playable_terms", severity: "high", message: "缺少任务、线索、证据或流程等可玩信息。" });
  }
  return issues;
}
