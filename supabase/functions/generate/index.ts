/**
 * FULL_SCRIPT 类型 Edge Function - 流式生成剧本
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 调用 DeepSeekProvider.generateStream 流式生成
 *   2. 通过 SSE 推送 progress / chunk 事件
 *   3. 生成完成后用 parseJSONWithTolerance 解析 JSON 结果
 *   4. 调用 ScriptImportService.importGeneratedScript 结构化入库
 *   5. 返回 completed 事件
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将 service 层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildFullScriptPrompt,
  type GeneratedScriptJson,
  type ScriptGenerationParams,
} from '@/lib/ai/prompts/script-generation';
import { ScriptImportService } from '@/lib/services/script-import-service';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** 入参体 */
interface GenerateRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** SSE 单条事件编码 */
function encodeSse(
  encoder: TextEncoder,
  event: string,
  data: unknown,
): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return encoder.encode(payload);
}

/** 校验入参 */
function validateBody(body: unknown): body is GenerateRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/** 主处理函数 */
async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!validateBody(body)) {
    return new Response(JSON.stringify({ error: 'Invalid parameters' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { scriptId, params } = body;
  const { systemPrompt, userPrompt } = buildFullScriptPrompt(params);
  const provider = new DeepSeekProvider();
  const importService = new ScriptImportService();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'init' }));

        // 1 + 2. 流式生成并推送 chunk / progress
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.7,
          onChunk: (c) => {
            accumulated += c;
          },
        })) {
          if (chunk.content) {
            controller.enqueue(
              encodeSse(encoder, 'chunk', { content: chunk.content }),
            );
          }
          if (typeof chunk.progress === 'number') {
            controller.enqueue(
              encodeSse(encoder, 'progress', {
                percent: Math.round(chunk.progress * 100),
              }),
            );
          }
          if (chunk.done) break;
        }

        // 3. 解析 JSON 结果
        controller.enqueue(
          encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }),
        );
        const generatedJson = parseJSONWithTolerance<GeneratedScriptJson>(accumulated);

        // 4. 结构化入库
        const result = await importService.importGeneratedScript(scriptId, generatedJson);

        // 5. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', { scriptId, result }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encodeSse(encoder, 'error', { message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// @ts-expect-error - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
Deno.serve(handleRequest);
