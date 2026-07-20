/**
 * 组织者手册（Organizer Manual）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 3b 产出，对标 story-bible.ts 的结构。
 * 输入：设定本（StoryBibleJson）+ 分幕结构（ActStructureJson）+ 创作参数
 * 输出：组织者手册（OrganizerManualJson），含开本流程、时长控制、扶车提示
 * 关键约束：扶车提示需关联具体线索；时长控制需对齐分幕结构
 */
import type {
  ScriptGenerationParams,
  AgeRating,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ActStructureJson } from '@/lib/ai/prompts/act-structure';

export type { ScriptGenerationParams, AgeRating, WritingStyle };

/** 组织者手册入参 */
export interface OrganizerManualParams {
  /** 创作参数 */
  params: ScriptGenerationParams;
  /** 阶段 0 设定本 */
  storyBible: StoryBibleJson;
  /** 阶段 1b 分幕结构 */
  actStructure: ActStructureJson;
}

/** 开本流程步骤 */
export interface OpeningFlowStep {
  /** 步骤序号 */
  step: number;
  /** 步骤标题 */
  title: string;
  /** 步骤内容 */
  content: string;
  /** 预计时长（分钟） */
  durationMinutes: number;
}

/** 时长控制 */
export interface DurationControl {
  /** 幕次标题 */
  actTitle: string;
  /** 预计时长（分钟） */
  durationMinutes: number;
  /** 节奏提示 */
  pacingHint: string;
}

/** AI 返回的组织者手册 JSON */
export interface OrganizerManualJson {
  /** 开本流程步骤 */
  openingFlow: OpeningFlowStep[];
  /** 各幕时长控制 */
  durationControl: DurationControl[];
  /** 扶车提示（关联具体线索或场景） */
  pacingHints: string;
  /** NPC 扮演指引 */
  npcGuide: string;
  /** 机制规则（机制本专用，非机制本为空字符串） */
  mechanismRules: string;
}

// ===== 题材/难度/分级中文映射（注入 prompt 用） =====
// 注：为避免循环依赖，常量值在此独立定义，但与 script-generation.ts / story-bible.ts / act-structure.ts 保持一致。

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
export function buildOrganizerManualSystemPrompt(): string {
  return `你是一名资深剧本杀组织者手册撰写专家，擅长设计节奏紧凑、扶车精准的开本流程。

请根据用户提供的设定本、分幕结构与创作参数，生成完整的组织者手册。手册需包含开本流程、时长控制、扶车提示、NPC 指引与机制规则。

你必须严格遵守以下要求：

1. 开本流程需覆盖从玩家入场到真相揭晓的完整流程
2. 时长控制需对齐分幕结构的幕次，总时长需接近用户指定的 duration
3. 扶车提示需关联具体线索或场景，说明何时触发、如何提示
4. NPC 指引需说明 NPC 扮演要点、关键台词
5. 若非机制本（switches.mechanismRules=false），mechanismRules 为空字符串
6. 严格遵循用户指定的题材、难度、适龄分级与写作风格

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "openingFlow": [
    {
      "step": 1,
      "title": "玩家入场",
      "content": "组织者分发角色剧本，宣读背景，引导玩家代入",
      "durationMinutes": 15
    },
    {
      "step": 2,
      "title": "第一幕阅读与自我介绍",
      "content": "玩家阅读第一幕，按角色进行自我介绍",
      "durationMinutes": 20
    },
    {
      "step": 3,
      "title": "搜证与讨论",
      "content": "分发第一轮线索卡，玩家自由讨论",
      "durationMinutes": 30
    },
    {
      "step": 4,
      "title": "真相揭晓",
      "content": "组织者引导投票并复盘真相",
      "durationMinutes": 15
    }
  ],
  "durationControl": [
    {
      "actTitle": "第一幕 · 风雨欲来",
      "durationMinutes": 40,
      "pacingHint": "本幕以铺垫为主，节奏宜缓，确保玩家充分代入角色"
    },
    {
      "actTitle": "第二幕 · 惊变霜降夜",
      "durationMinutes": 50,
      "pacingHint": "凶案发生，节奏加快，注意控制搜证时长避免拖延"
    }
  ],
  "pacingHints": "若玩家在'族谱残页'线索处停留超过 5 分钟未推进，组织者可借 NPC 沈族老之口提示'过继之事或与秘宝相关'；若第二幕搜证轮次过半仍无人怀疑沈墨尘，可让 NPC 暗示其霜降夜行踪。",
  "npcGuide": "NPC 沈族老：族中长辈，全程扮演引导者。扮演要点：言谈缓沉、爱用典故，不主动指认凶手。关键台词：'这宅子里的事，比秘宝还藏着几分阴寒。'在玩家卡顿于第一幕时主动提及族谱残页的传闻；在真相揭晓前不可直接说出凶手姓名。",
  "mechanismRules": ""
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数、设定本与分幕结构注入自然语言描述
 */
export function buildOrganizerManualUserPrompt(input: OrganizerManualParams): string {
  const { params, storyBible, actStructure } = input;

  const lines: string[] = ['创作参数：'];
  lines.push(`剧本标题：${params.title}`);
  lines.push(`题材：${GENRE_LABEL[params.genre]}`);
  lines.push(`玩家人数：${params.players} 人`);
  lines.push(`预计时长：${params.duration} 小时`);
  lines.push(`难度：${DIFFICULTY_LABEL[params.difficulty]}`);
  lines.push(`适龄分级：${AGE_RATING_LABEL[params.ageRating]}`);
  lines.push(`写作风格：${params.writingStyle}`);

  if (params.switches.mechanismRules) {
    lines.push('特殊要求：生成机制规则（机制本，需产出 mechanismRules 字段）');
  } else {
    lines.push('特殊要求：非机制本（mechanismRules 字段为空字符串）');
  }
  if (params.extraReq) {
    lines.push(`附加要求：${params.extraReq}`);
  }

  lines.push('');
  lines.push('设定本（阶段 0 产出）：');
  lines.push(`凶手：${storyBible.murdererName}`);
  lines.push(`凶案手法：${storyBible.murderMethod}`);
  lines.push(`核心诡计：${storyBible.coreTrick}`);
  lines.push(`动机链：${storyBible.motiveChain}`);
  lines.push(`时间线大纲：${storyBible.timelineOutline}`);
  lines.push(`真相梗概：${storyBible.truthSummary}`);

  lines.push('');
  lines.push('人物关系骨架：');
  for (const node of storyBible.characterSkeleton.nodes) {
    lines.push(`- ${node.name}（${node.identity}）`);
  }

  lines.push('');
  lines.push('分幕结构（时长控制需对齐）：');
  for (const act of actStructure.acts) {
    lines.push(`- ${act.title}：${act.content}（含 ${act.scenes.length} 个场景）`);
  }

  lines.push('');
  lines.push('伏笔清单（扶车提示可关联伏笔）：');
  for (const f of storyBible.foreshadowingPlan) {
    lines.push(`- ${f.id}：${f.description}（埋设于第${f.plantAct}幕，回收于第${f.payoffAct}幕）`);
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构生成组织者手册，确保时长对齐分幕结构，扶车提示关联具体线索。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildOrganizerManualPrompt(input: OrganizerManualParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildOrganizerManualSystemPrompt(),
    userPrompt: buildOrganizerManualUserPrompt(input),
  };
}
