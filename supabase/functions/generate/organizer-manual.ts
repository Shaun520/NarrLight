/**
 * ORGANIZER_MANUAL 类型 Edge Function - 流式生成组织者手册（阶段 3b）
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 从 story_bibles 表读取阶段 0 设定本
 *   2. 从 acts 表读取分幕结构
 *   3. 调用 buildOrganizerManualPrompt 构造 prompt
 *   4. 通过 DeepSeekProvider.generateStream 流式生成（温度 0.5）
 *   5. SSE 推送 start / chunk / progress 事件
 *   6. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   7. 校验关键字段（开本流程非空、时长控制对齐幕次等）
 *   8. upsert 到 organizer_manuals 表 + 插入 generation_tasks 记录
 *   9. 返回 completed 事件
 *
 * 部署说明：同 story-bible.ts
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildOrganizerManualPrompt,
  type OrganizerManualJson,
} from '@/lib/ai/prompts/organizer-manual';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ActStructureJson } from '@/lib/ai/prompts/act-structure';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';

/** 入参体 */
interface OrganizerManualRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** 组织者手册校验结果 */
interface OrganizerManualValidationResult {
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
function validateBody(body: unknown): body is OrganizerManualRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/**
 * 校验组织者手册 JSON 结构完整性
 * - openingFlow 为非空数组，每项含 step/title/content/durationMinutes
 * - durationControl 为非空数组，每项含 actTitle/durationMinutes/pacingHint
 * - durationControl 的 actTitle 与 actStructure.acts.title 对齐
 * - pacingHints 非空字符串
 * - npcGuide 非空字符串（允许空字符串若无可扮演 NPC）
 * - 总时长（openingFlow + durationControl 的 durationMinutes 之和）接近 params.duration * 60（允许 ±20% 偏差）
 */
function validateOrganizerManual(
  json: OrganizerManualJson,
  actStructure: ActStructureJson,
  targetDurationMinutes: number,
): OrganizerManualValidationResult {
  const errors: string[] = [];

  // 校验 openingFlow
  if (!Array.isArray(json.openingFlow) || json.openingFlow.length === 0) {
    errors.push('openingFlow 必须为非空数组');
  } else {
    for (let i = 0; i < json.openingFlow.length; i++) {
      const step = json.openingFlow[i];
      if (typeof step.step !== 'number') {
        errors.push(`openingFlow[${i}].step 必须为数字`);
      }
      if (typeof step.title !== 'string' || !step.title) {
        errors.push(`openingFlow[${i}].title 必须为非空字符串`);
      }
      if (typeof step.content !== 'string' || !step.content) {
        errors.push(`openingFlow[${i}].content 必须为非空字符串`);
      }
      if (typeof step.durationMinutes !== 'number' || step.durationMinutes <= 0) {
        errors.push(`openingFlow[${i}].durationMinutes 必须为正数`);
      }
    }
  }

  // 校验 durationControl
  if (!Array.isArray(json.durationControl) || json.durationControl.length === 0) {
    errors.push('durationControl 必须为非空数组');
  } else {
    const actTitles = actStructure.acts.map((a) => a.title);
    for (let i = 0; i < json.durationControl.length; i++) {
      const dc = json.durationControl[i];
      if (typeof dc.actTitle !== 'string' || !dc.actTitle) {
        errors.push(`durationControl[${i}].actTitle 必须为非空字符串`);
      } else if (!actTitles.includes(dc.actTitle)) {
        errors.push(`durationControl[${i}].actTitle "${dc.actTitle}" 不在分幕结构幕次标题列表中`);
      }
      if (typeof dc.durationMinutes !== 'number' || dc.durationMinutes <= 0) {
        errors.push(`durationControl[${i}].durationMinutes 必须为正数`);
      }
      if (typeof dc.pacingHint !== 'string' || !dc.pacingHint) {
        errors.push(`durationControl[${i}].pacingHint 必须为非空字符串`);
      }
    }
  }

  // 校验 pacingHints
  if (typeof json.pacingHints !== 'string' || !json.pacingHints) {
    errors.push('pacingHints 必须为非空字符串');
  }

  // 校验 npcGuide（允许空字符串若无可扮演 NPC，但类型必须为字符串）
  if (typeof json.npcGuide !== 'string') {
    errors.push('npcGuide 必须为字符串');
  }

  // 校验总时长（openingFlow + durationControl 的 durationMinutes 之和）接近目标时长（±20% 偏差）
  const openingFlowTotal = Array.isArray(json.openingFlow)
    ? json.openingFlow.reduce((sum, s) => sum + (typeof s.durationMinutes === 'number' ? s.durationMinutes : 0), 0)
    : 0;
  const durationControlTotal = Array.isArray(json.durationControl)
    ? json.durationControl.reduce((sum, d) => sum + (typeof d.durationMinutes === 'number' ? d.durationMinutes : 0), 0)
    : 0;
  const totalDuration = openingFlowTotal + durationControlTotal;
  const lowerBound = targetDurationMinutes * 0.8;
  const upperBound = targetDurationMinutes * 1.2;
  if (totalDuration < lowerBound || totalDuration > upperBound) {
    errors.push(
      `总时长 ${totalDuration} 分钟不在目标时长 ${targetDurationMinutes} 分钟的 ±20% 范围内 [${lowerBound}, ${upperBound}]`,
    );
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

  // 构造 StoryBibleJson 对象（snake_case 映射回 camelCase）
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

  // 2. 读取 acts 表 + scenes 表构造 ActStructureJson（searchRounds 留空）
  const { data: actsRows, error: actsError } = await supabase
    .from('acts')
    .select('id, title, sort_order, content, scenes(id, title, location, content, sort_order)')
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: true });

  if (actsError || !actsRows || actsRows.length === 0) {
    return new Response(JSON.stringify({ error: '分幕结构不存在，请先完成阶段 1b' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const actStructure: ActStructureJson = {
    acts: actsRows.map((actRow) => {
      // 嵌套查询返回的 scenes 字段类型为 unknown，需做类型断言
      const scenes = (actRow.scenes as unknown as Array<{
        id: string;
        title: string;
        location: string;
        content: string;
        sort_order: number;
      }>) ?? [];
      return {
        title: actRow.title,
        sortOrder: actRow.sort_order,
        content: actRow.content ?? '',
        scenes: scenes.map((s) => ({
          title: s.title,
          location: s.location ?? '',
          content: s.content ?? '',
          sortOrder: s.sort_order,
        })),
        searchRounds: [],
      };
    }),
  };

  // 3. 构造 prompt + 实例化 provider
  const { systemPrompt, userPrompt } = buildOrganizerManualPrompt({
    params,
    storyBible,
    actStructure,
  });
  const provider = new DeepSeekProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        controller.enqueue(
          encodeSse(encoder, 'start', { scriptId, stage: 'organizer-manual-init' }),
        );

        // 4. 流式生成并推送 chunk / progress（温度 0.5，组织者手册需稳定）
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.5,
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

        // 5. 解析 JSON 结果
        controller.enqueue(
          encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }),
        );
        const json = parseJSONWithTolerance<OrganizerManualJson>(accumulated);

        // 6. 校验关键字段
        const targetDurationMinutes = params.duration * 60;
        const validation = validateOrganizerManual(json, actStructure, targetDurationMinutes);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 7. 入库：upsert organizer_manuals + 插入 generation_tasks 记录
        const { data: upsertedData, error: upsertError } = await supabase
          .from('organizer_manuals')
          .upsert({
            script_id: scriptId,
            opening_flow: json.openingFlow,
            duration_control: json.durationControl,
            pacing_hints: json.pacingHints,
            npc_guide: json.npcGuide,
            mechanism_rules: json.mechanismRules,
          }, { onConflict: 'script_id' })
          .select('id')
          .single();

        if (upsertError) throw new Error(`组织者手册入库失败: ${upsertError.message}`);
        const organizerManualId = upsertedData?.id as string;

        // 8. 插入 generation_tasks 记录
        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'ORGANIZER_MANUAL',
            status: 'completed',
            params: params,
            progress_percent: 100,
            result_data: { organizerManualId },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });

        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        // 9. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            organizerManualId,
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
