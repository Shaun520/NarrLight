/**
 * 真相复盘（Truth Review）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 3c 产出，对标 story-bible.ts 的结构。
 * 输入：设定本（StoryBibleJson）+ 全部角色剧本（CharacterScriptJson[]）+ 线索卡（CluesJson）
 * 输出：完整真相复盘（TruthReviewJson），含手法详解、动机、人物结局、伏笔回收清单
 * 关键约束：必须回收设定本 foreshadowingPlan 中每一条伏笔
 */
import type {
  ScriptGenerationParams,
  AgeRating,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { CharacterScriptJson } from '@/lib/ai/prompts/character-script';
import type { CluesJson } from '@/lib/ai/prompts/clues';
import type { ActStructureJson } from '@/lib/ai/prompts/act-structure';

export type { ScriptGenerationParams, AgeRating, WritingStyle };

/** 真相复盘入参 */
export interface TruthReviewParams {
  /** 创作参数 */
  params: ScriptGenerationParams;
  /** 阶段 0 设定本 */
  storyBible: StoryBibleJson;
  /** 阶段 1b 分幕结构 */
  actStructure: ActStructureJson;
  /** 全部角色剧本（阶段 2 产出） */
  characterScripts: CharacterScriptJson[];
  /** 线索卡（阶段 3a 产出） */
  clues: CluesJson;
}

/** 角色结局 */
export interface CharacterEnding {
  /** 角色姓名 */
  characterName: string;
  /** 该角色结局 */
  ending: string;
}

/** 伏笔回收记录 */
export interface ForeshadowingResolution {
  /** 伏笔 ID（对齐设定本 foreshadowingPlan.id） */
  id: string;
  /** 原始伏笔计划 */
  plan: string;
  /** 回收位置（如"第三幕·真相揭晓"） */
  resolvedAt: string;
  /** 回收说明 */
  explanation: string;
}

/** AI 返回的真相复盘 JSON */
export interface TruthReviewJson {
  /** 完整复盘总述 */
  fullSummary: string;
  /** 手法详解 */
  methodDetail: string;
  /** 动机详解 */
  motiveDetail: string;
  /** 各角色结局 */
  characterEndings: CharacterEnding[];
  /** 伏笔回收清单（必须回收设定本中所有伏笔） */
  foreshadowingResolution: ForeshadowingResolution[];
  /** 完整时间线 */
  timelineFull: string;
}

// ===== 题材/难度/分级中文映射（注入 prompt 用） =====
// 注：为避免循环依赖，常量值在此独立定义，但与 script-generation.ts / story-bible.ts / character-script.ts / act-structure.ts / clues.ts 保持一致。

const GENRE_LABEL: Record<ScriptGenre, string> = {
  hardcore: '硬核推理',
  emotion: '情感沉浸',
  horror: '恐怖惊悚',
  funny: '欢乐机制',
  mechanism: '机制对抗',
};

const DIFFICULTY_LABEL: Record<ScriptDifficulty, string> = {
  beginner: '新手',
  intermediate: '进阶',
  advanced: '烧脑',
  expert: '专家',
};

const AGE_RATING_LABEL: Record<AgeRating, string> = {
  ALL: '全员',
  TWELVE_PLUS: '12+',
  SIXTEEN_PLUS: '16+',
  EIGHTEEN_PLUS: '18+',
};

/**
 * 构造系统提示词：角色设定 + 产出约束 + 输出格式要求（结构化 JSON）
 */
export function buildTruthReviewSystemPrompt(): string {
  return `你是一名资深剧本杀复盘撰写专家，擅长梳理复杂时间线、还原真相全貌、回收所有伏笔。

请根据用户提供的设定本、全部角色剧本与线索卡，生成完整的真相复盘。复盘需包含手法详解、动机、各角色结局、伏笔回收清单与完整时间线。

你必须严格遵守以下要求：

1. 必须回收设定本 foreshadowingPlan 中的每一条伏笔，填写 foreshadowingResolution
2. foreshadowingResolution 中的 id 必须与设定本 foreshadowingPlan.id 完全对齐
3. characterEndings 需覆盖设定本骨架中的所有角色
4. methodDetail 需详细展开设定本中的 murderMethod（含作案步骤、反侦察细节）
5. timelineFull 需整合设定本 timelineOutline 与角色剧本中的时间信息
6. 严格遵循用户指定的题材、难度、适龄分级与写作风格

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "fullSummary": "沈墨尘利用族谱残页制造时间认知偏差，在众人以为凶案发生时已实际完成作案。其真实身份为私生子，被剥夺继承权后隐忍十年，借秘宝现世之机复仇，最终在真相揭晓时伏法。",
  "methodDetail": "1. 凶手提前将乌头碱溶于温酒，利用宴席间众人敬酒之机递给死者；2. 通过时间叙诡制造不在场证明——所有角色剧本中'霜降夜'实为不同日期，凶手在众人以为凶案发生的时点已完成作案并伪装在场；3. 反侦察细节：凶手事先在死者随身物品中放置伪造信物，引导搜证方向偏离真实作案时间。",
  "motiveDetail": "凶手系沈家私生子，幼年被过继入族，名义上为二子实则无继承权。十年前父亲离世时被剥夺继承权，仅留族谱残页作为身份凭证。隐忍十年后借秘宝现世之机复仇，既要夺回本应属于自己的位置，也要让当年参与剥夺其权利的族人付出代价。",
  "characterEndings": [
    { "characterName": "沈墨白", "ending": "作为长子继承家业，但背负私吞父亲遗物的秘密，余生在愧疚与家族责任间挣扎。" },
    { "characterName": "沈墨尘", "ending": "复仇完成后身份被识破，最终选择在祠堂自尽，以私生子身份回归族谱残页的批注。" }
  ],
  "foreshadowingResolution": [
    { "id": "F1", "plan": "族谱残页'过继'二字", "resolvedAt": "第三幕·真相揭晓", "explanation": "族谱残页边缘的'过继'二字揭示沈墨尘实为过继之子，并非沈家血脉，其继承权被剥夺的真相由此暴露，动机得以成立。" },
    { "id": "F2", "plan": "霜降夜的异常天象记录", "resolvedAt": "第三幕·时间线还原", "explanation": "角色剧本中多次提及霜降夜天象异常，实为不同日期的同一时辰，佐证时间叙诡——所有角色记忆中的'霜降夜'并非同一晚。" }
  ],
  "timelineFull": "Day1 晚:族人齐聚沈宅 → Day2 午:密室会谈，沈墨尘得知秘宝现世 → Day2 夜（实为Day1夜）:凶案发生，乌头碱下于温酒 → Day2 夜（众人认知）:宴席间死者倒地，搜证开始 → Day3 晨:完整搜证，真相浮出"
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数、设定本、角色剧本与线索卡注入自然语言描述
 */
export function buildTruthReviewUserPrompt(input: TruthReviewParams): string {
  const { params, storyBible, actStructure, characterScripts, clues } = input;

  const lines: string[] = ['创作参数：'];
  lines.push(`剧本标题：${params.title}`);
  lines.push(`题材：${GENRE_LABEL[params.genre]}`);
  lines.push(`玩家人数：${params.players} 人`);
  lines.push(`预计时长：${params.duration} 小时`);
  lines.push(`难度：${DIFFICULTY_LABEL[params.difficulty]}`);
  lines.push(`适龄分级：${AGE_RATING_LABEL[params.ageRating]}`);
  lines.push(`写作风格：${params.writingStyle}`);
  if (params.extraReq) {
    lines.push(`附加要求：${params.extraReq}`);
  }

  lines.push('');
  lines.push('设定本（阶段 0 产出，伏笔必须全部回收）：');
  lines.push(`凶手：${storyBible.murdererName}`);
  lines.push(`凶案手法：${storyBible.murderMethod}`);
  lines.push(`核心诡计：${storyBible.coreTrick}`);
  lines.push(`动机链：${storyBible.motiveChain}`);
  lines.push(`时间线大纲：${storyBible.timelineOutline}`);
  lines.push(`真相梗概：${storyBible.truthSummary}`);

  lines.push('');
  lines.push('伏笔清单（foreshadowingResolution 必须逐条回收，id 完全对齐）：');
  for (const f of storyBible.foreshadowingPlan) {
    lines.push(`- ${f.id}：${f.description}（埋设于第${f.plantAct}幕，回收于第${f.payoffAct}幕）`);
  }

  lines.push('');
  lines.push('人物关系骨架（characterEndings 需覆盖所有角色）：');
  for (const node of storyBible.characterSkeleton.nodes) {
    lines.push(`- ${node.name}（${node.identity}）`);
  }

  lines.push('');
  lines.push('分幕结构：');
  for (const act of actStructure.acts) {
    lines.push(`- 第${act.sortOrder}幕 ${act.title}`);
  }

  lines.push('');
  lines.push('全部角色剧本摘要（用于整合时间线与角色结局）：');
  for (const cs of characterScripts) {
    lines.push(`- ${cs.characterName}：${cs.personalArc}（可见线索：${cs.visibleClueTitles.join('、')}）`);
  }

  lines.push('');
  lines.push('线索卡摘要（用于伏笔回收说明）：');
  for (const clue of clues.clues) {
    lines.push(`- ${clue.title}（${clue.clueType}，${clue.isKeyClue ? '关键' : '非关键'}，关联：${clue.relatedCharacterNames.join('、')}）`);
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构生成完整真相复盘，确保回收所有伏笔，角色结局覆盖所有角色。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildTruthReviewPrompt(input: TruthReviewParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildTruthReviewSystemPrompt(),
    userPrompt: buildTruthReviewUserPrompt(input),
  };
}
