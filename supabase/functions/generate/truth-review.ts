/**
 * TRUTH_REVIEW 类型 Edge Function - 流式生成真相复盘（阶段 3c）
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 从 story_bibles 表读取阶段 0 设定本
 *   2. 从 acts 表读取分幕结构
 *   3. 从 character_scripts 表读取全部角色剧本
 *   4. 从 clues 表读取线索卡
 *   5. 调用 buildTruthReviewPrompt 构造 prompt
 *   6. 通过 DeepSeekProvider.generateStream 流式生成（温度 0.4）
 *   7. SSE 推送 start / chunk / progress 事件
 *   8. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   9. 校验关键字段（伏笔全回收、角色结局全覆盖等）
 *   10. upsert 到 truth_reviews 表 + 插入 generation_tasks 记录
 *   11. 返回 completed 事件
 *
 * 部署说明：同 story-bible.ts
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildTruthReviewPrompt,
  type TruthReviewJson,
} from '@/lib/ai/prompts/truth-review';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ActStructureJson } from '@/lib/ai/prompts/act-structure';
import type { CharacterScriptJson } from '@/lib/ai/prompts/character-script';
import type { CluesJson } from '@/lib/ai/prompts/clues';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';

/** 入参体 */
interface TruthReviewRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** 真相复盘校验结果 */
interface TruthReviewValidationResult {
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
function validateBody(body: unknown): body is TruthReviewRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/**
 * 校验真相复盘 JSON 结构完整性
 * - 基础字段（fullSummary/methodDetail/motiveDetail/timelineFull）非空
 * - characterEndings 为非空数组，每项含 characterName/ending
 * - characterEndings 覆盖设定本骨架中所有角色姓名
 * - foreshadowingResolution 为非空数组，每项含 id/plan/resolvedAt/explanation
 * - 伏笔全回收：设定本 foreshadowingPlan 中每条伏笔 id 必须出现在 foreshadowingResolution.id 中
 * - foreshadowingResolution.id 与 foreshadowingPlan.id 完全对齐（无多余、无遗漏）
 */
function validateTruthReview(
  json: TruthReviewJson,
  storyBible: StoryBibleJson,
): TruthReviewValidationResult {
  const errors: string[] = [];

  if (typeof json.fullSummary !== 'string' || !json.fullSummary) {
    errors.push('fullSummary 必须为非空字符串');
  }
  if (typeof json.methodDetail !== 'string' || !json.methodDetail) {
    errors.push('methodDetail 必须为非空字符串');
  }
  if (typeof json.motiveDetail !== 'string' || !json.motiveDetail) {
    errors.push('motiveDetail 必须为非空字符串');
  }
  if (typeof json.timelineFull !== 'string' || !json.timelineFull) {
    errors.push('timelineFull 必须为非空字符串');
  }

  // characterEndings 校验
  if (!Array.isArray(json.characterEndings) || json.characterEndings.length === 0) {
    errors.push('characterEndings 必须为非空数组');
  } else {
    for (let i = 0; i < json.characterEndings.length; i++) {
      const ce = json.characterEndings[i];
      if (typeof ce.characterName !== 'string' || !ce.characterName) {
        errors.push(`characterEndings[${i}].characterName 必须为非空字符串`);
      }
      if (typeof ce.ending !== 'string' || !ce.ending) {
        errors.push(`characterEndings[${i}].ending 必须为非空字符串`);
      }
    }
    // 覆盖设定本骨架中所有角色姓名
    const bibleNames = storyBible.characterSkeleton.nodes.map((n) => n.name);
    const endingNames = json.characterEndings.map((ce) => ce.characterName);
    for (const name of bibleNames) {
      if (!endingNames.includes(name)) {
        errors.push(`characterEndings 未覆盖设定本角色 "${name}"`);
      }
    }
  }

  // foreshadowingResolution 校验
  if (!Array.isArray(json.foreshadowingResolution) || json.foreshadowingResolution.length === 0) {
    errors.push('foreshadowingResolution 必须为非空数组');
  } else {
    for (let i = 0; i < json.foreshadowingResolution.length; i++) {
      const fr = json.foreshadowingResolution[i];
      if (typeof fr.id !== 'string' || !fr.id) {
        errors.push(`foreshadowingResolution[${i}].id 必须为非空字符串`);
      }
      if (typeof fr.plan !== 'string' || !fr.plan) {
        errors.push(`foreshadowingResolution[${i}].plan 必须为非空字符串`);
      }
      if (typeof fr.resolvedAt !== 'string' || !fr.resolvedAt) {
        errors.push(`foreshadowingResolution[${i}].resolvedAt 必须为非空字符串`);
      }
      if (typeof fr.explanation !== 'string' || !fr.explanation) {
        errors.push(`foreshadowingResolution[${i}].explanation 必须为非空字符串`);
      }
    }
    // 伏笔全回收：设定本 foreshadowingPlan 中每条伏笔 id 必须出现在 foreshadowingResolution.id 中
    const planIds = storyBible.foreshadowingPlan.map((f) => f.id);
    const resolutionIds = json.foreshadowingResolution.map((fr) => fr.id);
    for (const id of planIds) {
      if (!resolutionIds.includes(id)) {
        errors.push(`伏笔 "${id}" 未在 foreshadowingResolution 中回收`);
      }
    }
    // 完全对齐：无多余 id
    for (const id of resolutionIds) {
      if (!planIds.includes(id)) {
        errors.push(`foreshadowingResolution 中存在多余伏笔 id "${id}"`);
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

  // 并行读取 4 张表：story_bibles + acts + character_scripts + clues
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const [storyBibleResult, actsResult, characterScriptsResult, cluesResult] = await Promise.all([
    supabase
      .from('story_bibles')
      .select('murderer_character_name, murder_method, core_trick, motive_chain, character_skeleton, timeline_outline, truth_summary, foreshadowing_plan')
      .eq('script_id', scriptId)
      .single(),
    supabase
      .from('acts')
      .select('id, title, sort_order, content')
      .eq('script_id', scriptId)
      .order('sort_order'),
    supabase
      .from('character_scripts')
      .select('act_scripts, personal_arc, visible_clue_titles, perspective_note, is_murderer_script, characters(name)')
      .eq('script_id', scriptId),
    supabase
      .from('clues')
      .select('title, content, clue_type, search_round, location, related_character_names, is_distractor, is_key_clue, unlock_condition')
      .eq('script_id', scriptId),
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
  if (characterScriptsResult.error || !characterScriptsResult.data || characterScriptsResult.data.length === 0) {
    return new Response(JSON.stringify({ error: '角色剧本不存在，请先完成阶段 2' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (cluesResult.error || !cluesResult.data || cluesResult.data.length === 0) {
    return new Response(JSON.stringify({ error: '线索卡不存在，请先完成阶段 3a' }), {
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

  // 构造 ActStructureJson 对象（searchRounds 留空，真相复盘不需要搜证轮次细节）
  const actsRows = actsResult.data;
  const actStructure: ActStructureJson = {
    acts: actsRows.map((actRow: any) => ({
      title: actRow.title,
      sortOrder: actRow.sort_order,
      content: actRow.content,
      scenes: [],
      searchRounds: [],
    })).sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder),
  };

  // 构造 CharacterScriptJson[] 对象
  // 注：character_scripts 表关联 characters 表获取 name（characters(name) join）
  const csRows = characterScriptsResult.data;
  const characterScripts: CharacterScriptJson[] = csRows.map((row: any) => ({
    characterName: row.characters?.name || '',
    actScripts: row.act_scripts,
    personalArc: row.personal_arc,
    visibleClueTitles: row.visible_clue_titles,
    perspectiveNote: row.perspective_note,
  }));

  // 构造 CluesJson 对象
  const clueRows = cluesResult.data;
  const clues: CluesJson = {
    clues: clueRows.map((row: any) => ({
      title: row.title,
      content: row.content,
      clueType: row.clue_type,
      searchRound: row.search_round,
      location: row.location,
      relatedCharacterNames: row.related_character_names || [],
      isDistractor: row.is_distractor,
      isKeyClue: row.is_key_clue,
      unlockCondition: row.unlock_condition,
      foreshadowingId: row.foreshadowing_id || '',
    })),
  };

  // 构造 prompt + 实例化 provider
  const { systemPrompt, userPrompt } = buildTruthReviewPrompt({
    params,
    storyBible,
    actStructure,
    characterScripts,
    clues,
  });
  const provider = new DeepSeekProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        controller.enqueue(
          encodeSse(encoder, 'start', {
            scriptId,
            stage: 'truth-review-init',
          }),
        );

        // 1 + 2. 流式生成并推送 chunk / progress（温度 0.4：真相复盘需最稳定，整合所有信息）
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.4,
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
        const json = parseJSONWithTolerance<TruthReviewJson>(accumulated);

        // 4. 校验关键字段（伏笔全回收、角色结局全覆盖等）
        const validation = validateTruthReview(json, storyBible);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 5. 入库：upsert truth_reviews + 插入 generation_tasks 记录
        const { data: upsertedData, error: upsertError } = await supabase
          .from('truth_reviews')
          .upsert({
            script_id: scriptId,
            full_summary: json.fullSummary,
            method_detail: json.methodDetail,
            motive_detail: json.motiveDetail,
            character_endings: json.characterEndings,
            foreshadowing_resolution: json.foreshadowingResolution,
            timeline_full: json.timelineFull,
          }, { onConflict: 'script_id' })
          .select('id')
          .single();

        if (upsertError) throw new Error(`真相复盘入库失败: ${upsertError.message}`);
        const truthReviewId = upsertedData?.id as string;

        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'TRUTH_REVIEW',
            status: 'completed',
            params: params,
            progress_percent: 100,
            result_data: { truthReviewId, foreshadowingCount: json.foreshadowingResolution.length },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });

        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            truthReviewId,
            foreshadowingCount: json.foreshadowingResolution.length,
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
