/**
 * 线索卡（Clues）Prompt 模板
 *
 * 分阶段剧本生成方案的阶段 3a 产出，对标 story-bible.ts 的结构。
 * 输入：设定本（StoryBibleJson）+ 分幕结构（ActStructureJson）+ 创作参数
 * 输出：线索卡集合（CluesJson），含物证/口供/深入/隐藏四类
 * 关键约束：对齐设定本 foreshadowingPlan 中的伏笔线索；区分关键与干扰线索
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

/** 线索卡入参 */
export interface CluesParams {
  /** 创作参数 */
  params: ScriptGenerationParams;
  /** 阶段 0 设定本 */
  storyBible: StoryBibleJson;
  /** 阶段 1b 分幕结构 */
  actStructure: ActStructureJson;
}

/** 单个线索卡 */
export interface Clue {
  /** 线索标题 */
  title: string;
  /** 线索内容 */
  content: string;
  /** 线索类型 */
  clueType: 'physical' | 'testimony' | 'deep' | 'hidden';
  /** 搜证轮次 */
  searchRound: number;
  /** 线索所在地点（需对齐分幕结构的 searchRounds.locations） */
  location: string;
  /** 关联人物姓名列表 */
  relatedCharacterNames: string[];
  /** 是否为干扰线索 */
  isDistractor: boolean;
  /** 是否为关键线索 */
  isKeyClue: boolean;
  /** 解锁条件 */
  unlockCondition: string;
  /** 关联的伏笔 ID（若该线索对应设定本中的伏笔，则填写伏笔 ID，否则为空字符串） */
  foreshadowingId: string;
}

/** AI 返回的线索卡集合 JSON */
export interface CluesJson {
  /** 线索列表 */
  clues: Clue[];
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
export function buildCluesSystemPrompt(): string {
  return `你是一名资深剧本杀线索设计师，擅长设计逻辑严密、层次分明的线索网络。

请根据用户提供的设定本、分幕结构与创作参数，设计完整的线索卡集合。线索需覆盖物证、口供、深入、隐藏四类，区分关键线索与干扰线索。

你必须严格遵守以下要求：

1. 每个搜证轮次至少设计 3-5 条线索
2. 线索的 location 必须对齐分幕结构 searchRounds 中的 locations
3. 关键线索（isKeyClue=true）需指向真相核心，数量控制在总线索的 30%-40%
4. 干扰线索（isDistractor=true）需合理但指向错误方向
5. 设定本 foreshadowingPlan 中的每条伏笔应至少对应一条线索，并填写 foreshadowingId
6. relatedCharacterNames 中的姓名必须与设定本骨架 nodes 一致
7. 严格遵循用户指定的题材、难度、适龄分级与写作风格

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "clues": [
    {
      "title": "酒中残渣",
      "content": "死者杯底残留白色粉末，嗅之有轻微麻舌感",
      "clueType": "physical",
      "searchRound": 1,
      "location": "花厅酒器",
      "relatedCharacterNames": ["沈墨白", "沈墨尘"],
      "isDistractor": false,
      "isKeyClue": true,
      "unlockCondition": "搜证轮次 1 自动获得",
      "foreshadowingId": ""
    },
    {
      "title": "侍女口供",
      "content": "侍女称霜降夜曾见二少爷在书房外徘徊",
      "clueType": "testimony",
      "searchRound": 1,
      "location": "沈宅书房",
      "relatedCharacterNames": ["沈墨尘"],
      "isDistractor": false,
      "isKeyClue": false,
      "unlockCondition": "与侍女对话并出示信物",
      "foreshadowingId": "F1"
    },
    {
      "title": "族谱过继批注",
      "content": "族谱残页边缘以朱笔批注'过继'二字，墨色与新墨一致",
      "clueType": "deep",
      "searchRound": 2,
      "location": "祠堂东侧厢房",
      "relatedCharacterNames": ["沈墨尘"],
      "isDistractor": false,
      "isKeyClue": true,
      "unlockCondition": "搜证轮次 2 通过鉴识检定",
      "foreshadowingId": "F1"
    },
    {
      "title": "密室暗格中的信件",
      "content": "暗格藏有一封未署名信件，提及'十年之约'，落款为私生子生母",
      "clueType": "hidden",
      "searchRound": 2,
      "location": "沈宅书房暗格",
      "relatedCharacterNames": ["沈墨尘"],
      "isDistractor": true,
      "isKeyClue": false,
      "unlockCondition": "在书房暗格触发机关后方可获得",
      "foreshadowingId": ""
    }
  ]
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数、设定本与分幕结构注入自然语言描述
 */
export function buildCluesUserPrompt(input: CluesParams): string {
  const { params, storyBible, actStructure } = input;

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
  lines.push('设定本（阶段 0 产出）：');
  lines.push(`凶手：${storyBible.murdererName}`);
  lines.push(`凶案手法：${storyBible.murderMethod}`);
  lines.push(`核心诡计：${storyBible.coreTrick}`);
  lines.push(`动机链：${storyBible.motiveChain}`);
  lines.push(`时间线大纲：${storyBible.timelineOutline}`);
  lines.push(`真相梗概：${storyBible.truthSummary}`);

  lines.push('');
  lines.push('人物关系骨架（relatedCharacterNames 需与此一致）：');
  for (const node of storyBible.characterSkeleton.nodes) {
    lines.push(`- ${node.name}（${node.identity}）`);
  }

  lines.push('');
  lines.push('伏笔清单（每条伏笔至少对应一条线索）：');
  for (const f of storyBible.foreshadowingPlan) {
    lines.push(`- ${f.id}：${f.description}（埋设于第${f.plantAct}幕，回收于第${f.payoffAct}幕）`);
  }

  lines.push('');
  lines.push('分幕结构与搜证轮次（location 需对齐）：');
  for (const act of actStructure.acts) {
    lines.push(`【第${act.sortOrder}幕】${act.title}`);
    for (const scene of act.scenes) {
      lines.push(`  - 场景：${scene.title}（地点：${scene.location}）`);
    }
    for (const round of act.searchRounds) {
      lines.push(`  - 搜证轮次 ${round.round}：${round.locations.join('、')}`);
    }
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构生成线索卡集合，确保覆盖所有搜证轮次，伏笔线索填写 foreshadowingId。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildCluesPrompt(input: CluesParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildCluesSystemPrompt(),
    userPrompt: buildCluesUserPrompt(input),
  };
}
