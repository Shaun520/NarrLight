/**
 * 内容安全与合规预检工具
 *
 * 提供：
 * - 敏感词检测（暴力、色情、政治敏感、恐怖血腥）
 * - 适龄分级合规检查（ALL / TWELVE_PLUS / SIXTEEN_PLUS / EIGHTEEN_PLUS）
 * - 敏感词过滤清理
 *
 * 词表为基础版本，可按需扩展。
 */

/** 适龄分级 */
export type AgeRating = "ALL" | "TWELVE_PLUS" | "SIXTEEN_PLUS" | "EIGHTEEN_PLUS";

/** 分级等级排序（数值越大限制越宽松） */
const RATING_RANK: Record<AgeRating, number> = {
  ALL: 0,
  TWELVE_PLUS: 1,
  SIXTEEN_PLUS: 2,
  EIGHTEEN_PLUS: 3,
};

// 暴力相关敏感词
const VIOLENCE_WORDS: string[] = [
  "杀人",
  "砍杀",
  "刺杀",
  "殴打",
  "虐待",
  "屠杀",
  "凶杀",
  "谋杀",
  "残杀",
  "血腥",
  "肢解",
  "割喉",
  "碎尸",
  "爆头",
  "开膛",
  "扼杀",
  "勒死",
  "毒杀",
  "枪杀",
  "刺穿",
];

// 色情相关敏感词
const SEXUAL_WORDS: string[] = [
  "色情",
  "裸体",
  "性交",
  "强奸",
  "猥亵",
  "淫秽",
  "卖淫",
  "嫖娼",
  "性侵",
  "淫乱",
  "露骨",
  "春宫",
  "勾引",
  "调情",
  "猥琐",
  "色欲",
];

// 政治敏感词
const POLITICAL_WORDS: string[] = [
  "颠覆",
  "分裂国家",
  "反动",
  "暴乱",
  "动乱",
  "政变",
  "独裁",
  "专制",
  "镇压",
  "起义",
  "叛乱",
  "煽动",
  "非法集会",
  "政治犯",
  "异见人士",
  "分裂势力",
];

// 恐怖/血腥描述词
const HORROR_WORDS: string[] = [
  "鬼魂",
  "恶灵",
  "诅咒",
  "邪教",
  "丧尸",
  "亡灵",
  "怨灵",
  "附身",
  "通灵",
  "降头",
  "腐烂",
  "血肉模糊",
  "开颅",
  "挖眼",
  "剥皮",
  "肠子",
  "内脏",
  "断肢",
  "头颅",
  "血池",
];

/**
 * 全部敏感词集合（用于通用安全检查与内容过滤）
 */
const SENSITIVE_WORDS: string[] = [
  ...VIOLENCE_WORDS,
  ...SEXUAL_WORDS,
  ...POLITICAL_WORDS,
  ...HORROR_WORDS,
];

/** 适龄分级检查的分类规则 */
interface CategoryRule {
  /** 分类名称 */
  name: string;
  /** 该分类的词表 */
  words: string[];
  /** 允许该分类所需的最低分级；null 表示任何分级均不允许 */
  minRating: AgeRating | null;
}

const CATEGORY_RULES: CategoryRule[] = [
  { name: "暴力", words: VIOLENCE_WORDS, minRating: "SIXTEEN_PLUS" },
  { name: "恐怖血腥", words: HORROR_WORDS, minRating: "SIXTEEN_PLUS" },
  { name: "色情", words: SEXUAL_WORDS, minRating: "EIGHTEEN_PLUS" },
  { name: "政治敏感", words: POLITICAL_WORDS, minRating: null },
];

/** 内容安全检查结果 */
export interface ContentSafetyResult {
  /** 是否安全（未命中敏感词） */
  safe: boolean;
  /** 命中的敏感词列表 */
  flaggedWords: string[];
}

/** 适龄分级检查结果 */
export interface AgeRatingResult {
  /** 是否符合分级要求 */
  compliant: boolean;
  /** 不合规的问题描述列表 */
  issues: string[];
}

/**
 * 检查内容是否包含敏感词。
 * @param content 待检查内容
 * @returns 安全状态与命中的敏感词列表
 */
export function checkContentSafety(content: string): ContentSafetyResult {
  const flaggedWords: string[] = [];
  for (const word of SENSITIVE_WORDS) {
    if (content.includes(word)) {
      flaggedWords.push(word);
    }
  }
  return { safe: flaggedWords.length === 0, flaggedWords };
}

/**
 * 检查内容是否符合指定适龄分级要求。
 * 16+ 允许暴力与恐怖血腥内容，18+ 额外允许色情内容；
 * 政治敏感内容在任何分级下均不合规。
 * @param content 待检查内容
 * @param rating 目标适龄分级
 */
export function checkAgeRating(
  content: string,
  rating: AgeRating,
): AgeRatingResult {
  const issues: string[] = [];
  const ratingRank = RATING_RANK[rating];

  for (const rule of CATEGORY_RULES) {
    const found = rule.words.filter((word) => content.includes(word));
    if (found.length === 0) continue;

    if (rule.minRating === null) {
      issues.push(`包含${rule.name}内容：${found.join("、")}`);
    } else if (ratingRank < RATING_RANK[rule.minRating]) {
      issues.push(`当前分级不允许${rule.name}内容：${found.join("、")}`);
    }
  }

  return { compliant: issues.length === 0, issues };
}

/**
 * 清理内容中的敏感词，将其替换为等长的星号（*）。
 * 按词长度降序替换，优先处理更长的词以避免部分替换。
 * @param content 待清理内容
 */
export function sanitizeContent(content: string): string {
  const sortedWords = [...SENSITIVE_WORDS].sort((a, b) => b.length - a.length);
  let result = content;
  for (const word of sortedWords) {
    if (result.includes(word)) {
      const stars = "*".repeat(word.length);
      result = result.split(word).join(stars);
    }
  }
  return result;
}
