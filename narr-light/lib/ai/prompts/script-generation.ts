/**
 * 全本生成 Prompt 模板（FULL_SCRIPT）
 *
 * 定义 ScriptGenerationParams 与生成结果 JSON 结构，
 * 提供 system / user / 完整 prompt 构造函数。
 * 输出要求 AI 返回结构化 JSON：{ characters, acts, clues, truth }
 */
import type { ScriptDifficulty, ScriptGenre } from '@/types';

/** 适龄分级 */
export type AgeRating = 'ALL' | 'TWELVE_PLUS' | 'SIXTEEN_PLUS' | 'EIGHTEEN_PLUS';

/** 写作风格 */
export type WritingStyle = '古风沉稳' | '白描清雅' | '悬疑冷峻' | '诙谐明快';

/** 生成参数开关 */
export interface ScriptSwitches {
  /** 无边缘位（戏份均衡） */
  noEdgeRole: boolean;
  /** 合规预检（屏蔽敏感词） */
  compliancePreCheck: boolean;
  /** 生成机制规则（机制本） */
  mechanismRules: boolean;
}

/** 全本生成入参 */
export interface ScriptGenerationParams {
  title: string;
  genre: ScriptGenre;
  players: number; // 4-8
  duration: number; // 2-8h
  difficulty: ScriptDifficulty;
  background: string;
  theme: string;
  ageRating: AgeRating;
  writingStyle: WritingStyle;
  switches: ScriptSwitches;
  extraReq: string;
}

// ===== AI 生成结果 JSON 结构 =====

/** 生成的人物 */
export interface GeneratedCharacter {
  name: string;
  roleIdentity: string;
  gender: 'male' | 'female' | 'unknown';
  age: number | null;
  personality: string;
  backgroundStory: string;
  personalTask: string;
  isMurderer: boolean;
}

/** 生成的场景 */
export interface GeneratedScene {
  title: string;
  location: string;
  content: string;
  sortOrder: number;
}

/** 生成的幕次 */
export interface GeneratedAct {
  title: string;
  sortOrder: number;
  content: string;
  scenes: GeneratedScene[];
}

/** 生成的线索 */
export interface GeneratedClue {
  title: string;
  content: string;
  clueType: 'physical' | 'testimony' | 'deep' | 'hidden';
  searchRound: number;
  location: string;
  relatedCharacterNames: string[];
  isDistractor: boolean;
  isKeyClue: boolean;
  unlockCondition: string;
}

/** 生成的真相复盘 */
export interface GeneratedTruth {
  summary: string;
  murdererMethod: string;
  motive: string;
  timeline: string;
  foreshadowing: string[];
}

/** AI 返回的完整结构化 JSON */
export interface GeneratedScriptJson {
  characters: GeneratedCharacter[];
  acts: GeneratedAct[];
  clues: GeneratedClue[];
  truth: GeneratedTruth;
}

// ===== 题材/难度/分级中文映射（注入 prompt 用） =====

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
 * 构造系统提示词：角色设定 + 输出格式要求（结构化 JSON）
 */
export function buildSystemPrompt(): string {
  return `你是一名资深剧本杀编剧与剧本杀结构设计师，擅长构思严密的多幕推理剧本。

请根据用户提供的创作参数，生成一部完整的剧本杀全本。你必须严格遵守以下要求：

1. 剧本必须包含完整的人物剧本、分幕结构（含场景）、线索卡与真相复盘；
2. 人物之间需有清晰的关系网与动机链，凶手拥有完整的手法与反侦意识；
3. 线索分轮次设计，区分关键线索与干扰线索，并标注解锁条件；
4. 严格遵循用户指定的题材、难度、适龄分级与写作风格；
5. 严禁出现违反适龄分级的内容（暴力/血腥/敏感词需符合分级要求）。

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "characters": [
    {
      "name": "人物名",
      "roleIdentity": "角色身份",
      "gender": "male|female|unknown",
      "age": 28,
      "personality": "性格特征",
      "backgroundStory": "背景故事",
      "personalTask": "个人任务",
      "isMurderer": false
    }
  ],
  "acts": [
    {
      "title": "第一幕 · 风雨欲来",
      "sortOrder": 1,
      "content": "本幕概述与组织者手册",
      "scenes": [
        {
          "title": "场景标题",
          "location": "场景地点",
          "content": "场景内容描述",
          "sortOrder": 1
        }
      ]
    }
  ],
  "clues": [
    {
      "title": "线索标题",
      "content": "线索内容",
      "clueType": "physical|testimony|deep|hidden",
      "searchRound": 1,
      "location": "线索所在地点",
      "relatedCharacterNames": ["人物名"],
      "isDistractor": false,
      "isKeyClue": true,
      "unlockCondition": "解锁条件"
    }
  ],
  "truth": {
    "summary": "真相复盘总述",
    "murdererMethod": "凶手手法",
    "motive": "杀人动机",
    "timeline": "关键时间线",
    "foreshadowing": ["伏笔1", "伏笔2"]
  }
}

请确保 JSON 合法、字段完整、可被直接解析。`;
}

/**
 * 构造用户提示词：将创作参数注入自然语言描述
 */
export function buildUserPrompt(params: ScriptGenerationParams): string {
  const switchDesc: string[] = [];
  if (params.switches.noEdgeRole) switchDesc.push('无边缘位（所有角色戏份均衡）');
  if (params.switches.compliancePreCheck) switchDesc.push('合规预检（屏蔽敏感词）');
  if (params.switches.mechanismRules) switchDesc.push('生成机制规则（机制本）');

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

  if (switchDesc.length > 0) {
    lines.push(`特殊要求：${switchDesc.join('；')}`);
  }
  if (params.extraReq) {
    lines.push(`附加要求：${params.extraReq}`);
  }

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构生成完整剧本。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildFullScriptPrompt(params: ScriptGenerationParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(params),
  };
}
