/**
 * STORY_BIBLE 类型 Edge Function - 流式生成设定本（阶段 0）
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 调用 buildStoryBiblePrompt 构造 prompt
 *   2. 通过 DeepSeekProvider.generateStream 流式生成
 *   3. SSE 推送 start / chunk / progress 事件
 *   4. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   5. 校验关键字段（节点数=玩家数、凶手在节点列表、payoffAct≥plantAct 等）
 *   6. upsert 到 story_bibles 表 + 插入 generation_tasks 记录
 *   7. 返回 completed 事件
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将 service 层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildStoryBiblePrompt,
  type StoryBibleJson,
} from '@/lib/ai/prompts/story-bible';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import {
  appendKnowledgeToPrompt,
  recordKnowledgeUsages,
  recordQualityReport,
  retrieveStageKnowledge,
} from '@/lib/generation/knowledge';

/** 入参体 */
interface StoryBibleRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** 设定本校验结果 */
interface StoryBibleValidationResult {
  valid: boolean;
  errors: string[];
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
function validateBody(body: unknown): body is StoryBibleRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/**
 * 校验设定本 JSON 结构完整性
 * - 基础字段非空
 * - 人物关系骨架节点数=玩家数
 * - 凶手姓名出现在节点列表中
 * - 每条伏笔 payoffAct ≥ plantAct
 */
function validateStoryBible(json: StoryBibleJson, players: number): StoryBibleValidationResult {
  const errors: string[] = [];

  if (typeof json.murdererName !== 'string' || !json.murdererName) {
    errors.push('murdererName 必须为非空字符串');
  }
  if (typeof json.murderMethod !== 'string' || !json.murderMethod) {
    errors.push('murderMethod 必须为非空字符串');
  }
  if (typeof json.coreTrick !== 'string' || !json.coreTrick) {
    errors.push('coreTrick 必须为非空字符串');
  }
  if (typeof json.motiveChain !== 'string' || !json.motiveChain) {
    errors.push('motiveChain 必须为非空字符串');
  }
  if (typeof json.timelineOutline !== 'string' || !json.timelineOutline) {
    errors.push('timelineOutline 必须为非空字符串');
  }
  if (typeof json.truthSummary !== 'string' || !json.truthSummary) {
    errors.push('truthSummary 必须为非空字符串');
  }

  if (!json.characterSkeleton || typeof json.characterSkeleton !== 'object') {
    errors.push('characterSkeleton 必须为对象');
  } else {
    if (!Array.isArray(json.characterSkeleton.nodes)) {
      errors.push('characterSkeleton.nodes 必须为数组');
    } else {
      if (json.characterSkeleton.nodes.length !== players) {
        errors.push(`characterSkeleton.nodes 长度必须为 ${players}（当前 ${json.characterSkeleton.nodes.length}）`);
      }
      const nodeNames = json.characterSkeleton.nodes.map((n) => n.name);
      if (!nodeNames.includes(json.murdererName)) {
        errors.push(`murdererName "${json.murdererName}" 不在人物节点列表中`);
      }
    }
    if (!Array.isArray(json.characterSkeleton.edges)) {
      errors.push('characterSkeleton.edges 必须为数组');
    }
  }

  if (!Array.isArray(json.foreshadowingPlan)) {
    errors.push('foreshadowingPlan 必须为数组');
  } else {
    for (let i = 0; i < json.foreshadowingPlan.length; i++) {
      const f = json.foreshadowingPlan[i];
      if (f.payoffAct < f.plantAct) {
        errors.push(`foreshadowingPlan[${i}].payoffAct 必须大于等于 plantAct`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** 主处理函数 */
async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!validateBody(body)) {
    return new Response(JSON.stringify({ error: 'Invalid parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { scriptId, params } = body;
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const knowledgeItems = await retrieveStageKnowledge(supabase, {
    stage: 'case_core',
    params,
  });
  const prompt = buildStoryBiblePrompt(params);
  const systemPrompt = prompt.systemPrompt;
  const userPrompt = appendKnowledgeToPrompt(prompt.userPrompt, knowledgeItems);
  const provider = new DeepSeekProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        controller.enqueue(
          encodeSse(encoder, 'start', { scriptId, stage: 'story-bible-init' }),
        );

        // 1 + 2. 流式生成并推送 chunk / progress
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.6,
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
        const json = parseJSONWithTolerance<StoryBibleJson>(accumulated);

        // 4. 校验关键字段
        const validation = validateStoryBible(json, params.players);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 5. 入库：upsert story_bibles + 插入 generation_tasks
        const { data: upsertedData, error: upsertError } = await supabase
          .from('story_bibles')
          .upsert({
            script_id: scriptId,
            murderer_character_name: json.murdererName,
            murder_method: json.murderMethod,
            core_trick: json.coreTrick,
            motive_chain: json.motiveChain,
            character_skeleton: json.characterSkeleton,
            timeline_outline: json.timelineOutline,
            truth_summary: json.truthSummary,
            foreshadowing_plan: json.foreshadowingPlan,
            confirmed: false,
          }, { onConflict: 'script_id' })
          .select('id')
          .single();

        if (upsertError) throw new Error(`设定本入库失败: ${upsertError.message}`);
        const storyBibleId = upsertedData?.id as string;

        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'STORY_BIBLE',
            status: 'completed',
            params: params,
            progress_percent: 100,
            result_data: { storyBibleId },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });

        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        await recordKnowledgeUsages(supabase, {
          scriptId,
          stage: 'case_core',
          moduleType: 'case_core',
          items: knowledgeItems,
        });
        await recordQualityReport(supabase, {
          scriptId,
          stage: 'case_core',
          moduleType: 'case_core',
          content: json,
        });

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            storyBibleId,
            result: json,
          }),
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
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// @ts-ignore - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
Deno.serve(handleRequest);
