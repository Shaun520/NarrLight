/**
 * ACT_STRUCTURE 类型 Edge Function - 流式生成分幕结构（阶段 1b）
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 从 story_bibles 表读取阶段 0 设定本作为上下文
 *   2. 调用 buildActStructurePrompt 构造 prompt
 *   3. 通过 DeepSeekProvider.generateStream 流式生成
 *   4. SSE 推送 start / chunk / progress 事件
 *   5. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   6. 校验关键字段（幕数 3-5、每幕 scenes 非空、searchRounds 非空等）
 *   7. 清空旧 acts（级联删除 scenes）+ 插入新 acts + scenes + 插入 generation_tasks 记录
 *   8. 返回 completed 事件
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将 service 层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildActStructurePrompt,
  type ActStructureJson,
  type ActStructure,
} from '@/lib/ai/prompts/act-structure';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';

/** 入参体 */
interface ActStructureRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** 分幕结构校验结果 */
interface ActStructureValidationResult {
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
function validateBody(body: unknown): body is ActStructureRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/**
 * 校验分幕结构 JSON 结构完整性
 * - acts 为数组且数量 3-5
 * - 每幕 title / sortOrder / content 非空
 * - 每幕 scenes 非空，每个场景 title / location / content / sortOrder 完整
 * - 每幕 searchRounds 非空，每轮 round 为数字、locations 非空
 * - 设定本伏笔 plantAct / payoffAct 不超过幕次数量
 */
function validateActStructure(
  json: ActStructureJson,
  storyBible: StoryBibleJson,
): ActStructureValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(json.acts)) {
    errors.push('acts 必须为数组');
    return { valid: false, errors };
  }

  if (json.acts.length < 3 || json.acts.length > 5) {
    errors.push(`acts 数量必须为 3-5 个（当前 ${json.acts.length}）`);
  }

  // 校验每个幕次
  for (let i = 0; i < json.acts.length; i++) {
    const act = json.acts[i];
    if (typeof act.title !== 'string' || !act.title) {
      errors.push(`acts[${i}].title 必须为非空字符串`);
    }
    if (typeof act.sortOrder !== 'number') {
      errors.push(`acts[${i}].sortOrder 必须为数字`);
    }
    if (typeof act.content !== 'string' || !act.content) {
      errors.push(`acts[${i}].content 必须为非空字符串`);
    }
    if (!Array.isArray(act.scenes) || act.scenes.length === 0) {
      errors.push(`acts[${i}].scenes 必须为非空数组`);
    } else {
      for (let j = 0; j < act.scenes.length; j++) {
        const scene = act.scenes[j];
        if (typeof scene.title !== 'string' || !scene.title) {
          errors.push(`acts[${i}].scenes[${j}].title 必须为非空字符串`);
        }
        if (typeof scene.location !== 'string' || !scene.location) {
          errors.push(`acts[${i}].scenes[${j}].location 必须为非空字符串`);
        }
        if (typeof scene.content !== 'string' || !scene.content) {
          errors.push(`acts[${i}].scenes[${j}].content 必须为非空字符串`);
        }
        if (typeof scene.sortOrder !== 'number') {
          errors.push(`acts[${i}].scenes[${j}].sortOrder 必须为数字`);
        }
      }
    }
    if (!Array.isArray(act.searchRounds) || act.searchRounds.length === 0) {
      errors.push(`acts[${i}].searchRounds 必须为非空数组`);
    } else {
      for (let k = 0; k < act.searchRounds.length; k++) {
        const sr = act.searchRounds[k];
        if (typeof sr.round !== 'number') {
          errors.push(`acts[${i}].searchRounds[${k}].round 必须为数字`);
        }
        if (!Array.isArray(sr.locations) || sr.locations.length === 0) {
          errors.push(`acts[${i}].searchRounds[${k}].locations 必须为非空数组`);
        }
      }
    }
  }

  // 校验伏笔 plantAct 在幕次范围内
  const maxAct = json.acts.length;
  for (const f of storyBible.foreshadowingPlan) {
    if (f.plantAct > maxAct) {
      errors.push(`伏笔 ${f.id} 的 plantAct=${f.plantAct} 超过幕次数量 ${maxAct}`);
    }
    if (f.payoffAct > maxAct) {
      errors.push(`伏笔 ${f.id} 的 payoffAct=${f.payoffAct} 超过幕次数量 ${maxAct}`);
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

  // 1. 读取 story_bibles 表（阶段 0 设定本）作为上下文
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const { data: storyBibleRow, error: fetchError } = await supabase
    .from('story_bibles')
    .select('murderer_character_name, murder_method, core_trick, motive_chain, character_skeleton, timeline_outline, truth_summary, foreshadowing_plan')
    .eq('script_id', scriptId)
    .single();

  if (fetchError || !storyBibleRow) {
    return new Response(JSON.stringify({ error: '设定本不存在，请先完成阶段 0' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. 构造 StoryBibleJson 对象（snake_case 映射回 camelCase）
  const storyBible: StoryBibleJson = {
    murdererName: storyBibleRow.murderer_character_name,
    murderMethod: storyBibleRow.murder_method,
    coreTrick: storyBibleRow.core_trick,
    motiveChain: storyBibleRow.motive_chain,
    characterSkeleton: storyBibleRow.character_skeleton,
    timelineOutline: storyBibleRow.timeline_outline,
    truthSummary: storyBibleRow.truth_summary,
    foreshadowingPlan: storyBibleRow.foreshadowing_plan,
  };

  // 3. 构造 prompt + 实例化 provider
  const { systemPrompt, userPrompt } = buildActStructurePrompt({ params, storyBible });
  const provider = new DeepSeekProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        controller.enqueue(
          encodeSse(encoder, 'start', { scriptId, stage: 'act-structure-init' }),
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
        const json = parseJSONWithTolerance<ActStructureJson>(accumulated);

        // 4. 校验关键字段
        const validation = validateActStructure(json, storyBible);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 5. 入库：清空旧 acts（级联删除 scenes）+ 插入新 acts + scenes + 任务记录
        // a. 清空旧 acts（scenes 通过外键 ON DELETE CASCADE 自动级联删除）
        const { error: deleteActsError } = await supabase
          .from('acts')
          .delete()
          .eq('script_id', scriptId);
        if (deleteActsError) throw new Error(`清空旧幕次失败: ${deleteActsError.message}`);

        // b. 逐幕插入 acts + 关联 scenes（scenes 需要外键 act_id，必须先插入 act 获取 id）
        let totalScenes = 0;
        for (const act of json.acts) {
          // 插入 act
          const { data: actData, error: actInsertError } = await supabase
            .from('acts')
            .insert({
              script_id: scriptId,
              title: act.title,
              sort_order: act.sortOrder,
              content: act.content,
            })
            .select('id')
            .single();
          if (actInsertError) throw new Error(`幕次入库失败: ${actInsertError.message}`);
          const actId = actData?.id as string;

          // 插入该 act 的所有 scenes
          const scenesToInsert = act.scenes.map(scene => ({
            act_id: actId,
            title: scene.title,
            location: scene.location,
            content: scene.content,
            sort_order: scene.sortOrder,
          }));
          const { error: sceneInsertError } = await supabase
            .from('scenes')
            .insert(scenesToInsert);
          if (sceneInsertError) throw new Error(`场景入库失败: ${sceneInsertError.message}`);
          totalScenes += scenesToInsert.length;
        }

        // c. 插入 generation_tasks 记录
        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'ACT_STRUCTURE',
            status: 'completed',
            params: params,
            progress_percent: 100,
            result_data: { actCount: json.acts.length, sceneCount: totalScenes },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });
        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            actCount: json.acts.length,
            sceneCount: totalScenes,
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
