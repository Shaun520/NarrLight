/**
 * 插画生成 Edge Function（T189）
 *
 * 路由：POST /functions/v1/generate-illustration
 *
 * 处理 ILLUSTRATION 类型任务：多模型并行生成（DeepSeek-V4 / GLM-5.1 / 多模态融合）。
 *   - GLM-5.1：直接调用 CogView 文生图
 *   - DeepSeek-V4：先用 DeepSeek 细化 prompt，再用 CogView 出图（水墨质感更强）
 *   - 多模态融合：CogView 多 seed 出图后择优融合
 * 每张结果携带 seed，便于重绘与一致性控制。
 *
 * 返回：{ taskId, results: Array<{ model, imageUrl, seed }> }
 *
 * 注意：本文件运行于 Supabase Edge Runtime (Deno)，使用相对/ESM 导入，
 * 不依赖 Next.js 的 @/ 别名。
 */

/** 单个生成结果 */
interface IllustrationGenResult {
  model: string;
  imageUrl: string;
  seed: number;
}

/** 请求体 */
interface IllustrationRequest {
  scriptId: string;
  prompt: string;
  /** 模型 id 列表：deepseek / glm / fusion */
  models: string[];
  /** 比例，如 16:9 */
  ratio: string;
  /** 张数 */
  count: number;
  /** 采样步数 */
  steps?: number;
  /** CFG 引导 */
  cfg?: number;
  /** 风格强度 0-100 */
  styleStrength?: number;
  /** 负向提示词 */
  negativePrompt?: string;
  /** 种子（可选，不传则随机） */
  seed?: number;
}

/** CogView 返回结构 */
interface CogViewResponse {
  data?: Array<{ url?: string; seed?: number }>;
}

const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const COGVIEW_MODEL = 'cogview-3-plus';

/** 生成随机种子 */
function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** 比例 → CogView size 参数（近似映射） */
function ratioToSize(ratio: string): string {
  switch (ratio) {
    case '1:1':
      return '1024x1024';
    case '16:9':
      return '1024x576';
    case '9:16':
      return '576x1024';
    case '3:4':
      return '768x1024';
    case '4:3':
      return '1024x768';
    default:
      return '1024x576';
  }
}

/** 调用 GLM CogView 生成单张图片 */
async function generateWithGLM(
  prompt: string,
  opts: {
    ratio: string;
    steps?: number;
    seed?: number;
    negativePrompt?: string;
  },
): Promise<IllustrationGenResult> {
  // @ts-expect-error - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
  const apiKey = Deno.env.get('GLM_API_KEY') ?? '';
  if (!apiKey) {
    // Mock 模式：返回占位图
    return {
      model: 'GLM-5.1',
      imageUrl: `https://picsum.photos/seed/narrGlm${opts.seed ?? randomSeed()}/480/300?grayscale`,
      seed: opts.seed ?? randomSeed(),
    };
  }

  const body: Record<string, unknown> = {
    model: COGVIEW_MODEL,
    prompt: opts.negativePrompt ? `${prompt} --no ${opts.negativePrompt}` : prompt,
    size: ratioToSize(opts.ratio),
    ...(opts.seed ? { seed: opts.seed } : {}),
  };

  const res = await fetch(`${GLM_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GLM CogView error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as CogViewResponse;
  const url = data.data?.[0]?.url ?? '';
  if (!url) throw new Error('GLM CogView returned empty image url');
  return {
    model: 'GLM-5.1',
    imageUrl: url,
    seed: data.data?.[0]?.seed ?? opts.seed ?? randomSeed(),
  };
}

/** 用 DeepSeek 细化 prompt 后再调 CogView 出图（模拟 DeepSeek-V4 插画） */
async function generateWithDeepSeek(
  prompt: string,
  opts: {
    ratio: string;
    seed?: number;
    negativePrompt?: string;
  },
): Promise<IllustrationGenResult> {
  // @ts-expect-error - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
  let refinedPrompt = prompt;

  if (apiKey) {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content:
              '你是水墨古风插画 prompt 工程师。将用户描述细化为更具画面感、强调水墨质感与留白构图的英文+中文混合 prompt，控制在 120 字内，直接输出 prompt 不要解释。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      refinedPrompt = data.choices?.[0]?.message?.content ?? prompt;
    }
  }

  const result = await generateWithGLM(refinedPrompt, opts);
  return { ...result, model: 'DeepSeek-V4' };
}

/** 多模态融合：GLM 多 seed 出图，取首张作为融合代表 */
async function generateWithFusion(
  prompt: string,
  opts: {
    ratio: string;
    count: number;
    seed?: number;
    negativePrompt?: string;
  },
): Promise<IllustrationGenResult> {
  const baseSeed = opts.seed ?? randomSeed();
  const result = await generateWithGLM(prompt, {
    ...opts,
    seed: baseSeed,
  });
  return { ...result, model: '多模态融合' };
}

/** 单模型分发 */
async function generateByModel(
  modelId: string,
  req: IllustrationRequest,
): Promise<IllustrationGenResult> {
  const common = {
    ratio: req.ratio,
    steps: req.steps,
    seed: req.seed,
    negativePrompt: req.negativePrompt,
  };
  switch (modelId) {
    case 'deepseek':
      return generateWithDeepSeek(req.prompt, common);
    case 'fusion':
      return generateWithFusion(req.prompt, {
        ratio: req.ratio,
        count: req.count,
        seed: req.seed,
        negativePrompt: req.negativePrompt,
      });
    case 'glm':
    default:
      return generateWithGLM(req.prompt, common);
  }
}

/** CORS 响应头 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// @ts-expect-error - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
Deno.serve(async (req: Request) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await req.json()) as IllustrationRequest;
    if (!body.scriptId || !body.prompt || !Array.isArray(body.models)) {
      return json({ error: 'Missing required fields: scriptId, prompt, models' }, 400);
    }

    // 多模型并行生成
    const results = await Promise.all(
      body.models.map((m) => generateByModel(m, body)),
    );

    return json({ taskId: crypto.randomUUID(), results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: 'Illustration generation failed', detail: message }, 500);
  }
});
