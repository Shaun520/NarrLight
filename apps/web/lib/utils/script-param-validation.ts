/**
 * 剧本创作参数合理性校验（T503）
 *
 * 从 components/generate/param-form.tsx 中提取的共享校验逻辑，
 * 供 generate 页复用。
 *
 * 校验规则：
 *   - 标题为空 → 提示填写标题
 *   - 题材为 hardcore 且 players ≤ 4 → 提示硬核本人数过少
 *   - players ≥ 7 且 duration ≤ 2 → 提示时长过短
 *
 * 返回值：提示文案（命中规则时）或 null（参数合理时）。
 */

/** 校验入参：剧本创作基础参数 */
export interface ScriptParamInput {
  title: string;
  genre: string;
  players: number;
  duration: number;
  difficulty: string;
  background?: string;
  theme?: string;
}

/** 校验结果类型：提示文案或 null */
export type ScriptParamHint = string | null;

/**
 * 校验剧本创作参数合理性
 *
 * @param params 剧本创作参数
 * @returns 命中规则时返回提示文案，参数合理时返回 null
 */
export function validateScriptParams(
  params: ScriptParamInput,
): ScriptParamHint {
  if (!params.title.trim()) return '请填写剧本标题';
  if (params.players <= 4 && params.genre === 'hardcore') {
    return '提示：4 人硬核本推理密度高，线索分发空间有限，建议 5 人以上以保证体验均衡。';
  }
  if (params.players >= 7 && params.duration <= 2) {
    return '提示：7 人以上剧本搭配 2 小时以内时长，单人物戏份可能偏少，建议延长至 3 小时以上。';
  }
  return null;
}
