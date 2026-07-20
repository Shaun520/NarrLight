export const NARRLIGHT_APP_NAME = "NarrLight";

export const SCRIPT_GENRES = [
  "hardcore",
  "emotion",
  "horror",
  "funny",
  "mechanism",
] as const;

export type ScriptGenre = (typeof SCRIPT_GENRES)[number];

export const GENERATION_TASK_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type GenerationTaskStatus = (typeof GENERATION_TASK_STATUSES)[number];
