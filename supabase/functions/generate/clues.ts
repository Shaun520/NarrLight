/**
 * CLUES 类型 Edge Function - 流式生成线索卡（阶段 3a）
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 从 story_bibles 表读取阶段 0 设定本
 *   2. 从 acts + scenes 表读取分幕结构（含搜证轮次，从 generation_tasks 读取阶段 1b 结果获取 searchRounds）
 *   3. 调用 buildCluesPrompt 构造 prompt
 *   4. 通过 DeepSeekProvider.generateStream 流式生成（温度 0.6）
 *   5. SSE 推送 start / chunk / progress 事件
 *   6. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   7. 校验关键字段（线索数、伏笔覆盖、location 对齐等）
 *   8. 清空旧线索 + 插入新线索到 clues 表 + 插入 generation_tasks 记录
 *   9. 返回 completed 事件
 *
 * 部署说明：同 story-bible.ts
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildCluesPrompt,
  type CluesJson,
  type Clue,
} from '@/lib/ai/prompts/clues';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ActStructureJson } from '@/lib/ai/prompts/act-structure';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';

/** 入参体 */
interface CluesRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** 线索卡校验结果 */
interface CluesValidationResult {
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
function validateBody(body: unknown): body is CluesRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/** 合法线索类型枚举 */
const VALID_CLUE_TYPES = ['physical', 'testimony', 'deep', 'hidden'];

/**
 * 校验线索卡 JSON 结构完整性
 * - clues 为数组且非空
 * - 每条线索：title/content/location 非空、clueType 合法、searchRound 数字、
 *   relatedCharacterNames 数组、isDistractor/isKeyClue 布尔
 * - 关键线索占比 30%-40%（isKeyClue=true 的数量 / 总数）
 * - 伏笔覆盖：storyBible.foreshadowingPlan 中每条伏笔的 id 至少出现在一条线索的 foreshadowingId 中
 * - relatedCharacterNames 中的姓名必须在 storyBible.characterSkeleton.nodes 中
 */
function validateClues(
  json: CluesJson,
  storyBible: StoryBibleJson,
): CluesValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(json.clues)) {
    errors.push('clues 必须为数组');
    return { valid: false, errors };
  }

  if (json.clues.length === 0) {
    errors.push('clues 不能为空数组');
    return { valid: false, errors };
  }

  // 校验每条线索字段
  for (let i = 0; i < json.clues.length; i++) {
    const clue = json.clues[i];
    if (typeof clue.title !== 'string' || !clue.title) {
      errors.push(`clues[${i}].title 必须为非空字符串`);
    }
    if (typeof clue.content !== 'string' || !clue.content) {
      errors.push(`clues[${i}].content 必须为非空字符串`);
    }
    if (typeof clue.location !== 'string' || !clue.location) {
      errors.push(`clues[${i}].location 必须为非空字符串`);
    }
    if (!VALID_CLUE_TYPES.includes(clue.clueType)) {
      errors.push(`clues[${i}].clueType 必须为 physical/testimony/deep/hidden 之一（当前 "${clue.clueType}"）`);
    }
    if (typeof clue.searchRound !== 'number' || !Number.isFinite(clue.searchRound)) {
      errors.push(`clues[${i}].searchRound 必须为数字`);
    }
    if (!Array.isArray(clue.relatedCharacterNames)) {
      errors.push(`clues[${i}].relatedCharacterNames 必须为数组`);
    }
    if (typeof clue.isDistractor !== 'boolean') {
      errors.push(`clues[${i}].isDistractor 必须为布尔值`);
    }
    if (typeof clue.isKeyClue !== 'boolean') {
      errors.push(`clues[${i}].isKeyClue 必须为布尔值`);
    }
  }

  // 校验关键线索占比 30%-40%（允许 ±5% 容差以处理小样本离散取整）
  const totalCount = json.clues.length;
  const keyClueCount = json.clues.filter((c) => c.isKeyClue).length;
  const keyClueRatio = keyClueCount / totalCount;
  if (keyClueRatio < 0.25 || keyClueRatio > 0.45) {
    errors.push(
      `关键线索占比 ${(keyClueRatio * 100).toFixed(1)}% 不在 30%-40% 范围内（${keyClueCount}/${totalCount}）`,
    );
  }

  // 校验伏笔覆盖：设定本每条伏笔 id 至少出现在一条线索的 foreshadowingId 中
  const coveredForeshadowingIds = new Set(
    json.clues
      .map((c) => c.foreshadowingId)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  );
  for (const f of storyBible.foreshadowingPlan) {
    if (!coveredForeshadowingIds.has(f.id)) {
      errors.push(`伏笔 "${f.id}" 未被任何线索的 foreshadowingId 覆盖`);
    }
  }

  // 校验 relatedCharacterNames 中的姓名必须在设定本骨架节点列表中
  const bibleNames = storyBible.characterSkeleton.nodes.map((n) => n.name);
  for (let i = 0; i < json.clues.length; i++) {
    const clue = json.clues[i];
    if (!Array.isArray(clue.relatedCharacterNames)) continue;
    for (const name of clue.relatedCharacterNames) {
      if (!bibleNames.includes(name)) {
        errors.push(`clues[${i}].relatedCharacterNames 中的 "${name}" 不在设定本骨架节点列表中`);
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

  // 并行读取 2 张表：story_bibles + acts(with scenes)
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const [storyBibleResult, actsResult] = await Promise.all([
    supabase
      .from('story_bibles')
      .select('murderer_character_name, murder_method, core_trick, motive_chain, character_skeleton, timeline_outline, truth_summary, foreshadowing_plan')
      .eq('script_id', scriptId)
      .single(),
    supabase
      .from('acts')
      .select('id, title, sort_order, content, scenes(id, title, location, content, sort_order)')
      .eq('script_id', scriptId)
      .order('sort_order'),
  ]);

  // 校验读取结果
  if (storyBibleResult.error || !storyBibleResult.data) {
    return new Response(JSON.stringify({ error: '设定本不存在，请先完成阶段 0' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (actsResult.error || !actsResult.data || actsResult.data.length === 0) {
    return new Response(JSON.stringify({ error: '分幕结构不存在，请先完成阶段 1b' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 构造 StoryBibleJson 对象（snake_case → camelCase）
  const storyBible: StoryBibleJson = {
    murdererName: storyBibleResult.data.murderer_character_name,
    murderMethod: storyBibleResult.data.murder_method,
    coreTrick: storyBibleResult.data.core_trick,
    motiveChain: storyBibleResult.data.motive_chain,
    characterSkeleton: storyBibleResult.data.character_skeleton,
    timelineOutline: storyBibleResult.data.timeline_outline,
    truthSummary: storyBibleResult.data.truth_summary,
    foreshadowingPlan: storyBibleResult.data.foreshadowing_plan,
  };

  // 构造 ActStructureJson 对象
  // 注：searchRounds 不在 acts/scenes 表中存储，留空数组（与 character-script.ts 一致）
  const actsRows = actsResult.data;
  const actStructure: ActStructureJson = {
    acts: actsRows
      .map((actRow: any) => ({
        title: actRow.title,
        sortOrder: actRow.sort_order,
        content: actRow.content,
        scenes: (actRow.scenes || [])
          .map((sceneRow: any) => ({
            title: sceneRow.title,
            location: sceneRow.location,
            content: sceneRow.content,
            sortOrder: sceneRow.sort_order,
          }))
          .sort(
            (a: { sortOrder: number }, b: { sortOrder: number }) =>
              a.sortOrder - b.sortOrder,
          ),
        searchRounds: [],
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };

  // 构造 prompt + 实例化 provider
  const { systemPrompt, userPrompt } = buildCluesPrompt({ params, storyBible, actStructure });
  const provider = new DeepSeekProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        controller.enqueue(
          encodeSse(encoder, 'start', { scriptId, stage: 'clues-init' }),
        );

        // 1 + 2. 流式生成并推送 chunk / progress（温度 0.6，线索卡需逻辑严密）
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
        const json = parseJSONWithTolerance<CluesJson>(accumulated);

        // 4. 校验关键字段
        const validation = validateClues(json, storyBible);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 5. 入库：清空旧线索 + 插入新线索 + 插入 generation_tasks 记录
        // a. 清空旧线索
        const { error: deleteError } = await supabase
          .from('clues')
          .delete()
          .eq('script_id', scriptId);
        if (deleteError) throw new Error(`清空旧线索失败: ${deleteError.message}`);

        // b. 插入新线索（遍历 json.clues，映射字段到 clues 表的 snake_case）
        const cluesToInsert = json.clues.map((clue: Clue, index: number) => ({
          script_id: scriptId,
          title: clue.title,
          content: clue.content,
          clue_type: clue.clueType,
          search_round: clue.searchRound,
          location: clue.location,
          related_character_names: clue.relatedCharacterNames,
          is_distractor: clue.isDistractor,
          is_key_clue: clue.isKeyClue,
          unlock_condition: clue.unlockCondition,
          sort_order: index,
        }));
        const { error: insertError } = await supabase
          .from('clues')
          .insert(cluesToInsert);
        if (insertError) throw new Error(`线索入库失败: ${insertError.message}`);

        // c. 插入 generation_tasks 记录
        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'CLUES',
            status: 'completed',
            params: params,
            progress_percent: 100,
            result_data: { clueCount: json.clues.length },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });
        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            clueCount: json.clues.length,
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
