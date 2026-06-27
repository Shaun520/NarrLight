/**
 * 局部调整 Prompt 模板
 *
 * 用于编辑器右侧 AI 智能调整面板与定向修改流程。
 * 每个构造函数返回 { systemPrompt, userPrompt }，便于日志与调试。
 *
 * 任务类型对应 types/index.ts 的 TaskType：
 *   CHARACTER_ADJUST / CLUE_MODIFY / TRICK_REPLACE /
 *   STYLE_CHANGE / COMPRESS / COMPLIANCE
 */
import type { WritingStyle } from './script-generation';

/** 局部调整 prompt 返回结构 */
export interface AdjustPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

/** 通用系统提示词：剧本杀局部修改专家 */
function buildBaseSystemPrompt(role: string): string {
  return `你是一名资深剧本杀编剧与剧情修改专家，${role}。

请严格遵守以下原则：
1. 仅修改用户指定范围的内容，不得改动其他角色剧情、核心诡计与已埋伏笔；
2. 修改后须保持人物性格、身份设定前后一致，杜绝 OOC（人设崩塌）；
3. 须同步更新与修改内容相关联的线索、时间线、真相复盘说明，避免逻辑断层；
4. 输出格式：仅返回 JSON 对象，不包含 markdown 代码块或解释性文本；
5. 严禁违反适龄分级与平台合规要求。`;
}

/**
 * 角色调整 prompt
 * @param characterId  角色 ID 或名称
 * @param instruction  调整指令，如 "补全童年背景，强化杀人动机"
 */
export function buildCharacterAdjustPrompt(
  characterId: string,
  instruction: string,
): AdjustPromptResult {
  const systemPrompt = buildBaseSystemPrompt('擅长人物弧光与动机塑造');
  const userPrompt = `【任务类型】CHARACTER_ADJUST
【角色】${characterId}
【调整指令】${instruction}

请仅针对该角色执行调整，输出 JSON：
{
  "characterId": "${characterId}",
  "backgroundStory": "调整后的背景故事",
  "motive": "调整后的动机说明",
  "affectedActs": [
    { "actTitle": "幕标题", "modifiedParagraphs": ["修改后的段落…"] }
  ],
  "sideEffects": ["需同步更新的线索/时间线/真相说明…"]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 线索修改 prompt
 * @param clueId     线索编号或标题
 * @param instruction 修改指令，如 "增加误导性描述"
 */
export function buildClueModifyPrompt(
  clueId: string,
  instruction: string,
): AdjustPromptResult {
  const systemPrompt = buildBaseSystemPrompt('擅长线索链与误导性设计');
  const userPrompt = `【任务类型】CLUE_MODIFY
【线索】${clueId}
【修改指令】${instruction}

请仅修改该线索文案与关联解释，输出 JSON：
{
  "clueId": "${clueId}",
  "content": "修改后的线索内容",
  "truthExplanation": "同步更新的真相复盘中对应解释",
  "isDistractor": false,
  "isKeyClue": false,
  "sideEffects": ["受影响的关联角色 / 时间线节点…"]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 诡计替换 prompt
 * @param trickId   原诡计标识
 * @param newTrick  新诡计描述，如 "密室手法"
 */
export function buildTrickReplacePrompt(
  trickId: string,
  newTrick: string,
): AdjustPromptResult {
  const systemPrompt = buildBaseSystemPrompt('精通推理诡计设计与物理可行性');
  const userPrompt = `【任务类型】TRICK_REPLACE
【原诡计】${trickId}
【新诡计】${newTrick}

请替换核心诡计，并同步更新所有相关线索、时间线、人物行为逻辑，输出 JSON：
{
  "oldTrick": "${trickId}",
  "newTrick": "${newTrick}",
  "murdererMethod": "新诡计的作案手法说明",
  "updatedClues": [
    { "clueId": "线索编号", "content": "同步更新后的线索内容" }
  ],
  "updatedTimeline": ["新诡计下的关键时间节点…"],
  "feasibilityNotes": "新诡计的物理可行性说明"
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 风格转换 prompt
 * @param scriptId    剧本 ID
 * @param targetStyle 目标写作风格
 */
export function buildStyleChangePrompt(
  scriptId: string,
  targetStyle: WritingStyle,
): AdjustPromptResult {
  const systemPrompt = buildBaseSystemPrompt('精通多风格文学创作');
  const userPrompt = `【任务类型】STYLE_CHANGE
【剧本】${scriptId}
【目标风格】${targetStyle}

请统一转换全本写作风格，保持人物关系、剧情走向、核心线索信息完全不变，输出 JSON：
{
  "scriptId": "${scriptId}",
  "targetStyle": "${targetStyle}",
  "rewrittenSections": [
    { "nodeId": "节点 ID", "content": "改写后的内容" }
  ],
  "preservedElements": ["未改动的人物关系 / 剧情走向 / 核心线索…"]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 压缩 prompt
 * @param scriptId    剧本 ID
 * @param targetWords 目标字数
 */
export function buildCompressPrompt(
  scriptId: string,
  targetWords: number,
): AdjustPromptResult {
  const systemPrompt = buildBaseSystemPrompt('擅长精简叙事与节奏控制');
  const userPrompt = `【任务类型】COMPRESS
【剧本】${scriptId}
【目标字数】${targetWords} 字

请在保留所有核心剧情、线索、诡计的前提下精简冗余描述，输出 JSON：
{
  "scriptId": "${scriptId}",
  "targetWords": ${targetWords},
  "compressedSections": [
    { "nodeId": "节点 ID", "content": "压缩后的内容", "originalWords": 0, "compressedWords": 0 }
  ],
  "preservedKeyElements": ["保留的核心剧情 / 线索 / 诡计…"]
}`;

  return { systemPrompt, userPrompt };
}

/**
 * 合规整改 prompt
 * @param scriptId 剧本 ID
 */
export function buildCompliancePrompt(scriptId: string): AdjustPromptResult {
  const systemPrompt = buildBaseSystemPrompt('熟悉国内剧本杀内容合规要求');
  const userPrompt = `【任务类型】COMPLIANCE
【剧本】${scriptId}

请按 16+ 适龄分级要求执行合规整改，自动删减血腥、暴力、恐怖的直白描述，保留核心剧情逻辑，输出 JSON：
{
  "scriptId": "${scriptId}",
  "ageRating": "SIXTEEN_PLUS",
  "adjustedSections": [
    { "nodeId": "节点 ID", "original": "原文片段", "adjusted": "整改后片段", "reason": "整改原因" }
  ],
  "removedSensitiveWords": ["被删减的敏感词列表…"]
}`;

  return { systemPrompt, userPrompt };
}
