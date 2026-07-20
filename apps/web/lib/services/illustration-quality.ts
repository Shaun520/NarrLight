import type { IllustrationTaskType } from '@/types';

export type IllustrationQualityStatus = 'unchecked' | 'passed' | 'warning';

export interface IllustrationQualityResult {
  status: IllustrationQualityStatus;
  message: string;
}

interface EvaluateIllustrationQualityInput {
  taskType: IllustrationTaskType;
  prompt: string;
  ratio: string;
}

const clueCardSignals = ['线索卡成品', '卡片', '卡框', '标题栏', '正文', '说明文字', '成品', '可打印'];
const clueFinishedSignals = ['线索卡成品', '可打印', '标题栏', '卡框'];
const clueObjectOnlySignals = ['配图层', '证据物件', '局部现场', '物件特写', '纯酒瓶', '空酒瓶', '酒瓶', '不要卡牌边框', '不要说明正文'];
const coverSignals = ['封面', '书封', '标题', '作者', '发行信息', '竖版'];
const characterSignals = ['人物立绘', '单人', '半身', '全身', '干净背景'];
const sceneConflictSignals = ['线索卡成品', '卡框', '标题栏', '封面成品', '书封'];

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function evaluateIllustrationQuality(input: EvaluateIllustrationQualityInput): IllustrationQualityResult {
  const prompt = input.prompt;

  if (input.taskType === 'clue') {
    const hasFinishedCardTarget = hasAny(prompt, clueFinishedSignals);
    if (!hasAny(prompt, clueCardSignals) || (!hasFinishedCardTarget && hasAny(prompt, clueObjectOnlySignals))) {
      return {
        status: 'warning',
        message: '配图非卡片成品：当前结果/提示更像单独证物图，建议套用“线索卡成品”参考模板后重绘。',
      };
    }
  }

  if (input.taskType === 'cover') {
    if (input.ratio !== '3:4' && input.ratio !== '9:16') {
      return {
        status: 'warning',
        message: '封面比例不符：剧本封面应优先使用竖版比例，建议切换 3:4 后重绘。',
      };
    }
    if (!hasAny(prompt, coverSignals)) {
      return {
        status: 'warning',
        message: '封面目标不明确：当前提示缺少封面排版信号，可能生成普通场景图。',
      };
    }
  }

  if (input.taskType === 'char' && !hasAny(prompt, characterSignals)) {
    return {
      status: 'warning',
      message: '人物立绘目标不明确：当前提示缺少单人立绘和干净背景约束。',
    };
  }

  if ((input.taskType === 'scene' || input.taskType === 'public') && hasAny(prompt, sceneConflictSignals)) {
    return {
      status: 'warning',
      message: '场景类型混入物料版式：当前提示可能生成卡片或封面成品，建议重绘为纯场景插画。',
    };
  }

  return {
    status: 'passed',
    message: '质检通过：类型目标与生成参数基本匹配。',
  };
}
