import type { ScriptDifficulty, ScriptGenre } from "@/types";
import type { GenerationSpecConfig } from "@narrlight/shared";

export interface GenerationSpecInput {
  players: number;
  duration: number;
  genre: ScriptGenre;
  difficulty: ScriptDifficulty;
}

export interface GenerationSpec {
  characterScriptMode: GenerationSpecConfig["characterScriptMode"];
  actCount: number;
  searchRoundCount: number;
  minSceneCount: number;
  minClueCount: number;
  minCharacterScriptWords: number;
  scriptsPerPlayer: number;
  totalCharacterScriptCount: number;
  minWordsPerCharacterScriptPiece: number;
}

export function buildGenerationSpec(
  input: GenerationSpecInput,
  config: GenerationSpecConfig = DEFAULT_GENERATION_SPEC_CONFIG,
): GenerationSpec {
  return buildGenerationSpecWithConfig(input, config);
}

export function buildGenerationSpecWithConfig(
  input: GenerationSpecInput,
  config: GenerationSpecConfig,
): GenerationSpec {
  const duration = clamp(input.duration, 2, 8);
  const players = clamp(input.players, 4, 8);
  const band =
    config.durationBands.find(
      (item) => duration >= item.minDuration && duration <= item.maxDuration,
    ) ?? DEFAULT_GENERATION_SPEC_CONFIG.durationBands[0];
  const actCount = band.actCount;
  const searchRoundCount = band.searchRoundCount;
  const targetTotalWords = Math.round(
    duration *
      config.baseWordsPerHour *
      (config.difficultyMultipliers[input.difficulty] ?? 1) *
      (config.genreMultipliers[input.genre] ?? 1),
  );
  const scriptsPerPlayer = resolveScriptsPerPlayer(config, actCount);
  const minCharacterScriptWords = Math.round(
    (targetTotalWords * config.characterScriptShare) / players,
  );

  return {
    characterScriptMode: config.characterScriptMode,
    actCount,
    searchRoundCount,
    minSceneCount: actCount * config.minScenesPerAct,
    minClueCount:
      searchRoundCount *
      Math.max(config.minCluesPerRoundBase, Math.ceil(players * config.playerClueRatio)),
    minCharacterScriptWords,
    scriptsPerPlayer,
    totalCharacterScriptCount: players * scriptsPerPlayer,
    minWordsPerCharacterScriptPiece: Math.round(minCharacterScriptWords / scriptsPerPlayer),
  };
}

export function formatGenerationSpec(spec: GenerationSpec): string {
  return [
    `- 幕次数量：必须产出 ${spec.actCount} 幕`,
    `- 搜证轮次：全本至少 ${spec.searchRoundCount} 轮`,
    `- 场景数量：全本至少 ${spec.minSceneCount} 个场景`,
    `- 线索数量：全本至少 ${spec.minClueCount} 条线索`,
    `- 玩家剧本配置：每名玩家拿到 ${spec.scriptsPerPlayer} 本，全本共 ${spec.totalCharacterScriptCount} 本`,
    `- 玩家剧本字数：每名玩家合计不少于 ${spec.minCharacterScriptWords} 字，单本不少于 ${spec.minWordsPerCharacterScriptPiece} 字`,
  ].join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const DEFAULT_GENERATION_SPEC_CONFIG: GenerationSpecConfig = {
  baseWordsPerHour: 7500,
  characterScriptShare: 0.62,
  characterScriptMode: "single",
  customScriptsPerPlayer: 1,
  minScenesPerAct: 3,
  minCluesPerRoundBase: 4,
  playerClueRatio: 0.8,
  durationBands: [
    { minDuration: 2, maxDuration: 3, actCount: 3, searchRoundCount: 3 },
    { minDuration: 4, maxDuration: 5, actCount: 4, searchRoundCount: 4 },
    { minDuration: 6, maxDuration: 7, actCount: 5, searchRoundCount: 5 },
    { minDuration: 8, maxDuration: 8, actCount: 6, searchRoundCount: 6 },
  ],
  difficultyMultipliers: {
    beginner: 0.85,
    intermediate: 1,
    advanced: 1.15,
    expert: 1.3,
  },
  genreMultipliers: {
    hardcore: 1.15,
    emotion: 1.05,
    horror: 1,
    funny: 0.95,
    mechanism: 1.1,
  },
};

function resolveScriptsPerPlayer(config: GenerationSpecConfig, actCount: number): number {
  if (config.characterScriptMode === "per_act") return Math.max(1, actCount);
  if (config.characterScriptMode === "custom") {
    return Math.max(1, Math.round(config.customScriptsPerPlayer || 1));
  }
  return 1;
}
