/**
 * 设定本（Story Bible）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 0 产出，对标 script-generation.ts 的结构，
 * 但仅产出"图纸级"设定本而非完整剧本。
 * 定义 StoryBibleParams 与生成结果 JSON 结构，
 * 提供 system / user / 完整 prompt 构造函数。
 * 输出要求 AI 返回结构化 JSON：
 * { murdererName, murderMethod, coreTrick, motiveChain,
 *   characterSkeleton, timelineOutline, truthSummary, foreshadowingPlan }
 */
import type {
  ScriptGenerationParams,
  AgeRating,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';

export type { ScriptGenerationParams, AgeRating, WritingStyle };

/** 设定本入参（与全本生成入参一致） */
export type StoryBibleParams = ScriptGenerationParams;

/** 人物关系骨架节点 */
export interface StoryCharacterNode {
  name: string;
  identity: string;
  secret: string;
}

/** 人物关系骨架边 */
export interface StoryRelationEdge {
  from: string;
  to: string;
  type: 'family' | 'friend' | 'lover' | 'enemy' | 'colleague' | 'conspiracy' | 'other';
  label: string;
  isHidden: boolean;
}

/** 伏笔设计计划 */
export interface ForeshadowingPlan {
  id: string;
  description: string;
  plantAct: number;
  payoffAct: number;
}

/** AI 返回的设定本结构化 JSON */
export interface StoryBibleJson {
  murdererName: string;
  murderMethod: string;
  coreTrick: string;
  motiveChain: string;
  characterSkeleton: { nodes: StoryCharacterNode[]; edges: StoryRelationEdge[] };
  timelineOutline: string;
  truthSummary: string;
  foreshadowingPlan: ForeshadowingPlan[];
}

// ===== 题材/难度/分级中文映射（注入 prompt 用） =====
// 注：为避免循环依赖，常量值在此独立定义，但与 script-generation.ts 保持一致。

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
 * 构造系统提示词：角色设定 + 产出顺序约束 + 输出格式要求（结构化 JSON）
 */
export function buildStoryBibleSystemPrompt(): string {
  return `你是一名资深剧本杀结构设计师，擅长构思严密的多层诡计与人物动机网。

请根据用户提供的创作参数，生成剧本杀的设定本（Story Bible）。设定本是全本的图纸，后续阶段将基于此生成完整剧本。

请按以下顺序构思：先确定凶手与凶案手法（保证物理可行性），再反推人物关系网与动机链，最后设计伏笔。

禁止展开完整人物对白、场景描写、完整角色剧本内容；仅产出图纸级设定本。

你必须严格遵守以下要求：

1. 凶案手法必须物理可行，考虑反侦察意识
2. 人物关系骨架的 nodes 数量必须严格等于玩家人数；用户写 6 人就必须返回 exactly 6 个 nodes，不得多也不得少
3. 凶手姓名必须出现在人物关系骨架的节点列表中
4. 每条伏笔的 payoffAct 必须大于等于 plantAct
5. 严格遵循用户指定的题材、难度、适龄分级与写作风格

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "murdererName": "沈墨尘",
  "murderMethod": "利用乌头碱溶于温酒，伪造成急症暴毙",
  "coreTrick": "时间叙诡——所有角色剧本中'霜降夜'实为不同日期",
  "motiveChain": "凶手系私生子，被剥夺继承权后隐忍十年，借秘宝现世之机复仇",
  "characterSkeleton": {
    "nodes": [
      { "name": "沈墨白", "identity": "沈家长子·死者", "secret": "曾私吞父亲遗物" },
      { "name": "沈墨尘", "identity": "沈家二子", "secret": "私生子身份" }
    ],
    "edges": [
      { "from": "沈墨尘", "to": "沈墨白", "type": "enemy", "label": "继承权之争", "isHidden": true }
    ]
  },
  "timelineOutline": "Day1 晚:族人齐聚 → Day2 午:密室会谈 → Day2 夜:凶案 → Day3 晨:搜证",
  "truthSummary": "沈墨尘利用族谱残页制造时间认知偏差，在众人以为凶案发生时已实际完成作案...",
  "foreshadowingPlan": [
    { "id": "F1", "description": "族谱残页'过继'二字", "plantAct": 1, "payoffAct": 3 }
  ]
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数注入自然语言描述
 */
export function buildStoryBibleUserPrompt(params: ScriptGenerationParams): string {
  const lines: string[] = [
    `剧本标题：${params.title}`,
    `题材：${GENRE_LABEL[params.genre]}`,
    `玩家人数：${params.players} 人`,
    `预计时长：${params.duration} 小时`,
    `难度：${DIFFICULTY_LABEL[params.difficulty]}`,
    `背景设定：${params.background || '（请自由发挥，需契合题材）'}`,
    `核心立意：${params.theme || '（请自由发挥）'}`,
    `适龄分级：${AGE_RATING_LABEL[params.ageRating]}`,
    `写作风格：${params.writingStyle}`,
  ];

  if (params.switches.noEdgeRole) {
    lines.push('特殊要求：无边缘位（所有角色戏份均衡）');
  }
  if (params.switches.compliancePreCheck) {
    lines.push('合规预检（屏蔽敏感词）');
  }
  if (params.switches.mechanismRules) {
    lines.push('生成机制规则（机制本）');
  }
  if (params.extraReq) {
    lines.push(`附加要求：${params.extraReq}`);
  }

  lines.push('');
  lines.push(`请按系统提示词规定的 JSON 结构生成设定本，仅产出图纸，不展开完整剧本内容。characterSkeleton.nodes 必须刚好 ${params.players} 个。`);

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildStoryBiblePrompt(params: ScriptGenerationParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildStoryBibleSystemPrompt(),
    userPrompt: buildStoryBibleUserPrompt(params),
  };
}
