export const KNOWLEDGE_CATEGORIES = [
  "structure_rule",
  "character_pattern",
  "clue_pattern",
  "timeline_pattern",
  "dm_flow_rule",
  "anti_novelization_rule",
  "quality_metric",
  "anti_pattern",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_STAGES = [
  "brief",
  "case_core",
  "characters",
  "clues",
  "acts",
  "player_script",
  "dm_manual",
  "review",
] as const;

export type KnowledgeStage = (typeof KNOWLEDGE_STAGES)[number];

export const KNOWLEDGE_MODULE_TYPES = [
  "case_core",
  "characters",
  "clues",
  "acts",
  "player_script",
  "dm_manual",
  "truth_review",
  "quality_check",
] as const;

export type KnowledgeModuleType = (typeof KNOWLEDGE_MODULE_TYPES)[number];

export const QUALITY_RISK_LEVELS = ["low", "medium", "high"] as const;

export type QualityRiskLevel = (typeof QUALITY_RISK_LEVELS)[number];

export type GenerationQualityIssue = {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
};

export type GenerationQualityReport = {
  score: number;
  riskLevel: QualityRiskLevel;
  rewriteRequired: boolean;
  issues: GenerationQualityIssue[];
  rewriteInstructions: string[];
};
