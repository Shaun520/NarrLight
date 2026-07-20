/**
 * 分幕结构（Act Structure）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 1b 产出，对标 story-bible.ts 的结构。
 * 输入：阶段 0 设定本（StoryBibleJson）+ 创作参数（ScriptGenerationParams）
 * 输出：分幕结构（ActStructureJson），含幕次、场景、搜证轮次
 * 关键约束：搜证轮次为阶段 3 线索卡提供地点框架；伏笔 plantAct 需在对应幕次落地
 */
import type {
  ScriptGenerationParams,
  AgeRating,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';

export type { ScriptGenerationParams, AgeRating, WritingStyle };

/** 分幕结构入参 */
export interface ActStructureParams {
  /** 创作参数 */
  params: ScriptGenerationParams;
  /** 阶段 0 设定本 */
  storyBible: StoryBibleJson;
}

/** 搜证轮次（为阶段 3 线索卡提供地点框架） */
export interface SearchRound {
  /** 轮次序号 */
  round: number;
  /** 本轮可搜证地点列表 */
  locations: string[];
}

/** 单个场景 */
export interface ActScene {
  /** 场景标题 */
  title: string;
  /** 场景地点 */
  location: string;
  /** 场景概述（不展开完整内容，仅描述本场景发生什么） */
  content: string;
  /** 排序序号 */
  sortOrder: number;
}

/** 单个幕次 */
export interface ActStructure {
  /** 幕次标题（如「第一幕 · 风雨欲来」） */
  title: string;
  /** 排序序号 */
  sortOrder: number;
  /** 本幕概述 */
  content: string;
  /** 本幕包含的场景 */
  scenes: ActScene[];
  /** 本幕的搜证轮次 */
  searchRounds: SearchRound[];
}

/** AI 返回的分幕结构 JSON */
export interface ActStructureJson {
  /** 幕次列表 */
  acts: ActStructure[];
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
 * 构造系统提示词：角色设定 + 产出约束 + 输出格式要求（结构化 JSON）
 */
export function buildActStructureSystemPrompt(): string {
  return `你是一名资深剧本杀结构设计师，擅长构思节奏紧凑、逻辑严密的分幕结构。

请根据用户提供的设定本（Story Bible）与创作参数，生成剧本的分幕结构。设定本是阶段 0 的产出，已确定时间线大纲与伏笔清单，你需要在此时展开为具体的幕次划分、每幕场景与搜证轮次。

请产出 3-5 个幕次，每幕包含若干场景与搜证轮次。搜证轮次将为阶段 3 的线索卡提供地点框架。

你必须严格遵守以下要求：

1. 幕次数量应为 3-5 个，与设定本时间线大纲的事件节点对应
2. 每幕的 scenes 不得为空，每个场景需有明确的 location
3. 搜证轮次的 locations 不得为空，为阶段 3 线索卡提供可搜证地点
4. 设定本 foreshadowingPlan 中 plantAct 对应的幕次必须能在 scenes 中落地伏笔
5. 严格遵循用户指定的题材、难度、适龄分级与写作风格
6. 禁止展开完整人物对白、完整场景描写；仅产出结构级分幕框架

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "acts": [
    {
      "title": "第一幕 · 风雨欲来",
      "sortOrder": 1,
      "content": "本幕概述：族人齐聚沈宅，埋下三条伏笔",
      "scenes": [
        {
          "title": "沈宅堂前",
          "location": "沈宅正厅",
          "content": "族人齐聚，寒暄间暗流涌动",
          "sortOrder": 1
        },
        {
          "title": "密室会谈",
          "location": "沈宅书房",
          "content": "族中长辈密谈秘宝之事",
          "sortOrder": 2
        }
      ],
      "searchRounds": [
        {
          "round": 1,
          "locations": ["沈宅书房暗格", "祠堂东侧厢房", "古镇药铺后院"]
        }
      ]
    },
    {
      "title": "第二幕 · 惊变霜降夜",
      "sortOrder": 2,
      "content": "本幕概述：凶案发生，众人搜证",
      "scenes": [
        {
          "title": "霜降夜宴",
          "location": "沈宅花厅",
          "content": "宴席间突发异状，有人倒地",
          "sortOrder": 1
        }
      ],
      "searchRounds": [
        {
          "round": 1,
          "locations": ["花厅酒器", "死者随身物品"]
        },
        {
          "round": 2,
          "locations": ["后花园枯井", "沈墨尘卧房"]
        }
      ]
    }
  ]
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数与阶段 0 设定本注入自然语言描述
 */
export function buildActStructureUserPrompt(input: ActStructureParams): string {
  const { params, storyBible } = input;

  const lines: string[] = ['创作参数：'];
  lines.push(`剧本标题：${params.title}`);
  lines.push(`题材：${GENRE_LABEL[params.genre]}`);
  lines.push(`玩家人数：${params.players} 人`);
  lines.push(`预计时长：${params.duration} 小时`);
  lines.push(`难度：${DIFFICULTY_LABEL[params.difficulty]}`);
  lines.push(`适龄分级：${AGE_RATING_LABEL[params.ageRating]}`);
  lines.push(`写作风格：${params.writingStyle}`);

  if (params.switches.mechanismRules) {
    lines.push('特殊要求：生成机制规则（机制本，分幕需包含机制环节）');
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
  lines.push('人物关系骨架（分幕需覆盖所有角色）：');
  for (const node of storyBible.characterSkeleton.nodes) {
    lines.push(`- ${node.name}（${node.identity}）`);
  }

  lines.push('');
  lines.push('伏笔清单（plantAct 对应的幕次必须能落地伏笔）：');
  for (const f of storyBible.foreshadowingPlan) {
    lines.push(`- ${f.id}：${f.description}（埋设于第${f.plantAct}幕，回收于第${f.payoffAct}幕）`);
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构生成分幕结构，确保幕次数量与时间线大纲对应，搜证轮次为线索卡提供地点框架。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildActStructurePrompt(input: ActStructureParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildActStructureSystemPrompt(),
    userPrompt: buildActStructureUserPrompt(input),
  };
}
