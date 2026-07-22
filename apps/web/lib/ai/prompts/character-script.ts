/**
 * 角色剧本（Character Script）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 2 产出，每个角色独立一次调用。
 * 输入：设定本（StoryBibleJson）+ 该角色人物设定（CharacterProfile）+ 分幕结构（ActStructureJson）
 * 输出：该角色的完整剧本（CharacterScriptJson），含各幕内容、个人剧情线、可见线索
 * 关键约束：视角过滤——凶手本拿到完整作案过程，平民本仅拿到该角色能感知的部分
 */
import type {
  ScriptGenerationParams,
  AgeRating,
  WritingStyle,
} from '@/lib/ai/prompts/script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { CharacterProfile } from '@/lib/ai/prompts/character-profiles';
import type { ActStructureJson } from '@/lib/ai/prompts/act-structure';
import type { GenerationSpec } from '@/lib/generation/spec';

export type { ScriptGenerationParams, AgeRating, WritingStyle };

/** 角色剧本入参 */
export interface CharacterScriptParams {
  /** 创作参数 */
  params: ScriptGenerationParams;
  /** 阶段 0 设定本 */
  storyBible: StoryBibleJson;
  /** 该角色的人物设定 */
  character: CharacterProfile;
  /** 阶段 1b 分幕结构 */
  actStructure: ActStructureJson;
  spec?: GenerationSpec;
  part?: {
    index: number;
    label: string;
    actOrder?: number;
  };
}

/** 单个幕次的角色剧本内容 */
export interface CharacterActScript {
  /** 对应的幕次标题 */
  actTitle: string;
  /** 该角色在此幕的剧本正文（第一人称或第三人称，依据 writingStyle） */
  content: string;
  /** 该角色在此幕参与的场景 */
  scenes: {
    /** 场景标题 */
    title: string;
    /** 该角色在此场景的所见所闻 */
    content: string;
  }[];
}

/** AI 返回的角色剧本结构化 JSON */
export interface CharacterScriptJson {
  /** 角色姓名 */
  characterName: string;
  /** 各幕剧本内容 */
  actScripts: CharacterActScript[];
  /** 该角色个人剧情线概述 */
  personalArc: string;
  /** 该角色可见的线索标题列表（为阶段 3 线索卡分配提供依据） */
  visibleClueTitles: string[];
  /** 视角备注（说明该角色不知道哪些信息） */
  perspectiveNote: string;
}

// ===== 题材/难度/分级中文映射（注入 prompt 用） =====
// 注：为避免循环依赖，常量值在此独立定义，但与 script-generation.ts / story-bible.ts / character-profiles.ts / act-structure.ts 保持一致。

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
 * 构造系统提示词：根据是否为凶手切换视角约束
 */
export function buildCharacterScriptSystemPrompt(isMurderer: boolean): string {
  const perspectiveConstraint = isMurderer
    ? `本角色为凶手，你将拿到完整设定本（含凶手身份与作案过程）。撰写时：
- 可以包含凶手的作案过程、反侦察细节、真实时间线
- 可以描写凶手内心的算计与伪装
- 但需通过叙述手法让玩家在阅读时不易察觉凶手身份（如使用不可靠叙述者）`
    : `本角色为非凶手，设定本中的凶手身份与作案过程对你不可见。撰写时：
- 仅描写该角色能感知的场景与信息
- 不得包含其他角色的私密剧情、内心独白
- 不得包含凶手作案过程的直接描写
- 可以描写该角色对其他人物的观察、怀疑、误解（但不得泄露真相）
- 不得暴露设定本中的暗线关系（isHidden=true 的边）`;

  return `你是一名资深剧本杀编剧，擅长从特定角色视角撰写沉浸式剧本。

请根据用户提供的设定本、该角色的人物设定与分幕结构，从该角色视角撰写完整剧本。剧本需包含各幕内容、场景描写、个人剧情线，并标注该角色可见的线索。

${perspectiveConstraint}

你必须严格遵守以下要求：

1. 剧本必须覆盖分幕结构的所有幕次，每幕产出该角色的视角内容
2. 每幕的 scenes 需对应分幕结构中的场景，但仅展开该角色参与的部分
3. visibleClueTitles 应为该角色在搜证轮次中可发现的线索标题
4. perspectiveNote 需明确列出该角色不知道的关键信息
5. 严格遵循用户指定的题材、难度、适龄分级与写作风格
6. 剧本字数应充足（每幕 800-1500 字），保证角色戏份饱满

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "characterName": "沈墨白",
  "actScripts": [
    {
      "actTitle": "第一幕 · 风雨欲来",
      "content": "光绪二十六年，霜降。我推开沈宅大门时，寒风裹挟着落叶扑面而来...",
      "scenes": [
        {
          "title": "沈宅堂前",
          "content": "堂前已聚了几位族人，我一眼便看出各怀心思..."
        }
      ]
    }
  ],
  "personalArc": "从寻宝者到发现家族秘辛的心理转变",
  "visibleClueTitles": ["族谱残页", "朱砂印匿名信"],
  "perspectiveNote": "本角色不知道沈墨尘的私生子身份，也不知道'霜降夜'的真实日期"
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数、人物设定、设定本与分幕结构注入自然语言描述
 */
export function buildCharacterScriptUserPrompt(input: CharacterScriptParams): string {
  const { params, storyBible, character, actStructure, spec, part } = input;
  const lines: string[] = ['创作参数：'];
  lines.push(`剧本标题：${params.title}`);
  lines.push(`题材：${GENRE_LABEL[params.genre]}`);
  lines.push(`玩家人数：${params.players} 人`);
  lines.push(`预计时长：${params.duration} 小时`);
  lines.push(`难度：${DIFFICULTY_LABEL[params.difficulty]}`);
  lines.push(`适龄分级：${AGE_RATING_LABEL[params.ageRating]}`);
  lines.push(`写作风格：${params.writingStyle}`);

  if (spec) {
    lines.push('');
    lines.push('最低字数规格（必须满足）：');
    lines.push(`- 本玩家所有剧本合计不少于 ${spec.minCharacterScriptWords} 字`);
    lines.push(`- 当前这一本玩家剧本不少于 ${spec.minWordsPerCharacterScriptPiece} 字`);
    lines.push(`- 每名玩家 ${spec.scriptsPerPlayer} 本玩家剧本，全本共 ${spec.totalCharacterScriptCount} 本`);
    if (part?.actOrder) {
      lines.push(`- 当前只覆盖第 ${part.actOrder} 幕，并让内容服务于角色视角与搜证推进`);
    } else {
      lines.push(`- 必须覆盖 ${spec.actCount} 幕，并让每幕内容服务于角色视角与搜证推进`);
    }
  }
  if (part) {
    lines.push('');
    lines.push('当前玩家剧本：');
    lines.push(`- 当前剧本：第 ${part.index} 本（${part.label}）`);
    if (part.actOrder) {
      lines.push(`- 当前只生成第 ${part.actOrder} 幕对应的角色剧本内容`);
    }
  }

  if (params.switches.noEdgeRole) {
    lines.push('特殊要求：无边缘位（所有角色戏份均衡）');
  }
  if (params.extraReq) {
    lines.push(`附加要求：${params.extraReq}`);
  }

  lines.push('');
  lines.push('该角色人物设定（你是从此角色视角撰写）：');
  lines.push(`姓名：${character.name}`);
  lines.push(`身份：${character.roleIdentity}`);
  lines.push(`性别：${character.gender === 'male' ? '男' : character.gender === 'female' ? '女' : '未知'}`);
  lines.push(`年龄：${character.age ?? '未指定'}`);
  lines.push(`性格：${character.personality}`);
  lines.push(`背景故事：${character.backgroundStory}`);
  lines.push(`个人任务：${character.personalTask}`);
  lines.push(`是否为凶手：${character.isMurderer ? '是' : '否'}`);

  lines.push('');
  lines.push('设定本（阶段 0 产出）：');
  if (character.isMurderer) {
    lines.push(`凶手：${storyBible.murdererName}（即本角色）`);
    lines.push(`凶案手法：${storyBible.murderMethod}`);
    lines.push(`核心诡计：${storyBible.coreTrick}`);
    lines.push(`动机链：${storyBible.motiveChain}`);
    lines.push(`时间线大纲：${storyBible.timelineOutline}`);
    lines.push(`真相梗概：${storyBible.truthSummary}`);
  } else {
    lines.push(`凶案手法：${storyBible.murderMethod}（此为本角色可知的公开信息）`);
    lines.push(`时间线大纲：${storyBible.timelineOutline}`);
    lines.push(`真相梗概：（本角色不知道完整真相，请在剧本中体现认知局限）`);
  }

  lines.push('');
  lines.push('人物关系骨架：');
  for (const node of storyBible.characterSkeleton.nodes) {
    lines.push(`- ${node.name}（${node.identity}）：${node.secret}`);
  }
  for (const edge of storyBible.characterSkeleton.edges) {
    if (character.isMurderer) {
      lines.push(`- ${edge.from} → ${edge.to}（${edge.type}）：${edge.label}${edge.isHidden ? ' [暗线]' : ''}`);
    } else if (!edge.isHidden) {
      lines.push(`- ${edge.from} → ${edge.to}（${edge.type}）：${edge.label}`);
    }
  }

  lines.push('');
  lines.push('伏笔清单：');
  for (const f of storyBible.foreshadowingPlan) {
    lines.push(`- ${f.id}：${f.description}（埋设于第${f.plantAct}幕，回收于第${f.payoffAct}幕）`);
  }

  lines.push('');
  lines.push('分幕结构（阶段 1b 产出，剧本需覆盖所有幕次）：');
  for (const act of actStructure.acts) {
    lines.push(`- 第${act.sortOrder}幕 ${act.title}：${act.content}`);
    for (const scene of act.scenes) {
      lines.push(`  · 场景 ${scene.sortOrder}：${scene.title}（${scene.location}）`);
    }
    for (const sr of act.searchRounds) {
      lines.push(`  · 搜证轮次 ${sr.round}：${sr.locations.join('、')}`);
    }
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构从该角色视角撰写完整剧本，确保覆盖所有幕次，视角过滤符合约束。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildCharacterScriptPrompt(input: CharacterScriptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { character } = input;
  return {
    systemPrompt: buildCharacterScriptSystemPrompt(character.isMurderer),
    userPrompt: buildCharacterScriptUserPrompt(input),
  };
}
