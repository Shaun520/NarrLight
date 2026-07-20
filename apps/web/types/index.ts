/**
 * 叙光平台全局类型定义
 *
 * 与数据库 schema (lib/supabase/types.ts) 对齐，采用 camelCase 命名。
 * 仅包含本批次服务所需的类型；其余实体类型由 T013 任务补充扩展。
 */
import type { Json } from '@/lib/supabase/types';

/** AI 生成任务类型 */
export type TaskType =
  | 'FULL_SCRIPT'
  | 'CHARACTER_ADJUST'
  | 'CLUE_MODIFY'
  | 'TRICK_REPLACE'
  | 'STYLE_CHANGE'
  | 'COMPRESS'
  | 'COMPLIANCE'
  | 'ILLUSTRATION';

/** AI 生成任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 版本快照操作类型 */
export type OperationType =
  | 'GENERATE'
  | 'EDIT_CHARACTER'
  | 'EDIT_CLUE'
  | 'REPLACE_TRICK'
  | 'STYLE_CHANGE'
  | 'COMPRESS'
  | 'COMPLIANCE_ADJUST'
  | 'ROLLBACK';

/** 版本快照 */
export interface VersionSnapshot {
  id: string;
  scriptId: string;
  versionNumber: number;
  snapshotData: Json;
  changeSummary: string;
  operationType: OperationType;
  createdBy: string | null;
  createdAt: string;
}

/** AI 生成任务 */
export interface GenerationTask {
  id: string;
  scriptId: string;
  taskType: TaskType;
  status: TaskStatus;
  params: Json;
  progressPercent: number;
  resultData: Json | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** 插画任务类型 */
export type IllustrationTaskType = 'cover' | 'scene' | 'clue' | 'public' | 'char' | 'poster';

/** 插画任务状态 */
export type IllustrationTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 插画风格档案 */
export interface IllustrationStyleProfile {
  id: string;
  scriptId: string;
  styleName: string;
  visualTone: string;
  masterPrompt: string;
  referenceNotes: string;
  marketItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 插画任务 */
export interface IllustrationTask {
  id: string;
  scriptId: string;
  styleProfileId: string;
  assetId: string | null;
  marketItemId: string | null;
  taskKey: string;
  taskType: IllustrationTaskType;
  sourceType: string;
  sourceId: string;
  title: string;
  subtitle: string;
  prompt: string;
  status: IllustrationTaskStatus;
  progressPercent: number;
  sortOrder: number;
  selectedModel: string;
  selectedRatio: string;
  selectedCount: number;
  resultImageUrl: string;
  errorMessage: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 插画市场素材 */
export interface IllustrationMarketItem {
  id: string;
  title: string;
  taskType: IllustrationTaskType;
  subtitle: string;
  promptHint: string;
  visualTone: string;
  thumbUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 版本对比结果 */
export interface VersionDiffResult {
  added: string[];
  removed: string[];
  modified: { field: string; old: string; new: string }[];
}

/** 剧本题材（与 scripts.genre 对齐） */
export type ScriptGenre = 'hardcore' | 'emotion' | 'horror' | 'funny' | 'mechanism';

/** 剧本难度（原型四档：新手/进阶/烧脑/专家） */
export type ScriptDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/** 剧本状态：draft→generating→completed→archived */
export type ScriptStatus = 'draft' | 'generating' | 'completed' | 'archived';

/** 剧本元信息 */
export interface Script {
  id: string;
  authorId: string;
  title: string;
  description: string;
  genre: ScriptGenre;
  playerCount: number;
  durationHours: number;
  difficulty: ScriptDifficulty;
  backgroundSetting: string;
  coreTheme: string;
  status: ScriptStatus;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}
