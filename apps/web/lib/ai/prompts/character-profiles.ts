/**
 * 人物设定（Character Profiles）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 1a 产出，对标 story-bible.ts 的结构。
 * 输入：阶段 0 设定本（StoryBibleJson）+ 创作参数（ScriptGenerationParams）
 * 输出：每个角色的完整人物设定（CharacterProfileJson）
 * 关键约束：人物数量、姓名、凶手身份必须与设定本一致
 */
import type {
  ScriptGenerationParams,
  AgeRating,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';

export type { ScriptGenerationParams, AgeRating, WritingStyle };

/** 人物设定入参 */
export interface CharacterProfilesParams {
  /** 创作参数 */
  params: ScriptGenerationParams;
  /** 阶段 0 设定本 */
  storyBible: StoryBibleJson;
}

/** 单个人物设定（扩展自 GeneratedCharacter，增加 secretFromBible） */
export interface CharacterProfile {
  /** 人物姓名（必须与设定本骨架一致） */
  name: string;
  /** 角色身份 */
  roleIdentity: string;
  /** 性别 */
  gender: 'male' | 'female' | 'unknown';
  /** 年龄 */
  age: number | null;
  /** 性格特征 */
  personality: string;
  /** 背景故事 */
  backgroundStory: string;
  /** 个人任务 */
  personalTask: string;
  /** 是否为凶手（必须与设定本一致） */
  isMurderer: boolean;
  /** 对齐设定本骨架中的 secret 字段 */
  secretFromBible: string;
}

/** AI 返回的人物设定结构化 JSON */
export interface CharacterProfilesJson {
  /** 人物列表，长度必须等于 params.players */
  characters: CharacterProfile[];
}

// ===== 题材/难度/分级中文映射（注入 prompt 用） =====
// 注：为避免循环依赖，常量值在此独立定义，但与 script-generation.ts / story-bible.ts 保持一致。

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
export function buildCharacterProfilesSystemPrompt(): string {
  return `你是一名资深剧本杀人物设计师，擅长塑造立体、差异化、有深度的角色形象。

请根据用户提供的设定本（Story Bible）与创作参数，为剧本中的每个角色生成完整的人物设定。设定本是阶段 0 的产出，已确定凶手身份、人物关系骨架与核心诡计，你需要在此时展开每个角色的细节。

请一次性产出所有角色的人物设定，确保角色间差异化（性格、动机、背景各不相同）。

你必须严格遵守以下要求：

1. 人物数量必须与设定本骨架的 nodes 数量一致
2. 每个人物的 name 必须与设定本骨架 nodes 中的 name 完全一致
3. 凶手的 isMurderer 必须为 true，且凶手姓名必须与设定本的 murdererName 一致
4. 每个人物的 secretFromBible 必须对齐设定本骨架中对应节点的 secret 字段
5. 严格遵循用户指定的题材、难度、适龄分级与写作风格
6. 禁止展开完整人物对白、场景描写、完整角色剧本内容；仅产出人物设定

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "characters": [
    {
      "name": "沈墨白",
      "roleIdentity": "沈家长子",
      "gender": "male",
      "age": 32,
      "personality": "表面持重，实则多疑",
      "backgroundStory": "三年前离乡，携父亲遗物归来...",
      "personalTask": "查明父亲真正死因，寻回家族秘宝",
      "isMurderer": false,
      "secretFromBible": "曾私吞父亲遗物"
    },
    {
      "name": "沈墨尘",
      "roleIdentity": "沈家二子",
      "gender": "male",
      "age": 28,
      "personality": "温文尔雅，城府极深",
      "backgroundStory": "外人眼中的谦谦君子，实为私生子...",
      "personalTask": "夺回继承权，为母亲复仇",
      "isMurderer": true,
      "secretFromBible": "私生子身份"
    }
  ]
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数与设定本注入自然语言描述
 */
export function buildCharacterProfilesUserPrompt(input: CharacterProfilesParams): string {
  const { params, storyBible } = input;
  const lines: string[] = [
    '创作参数：',
    `剧本标题：${params.title}`,
    `题材：${GENRE_LABEL[params.genre]}`,
    `玩家人数：${params.players} 人`,
    `预计时长：${params.duration} 小时`,
    `难度：${DIFFICULTY_LABEL[params.difficulty]}`,
    `适龄分级：${AGE_RATING_LABEL[params.ageRating]}`,
    `写作风格：${params.writingStyle}`,
  ];

  if (params.switches.noEdgeRole) {
    lines.push('特殊要求：无边缘位（所有角色戏份均衡，人物设定需保证每人都有充足戏份）');
  }
  if (params.extraReq) {
    lines.push(`附加要求：${params.extraReq}`);
  }

  lines.push('');
  lines.push('设定本（阶段 0 产出，请严格遵循）：');
  lines.push(`凶手：${storyBible.murdererName}`);
  lines.push(`凶案手法：${storyBible.murderMethod}`);
  lines.push(`核心诡计：${storyBible.coreTrick}`);
  lines.push(`动机链：${storyBible.motiveChain}`);
  lines.push(`时间线大纲：${storyBible.timelineOutline}`);
  lines.push(`真相梗概：${storyBible.truthSummary}`);

  lines.push('');
  lines.push('人物关系骨架（name/identity/secret 必须严格对齐）：');
  for (const node of storyBible.characterSkeleton.nodes) {
    lines.push(`- ${node.name}（${node.identity}）：${node.secret}`);
  }

  lines.push('');
  lines.push('人物关系边：');
  for (const edge of storyBible.characterSkeleton.edges) {
    lines.push(`- ${edge.from} → ${edge.to}（${edge.type}）：${edge.label}${edge.isHidden ? ' [暗线]' : ''}`);
  }

  lines.push('');
  lines.push('伏笔清单（人物设定中可埋设对应伏笔）：');
  for (const f of storyBible.foreshadowingPlan) {
    lines.push(`- ${f.id}：${f.description}（埋设于第${f.plantAct}幕，回收于第${f.payoffAct}幕）`);
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构生成所有角色的人物设定，确保数量、姓名、凶手身份与设定本一致。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildCharacterProfilesPrompt(input: CharacterProfilesParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildCharacterProfilesSystemPrompt(),
    userPrompt: buildCharacterProfilesUserPrompt(input),
  };
}
