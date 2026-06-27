/**
 * 插画生成协调服务
 *
 * 封装插画生成的 Mock 逻辑与未来真实 AI 调用接口。
 * 当前为开发期 Mock 实现：使用 setTimeout 模拟异步生成、批量重绘与高清放大。
 *
 * 方法签名兼容未来接入真实 AI 生成服务（如 Edge Function / 第三方模型 API），
 * 届时只需替换方法体内 Mock 逻辑为真实 fetch 调用，无需改动调用方。
 */

/** 单次生成参数 */
export interface GenerateSingleParams {
  /** 剧本 ID */
  scriptId: string;
  /** 生成提示词 */
  prompt: string;
  /** 模型标识，如 deepseek / glm / fusion */
  model: string;
  /** 画面比例，如 1:1 / 16:9 / 3:4 */
  ratio: string;
  /** 生成张数 */
  count: number;
}

/** 批量重绘参数 */
export interface BatchRegenerateParams {
  /** 剧本 ID */
  scriptId: string;
  /** 需要重绘的资产 ID 列表 */
  assetIds: string[];
}

/** 单次生成结果 */
export interface GenerateResult {
  /** 资产/版本 ID */
  id: string;
  /** 生成的图片地址（Mock：随机渐变背景 CSS） */
  imageUrl: string;
  /** 使用的模型名 */
  model: string;
  /** 随机种子 */
  seed: number;
}

/** 高清放大结果 */
export interface UpscaleResult {
  /** 资产 ID */
  id: string;
  /** 放大后图片地址（Mock：渐变背景 CSS） */
  imageUrl: string;
}

/** 进度回调：percent 0-100，message 为当前状态文案 */
export type ProgressCallback = (percent: number, message: string) => void;

/** 随机渐变色调色板（Mock 生成图，色调各异） */
const GRADIENT_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['rgba(176,141,87,0.45)', 'rgba(26,20,16,0.65)'],
  ['rgba(74,124,89,0.42)', 'rgba(15,26,20,0.65)'],
  ['rgba(58,90,122,0.45)', 'rgba(20,26,42,0.65)'],
  ['rgba(138,28,28,0.4)', 'rgba(42,26,26,0.65)'],
  ['rgba(106,74,138,0.42)', 'rgba(26,20,42,0.65)'],
];

/** 默认渐变兜底色（防止取色失败） */
const FALLBACK_GRADIENT: readonly [string, string] = [
  'rgba(58,42,26,0.5)',
  'rgba(26,20,16,0.65)',
];

/** 生成随机渐变背景 CSS（基于种子选取色调与高光位置） */
function randomGradient(seed: number): string {
  const palette = GRADIENT_PALETTE[seed % GRADIENT_PALETTE.length] ?? FALLBACK_GRADIENT;
  const [c1, c2] = palette;
  const px = 30 + (seed % 40);
  const py = 20 + (seed % 50);
  return `radial-gradient(circle at ${px}% ${py}%, ${c1}, transparent 60%), linear-gradient(135deg, ${c2} 0%, rgba(26,20,16,0.5) 100%)`;
}

/** 生成随机种子（1000-9999） */
function randomSeed(): number {
  return Math.floor(Math.random() * 9000) + 1000;
}

/** 延时工具（Mock 异步） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 插画生成协调服务
 *
 * 当前为 Mock 实现，方法签名兼容未来真实 AI 调用。
 * 替换为真实服务时，仅需在各方法体内将 Mock 逻辑改为 fetch / Edge Function 调用。
 */
export class IllustrationGenerateService {
  /**
   * 单次生成（Mock：setTimeout 约 3 秒，返回随机渐变图）。
   * 进度通过 onProgress 回调实时反馈（0-100）。
   * @param params     生成参数
   * @param onProgress 进度回调
   * @returns 生成结果（图片地址、模型、种子）
   */
  async generateSingle(
    params: GenerateSingleParams,
    onProgress?: ProgressCallback,
  ): Promise<GenerateResult> {
    const total = 3000;
    const step = 300;
    let elapsed = 0;
    onProgress?.(5, `正在生成 · ${params.model}`);

    while (elapsed < total) {
      await delay(step);
      elapsed += step;
      const percent = Math.min(95, Math.round((elapsed / total) * 100));
      onProgress?.(percent, `生成中 ${percent}%`);
    }

    const seed = randomSeed();
    onProgress?.(100, '生成完成');
    return {
      id: `gen-${Date.now()}-${seed}`,
      imageUrl: randomGradient(seed),
      model: params.model,
      seed,
    };
  }

  /**
   * 批量重绘（Mock：逐张 setTimeout，每张 1.5 秒）。
   * 进度回调中 percent 为整体进度，message 为当前处理的资产序号文案。
   * @param params     批量参数（资产 ID 列表）
   * @param onProgress 进度回调
   * @returns 每张资产的重绘结果（顺序与 assetIds 一致）
   */
  async batchRegenerate(
    params: BatchRegenerateParams,
    onProgress?: ProgressCallback,
  ): Promise<GenerateResult[]> {
    const { assetIds } = params;
    const results: GenerateResult[] = [];
    const perAsset = 1500;

    for (let i = 0; i < assetIds.length; i += 1) {
      const assetId = assetIds[i];
      onProgress?.(
        Math.round((i / assetIds.length) * 100),
        `正在重绘 ${i + 1}/${assetIds.length}`,
      );
      await delay(perAsset);
      const seed = randomSeed();
      results.push({
        id: assetId,
        imageUrl: randomGradient(seed),
        model: 'GLM-5.1',
        seed,
      });
    }

    onProgress?.(100, '批量重绘完成');
    return results;
  }

  /**
   * 高清放大（Mock：setTimeout 约 2 秒）。
   * @param assetId    资产 ID
   * @param onProgress 进度回调
   * @returns 放大结果（图片地址）
   */
  async upscale(
    assetId: string,
    onProgress?: ProgressCallback,
  ): Promise<UpscaleResult> {
    const total = 2000;
    const step = 400;
    let elapsed = 0;
    onProgress?.(10, '正在放大');

    while (elapsed < total) {
      await delay(step);
      elapsed += step;
      const percent = Math.min(95, Math.round((elapsed / total) * 100));
      onProgress?.(percent, `放大中 ${percent}%`);
    }

    const seed = randomSeed();
    onProgress?.(100, '放大完成');
    return { id: assetId, imageUrl: randomGradient(seed) };
  }
}

/** 服务单例（无状态，可直接复用） */
export const illustrationGenerateService = new IllustrationGenerateService();
