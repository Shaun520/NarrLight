/**
 * CHARACTER_PROFILES 类型 Edge Function - 流式生成人物设定（阶段 1a）
 *
 * 接收 POST 请求，参数为 { scriptId, params: ScriptGenerationParams }：
 *   1. 从 story_bibles 表读取阶段 0 设定本作为上下文
 *   2. 调用 buildCharacterProfilesPrompt 构造 prompt
 *   3. 通过 DeepSeekProvider.generateStream 流式生成
 *   4. SSE 推送 start / chunk / progress 事件
 *   5. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   6. 校验关键字段（人物数=玩家数、姓名与设定本一致、凶手身份一致等）
 *   7. 清空旧人物 + 插入新人物到 characters 表 + 插入 generation_tasks 记录
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
  buildCharacterProfilesPrompt,
  type CharacterProfilesJson,
  type CharacterProfile,
} from '@/lib/ai/prompts/character-profiles';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import {
  appendKnowledgeToPrompt,
  recordKnowledgeUsages,
  recordQualityReport,
  retrieveStageKnowledge,
} from '@/lib/generation/knowledge';

/** 入参体 */
interface CharacterProfilesRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
}

/** 人物设定校验结果 */
interface CharacterProfilesValidationResult {
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
function validateBody(body: unknown): body is CharacterProfilesRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/**
 * 校验人物设定 JSON 结构完整性
 * - characters 必须为数组且长度=玩家数
 * - 每个人物字段完整（name/roleIdentity/gender/personality/backgroundStory/personalTask/isMurderer/secretFromBible）
 * - 人物姓名必须出现在设定本骨架节点列表中
 * - 凶手有且仅有一个，且姓名与设定本 murdererName 一致
 * - 每个人物的 secretFromBible 必须对齐设定本骨架对应节点的 secret
 */
function validateCharacterProfiles(
  json: CharacterProfilesJson,
  storyBible: StoryBibleJson,
  players: number,
): CharacterProfilesValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(json.characters)) {
    errors.push('characters 必须为数组');
    return { valid: false, errors };
  }

  if (json.characters.length !== players) {
    errors.push(`characters 长度必须为 ${players}（当前 ${json.characters.length}）`);
  }

  // 校验每个人物字段
  const profileNames: string[] = [];
  for (let i = 0; i < json.characters.length; i++) {
    const c = json.characters[i];
    if (typeof c.name !== 'string' || !c.name) {
      errors.push(`characters[${i}].name 必须为非空字符串`);
    } else {
      profileNames.push(c.name);
    }
    if (typeof c.roleIdentity !== 'string' || !c.roleIdentity) {
      errors.push(`characters[${i}].roleIdentity 必须为非空字符串`);
    }
    if (!['male', 'female', 'unknown'].includes(c.gender)) {
      errors.push(`characters[${i}].gender 必须为 male/female/unknown`);
    }
    if (typeof c.personality !== 'string' || !c.personality) {
      errors.push(`characters[${i}].personality 必须为非空字符串`);
    }
    if (typeof c.backgroundStory !== 'string' || !c.backgroundStory) {
      errors.push(`characters[${i}].backgroundStory 必须为非空字符串`);
    }
    if (typeof c.personalTask !== 'string' || !c.personalTask) {
      errors.push(`characters[${i}].personalTask 必须为非空字符串`);
    }
    if (typeof c.isMurderer !== 'boolean') {
      errors.push(`characters[${i}].isMurderer 必须为布尔值`);
    }
    if (typeof c.secretFromBible !== 'string' || !c.secretFromBible) {
      errors.push(`characters[${i}].secretFromBible 必须为非空字符串`);
    }
  }

  // 校验人物姓名与设定本骨架一致
  const bibleNames = storyBible.characterSkeleton.nodes.map((n) => n.name);
  for (const name of profileNames) {
    if (!bibleNames.includes(name)) {
      errors.push(`人物 "${name}" 不在设定本骨架节点列表中`);
    }
  }

  // 校验凶手身份一致
  const murdererProfile = json.characters.find((c) => c.isMurderer);
  if (!murdererProfile) {
    errors.push('必须有且仅有一个 isMurderer=true 的人物');
  } else if (murdererProfile.name !== storyBible.murdererName) {
    errors.push(`凶手姓名 "${murdererProfile.name}" 与设定本 "${storyBible.murdererName}" 不一致`);
  }

  // 校验 secretFromBible 对齐设定本
  for (const c of json.characters) {
    const bibleNode = storyBible.characterSkeleton.nodes.find((n) => n.name === c.name);
    if (bibleNode && c.secretFromBible !== bibleNode.secret) {
      errors.push(`人物 "${c.name}" 的 secretFromBible 与设定本不一致（期望 "${bibleNode.secret}"，实际 "${c.secretFromBible}"）`);
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

  // 读取 story_bibles 表作为上下文输入
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

  // 构造 StoryBibleJson 对象（从数据库 snake_case 映射回 camelCase）
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

  const knowledgeItems = await retrieveStageKnowledge(supabase, {
    stage: 'characters',
    params,
  });
  const prompt = buildCharacterProfilesPrompt({ params, storyBible });
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
          encodeSse(encoder, 'start', { scriptId, stage: 'character-profiles-init' }),
        );

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
        const json = parseJSONWithTolerance<CharacterProfilesJson>(accumulated);

        // 4. 校验关键字段
        const validation = validateCharacterProfiles(json, storyBible, params.players);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 5. 入库：清空旧人物 + 插入新人物 + 插入 generation_tasks 记录
        // a. 清空旧人物
        const { error: deleteError } = await supabase
          .from('characters')
          .delete()
          .eq('script_id', scriptId);
        if (deleteError) throw new Error(`清空旧人物失败: ${deleteError.message}`);

        // b. 插入新人物
        const charactersToInsert = json.characters.map((c: CharacterProfile, index: number) => ({
          script_id: scriptId,
          name: c.name,
          role_identity: c.roleIdentity,
          gender: c.gender,
          age: c.age,
          personality: c.personality,
          background_story: c.backgroundStory,
          personal_task: c.personalTask,
          is_murderer: c.isMurderer,
          sort_order: index,
        }));
        const { error: insertError } = await supabase
          .from('characters')
          .insert(charactersToInsert);
        if (insertError) throw new Error(`人物入库失败: ${insertError.message}`);

        // c. 插入 generation_tasks 记录
        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'CHARACTER_PROFILES',
            status: 'completed',
            params: params,
            progress_percent: 100,
            result_data: { characterCount: json.characters.length },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });
        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        await recordKnowledgeUsages(supabase, {
          scriptId,
          stage: 'characters',
          moduleType: 'characters',
          items: knowledgeItems,
        });
        await recordQualityReport(supabase, {
          scriptId,
          stage: 'characters',
          moduleType: 'characters',
          content: json,
        });

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            characterCount: json.characters.length,
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
