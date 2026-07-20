/**
 * 难度评估算法（T154）
 *
 * 5 维度评分（0-10）：
 *   1) 线索密度      clueDensity       —— 关键线索在总线索中的占比与分布；
 *   2) 干扰项占比    distractorRatio   —— 干扰线索占比（百分比，越大越难）；
 *   3) 诡计复杂度    trickComplexity   —— 凶手手法链长度 + 叙诡数量；
 *   4) 沉浸门槛      immersionGate     —— 角色背景复杂度 + 玩家人数；
 *   5) 逻辑闭环度    logicClosure      —— 伏笔回收率 + 线索对应率（受校验结果影响）。
 *
 * 综合 overallScore 加权平均；overallLevel 由分数映射为四档：
 *   <4 新手 / <6.5 进阶 / <8 烧脑 / >=8 专家。
 *
 * 注：权重按题材微调（硬核本侧重诡计复杂度，情感本侧重沉浸门槛）。
 */
import type { ScriptGenre } from '@/types';
import type { GeneratedClue, GeneratedScriptJson } from '@/lib/ai/prompts/script-generation';
import type { GroupedIssues } from '@/lib/validation/logic/issue-classifier';

/** 单维度评分 */
export interface DifficultyDimension {
  /** 维度名（中文，对齐原型 .diff-bar-label） */
  name: string;
  /** 0-10 分（干扰项占比以百分数显示，分数仍归一化到 0-10） */
  score: number;
  /** 权重 0-1 */
  weight: number;
}

/** 综合评估结果 */
export interface DifficultyAssessment {
  /** 综合评分 0-10 */
  overallScore: number;
  /** 综合等级（新手 / 进阶 / 烧脑 / 专家） */
  overallLevel: string;
  /** 5 维度评分 */
  dimensions: DifficultyDimension[];
  /** 评估说明（对齐原型 EVALUATION NOTE） */
  note: string;
}

/** 题材权重表 */
const GENRE_WEIGHTS: Record<ScriptGenre, DifficultyDimension['weight'][]> = {
  // 顺序：[线索密度, 干扰项占比, 诡计复杂度, 沉浸门槛, 逻辑闭环度]
  hardcore: [0.2, 0.15, 0.4, 0.1, 0.15],
  emotion: [0.15, 0.1, 0.15, 0.4, 0.2],
  horror: [0.2, 0.15, 0.25, 0.25, 0.15],
  funny: [0.25, 0.25, 0.15, 0.15, 0.2],
  mechanism: [0.25, 0.2, 0.25, 0.1, 0.2],
};

/** 等级映射 */
function levelOf(score: number): string {
  if (score < 4) return '新手';
  if (score < 6.5) return '进阶';
  if (score < 8) return '烧脑';
  return '专家';
}

/**
 * 难度评估器。
 *
 * 静态工具方法，无状态；assess 入参为完整脚本数据 + 当前校验结果。
 */
export class DifficultyAssessor {
  /**
   * 线索密度：关键线索数 / 总线索数 × 10。
   * 关键线索分布越密，玩家越容易锁定真相，难度相应降低。
   */
  calculateClueDensity(clues: GeneratedClue[]): number {
    if (clues.length === 0) return 0;
    const keyCount = clues.filter((c) => c.isKeyClue).length;
    const ratio = keyCount / clues.length;
    // ratio 越高密度越大，但难度越低，故反向打分
    return Math.round((1 - ratio) * 10 * 10) / 10;
  }

  /**
   * 干扰项占比：干扰线索数 / 总线索数。
   * 返回 0-10 分（百分比越大分数越高，难度越高）。
   * 同时供前端直接展示百分数（score × 10）。
   */
  calculateDistractorRatio(clues: GeneratedClue[]): number {
    if (clues.length === 0) return 0;
    const distractorCount = clues.filter((c) => c.isDistractor).length;
    const ratio = distractorCount / clues.length;
    return Math.round(ratio * 10 * 10) / 10;
  }

  /**
   * 诡计复杂度：综合凶手手法链长度与叙诡数量。
   *   - 手法链：murdererMethod 文本长度归一化；
   *   - 叙诡数：tricks 数量直接加权。
   */
  calculateTrickComplexity(script: GeneratedScriptJson, trickCount: number): number {
    const methodLen = script.truth.murdererMethod.length;
    const methodScore = Math.min(6, methodLen / 50); // 上限 6 分
    const trickScore = Math.min(4, trickCount * 2); // 上限 4 分
    return Math.round((methodScore + trickScore) * 10) / 10;
  }

  /**
   * 沉浸门槛：角色背景平均长度 + 玩家人数影响。
   * 背景越复杂、人数越多，门槛越高。
   */
  calculateImmersionGate(script: GeneratedScriptJson, playerCount: number): number {
    const avgBg =
      script.characters.reduce((sum, c) => sum + c.backgroundStory.length, 0) /
      Math.max(1, script.characters.length);
    const bgScore = Math.min(7, avgBg / 30);
    const playerScore = Math.min(3, Math.max(0, (playerCount - 4) * 0.6));
    return Math.round((bgScore + playerScore) * 10) / 10;
  }

  /**
   * 逻辑闭环度：伏笔回收率 + 线索对应率，受校验结果影响。
   * CRITICAL / WARNING 数量越多，闭环度越低。
   */
  calculateLogicClosure(
    script: GeneratedScriptJson,
    grouped: GroupedIssues | null,
  ): number {
    // 基础分：伏笔全部回收得满分
    const totalForeshadow = script.truth.foreshadowing.length;
    const base = totalForeshadow === 0 ? 8 : 8 + Math.min(2, totalForeshadow / 5);

    if (!grouped) return Math.round(Math.min(10, base) * 10) / 10;

    const critical = grouped.CRITICAL.length;
    const warning = grouped.WARNING.length;
    const penalty = critical * 1.5 + warning * 0.6;
    const score = Math.max(0, Math.min(10, base - penalty));
    return Math.round(score * 10) / 10;
  }

  /**
   * 综合评估。
   *
   * @param scriptId 剧本 id（仅用于日志，不参与计算）
   * @param genre 题材，决定权重分布
   * @param script 全本 JSON
   * @param playerCount 玩家人数
   * @param grouped 当前校验结果（可为 null，表示尚未校验）
   * @param trickCount 已识别叙诡数量
   */
  assess(params: {
    scriptId: string;
    genre: ScriptGenre;
    script: GeneratedScriptJson;
    playerCount: number;
    grouped: GroupedIssues | null;
    trickCount: number;
  }): DifficultyAssessment {
    const { genre, script, playerCount, grouped, trickCount } = params;
    const weights = GENRE_WEIGHTS[genre];

    const clueDensity = this.calculateClueDensity(script.clues);
    const distractorRatio = this.calculateDistractorRatio(script.clues);
    const trickComplexity = this.calculateTrickComplexity(script, trickCount);
    const immersionGate = this.calculateImmersionGate(script, playerCount);
    const logicClosure = this.calculateLogicClosure(script, grouped);

    const dimensions: DifficultyDimension[] = [
      { name: '线索密度', score: clueDensity, weight: weights[0] },
      { name: '干扰项占比', score: distractorRatio, weight: weights[1] },
      { name: '诡计复杂度', score: trickComplexity, weight: weights[2] },
      { name: '沉浸门槛', score: immersionGate, weight: weights[3] },
      { name: '逻辑闭环度', score: logicClosure, weight: weights[4] },
    ];

    const overallScore =
      Math.round(
        dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) * 10,
      ) / 10;
    const overallLevel = levelOf(overallScore);

    const note = this.buildNote(genre, dimensions, grouped);

    return { overallScore, overallLevel, dimensions, note };
  }

  /** 构建评估说明 */
  private buildNote(
    genre: ScriptGenre,
    dimensions: DifficultyDimension[],
    grouped: GroupedIssues | null,
  ): string {
    const genreLabel: Record<ScriptGenre, string> = {
      hardcore: '硬核本',
      emotion: '情感本',
      horror: '恐怖本',
      funny: '欢乐本',
      mechanism: '机制本',
    };
    const focus: Record<ScriptGenre, string> = {
      hardcore: '诡计复杂度',
      emotion: '沉浸门槛',
      horror: '沉浸门槛',
      funny: '干扰项占比',
      mechanism: '诡计复杂度',
    };
    const focusDim = dimensions.find((d) => d.name === focus[genre]);
    const focusWeight = focusDim?.weight ?? 0;
    const lines: string[] = [
      `${genreLabel[genre]}侧重${focus[genre]}（权重 ${focusWeight}）。`,
    ];

    if (focusDim) {
      lines.push(
        `当前${focus[genre]}分 ${focusDim.score} ${
          focusDim.score >= 7 ? '较高' : focusDim.score >= 5 ? '适中' : '偏低'
        }，`,
      );
    }

    if (grouped) {
      const critical = grouped.CRITICAL.length;
      const warning = grouped.WARNING.length;
      if (critical > 0) {
        lines.push(`逻辑闭环度偏低，建议优先修复"严重缺陷"${critical} 项后再复评。`);
      } else if (warning > 0) {
        lines.push(`逻辑闭环度尚可，仍有 ${warning} 项局部警告待优化。`);
      } else {
        lines.push('逻辑闭环度良好，可继续打磨沉浸细节。');
      }
    } else {
      lines.push('尚未执行逻辑校验，闭环度仅供参考。');
    }

    return lines.join('');
  }
}

/** 默认单例 */
export const difficultyAssessor = new DifficultyAssessor();
