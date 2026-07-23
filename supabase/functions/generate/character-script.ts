/**
 * CHARACTER_SCRIPT 类型 Edge Function - 流式生成角色剧本（阶段 2）
 *
 * 接收 POST 请求，参数为 { scriptId, characterId, params: ScriptGenerationParams }：
 *   1. 从 story_bibles 表读取阶段 0 设定本
 *   2. 从 characters 表读取该角色人物设定
 *   3. 从 acts + scenes 表读取分幕结构
 *   4. 调用 buildCharacterScriptPrompt 构造 prompt（视角过滤自动处理）
 *   5. 通过 DeepSeekProvider.generateStream 流式生成（温度 0.8）
 *   6. SSE 推送 start / chunk / progress 事件
 *   7. 生成完成后用 parseJSONWithTolerance 解析 JSON
 *   8. 校验关键字段（actScripts 覆盖所有幕次、characterName 一致等）
 *   9. upsert 到 character_scripts 表 + 插入 generation_tasks 记录
 *   10. 返回 completed 事件
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将 service 层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildCharacterScriptPrompt,
  type CharacterScriptJson,
} from '@/lib/ai/prompts/character-script';
import type { StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { CharacterProfile } from '@/lib/ai/prompts/character-profiles';
import type { ActStructureJson, ActStructure } from '@/lib/ai/prompts/act-structure';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import {
  appendKnowledgeToPrompt,
  recordKnowledgeUsages,
  recordQualityReport,
  retrieveStageKnowledge,
} from '@/lib/generation/knowledge';

/** 入参体 */
interface CharacterScriptRequestBody {
  scriptId: string;
  characterId: string;
  params: ScriptGenerationParams;
}

/** 角色剧本校验结果 */
interface CharacterScriptValidationResult {
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
function validateBody(body: unknown): body is CharacterScriptRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (typeof b.characterId !== 'string' || !b.characterId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

/**
 * 校验角色剧本 JSON 结构完整性
 * - characterName 与人物设定一致
 * - actScripts 数量等于分幕结构幕次数
 * - 每幕 actTitle / content 非空，content 字数 >= 400
 * - 每幕 scenes 非空，每个场景 title / content 非空
 * - personalArc / perspectiveNote 非空
 * - visibleClueTitles 为数组
 */
function validateCharacterScript(
  json: CharacterScriptJson,
  character: CharacterProfile,
  actStructure: ActStructureJson,
): CharacterScriptValidationResult {
  const errors: string[] = [];

  if (typeof json.characterName !== 'string' || !json.characterName) {
    errors.push('characterName 必须为非空字符串');
  } else if (json.characterName !== character.name) {
    errors.push(`characterName "${json.characterName}" 与人物设定 "${character.name}" 不一致`);
  }

  if (!Array.isArray(json.actScripts)) {
    errors.push('actScripts 必须为数组');
  } else {
    if (json.actScripts.length !== actStructure.acts.length) {
      errors.push(`actScripts 长度 ${json.actScripts.length} 必须等于幕次数 ${actStructure.acts.length}`);
    }
    for (let i = 0; i < json.actScripts.length; i++) {
      const act = json.actScripts[i];
      if (typeof act.actTitle !== 'string' || !act.actTitle) {
        errors.push(`actScripts[${i}].actTitle 必须为非空字符串`);
      }
      if (typeof act.content !== 'string' || !act.content) {
        errors.push(`actScripts[${i}].content 必须为非空字符串`);
      } else if (act.content.length < 400) {
        errors.push(`actScripts[${i}].content 字数过少（${act.content.length}字，建议 800+）`);
      }
      if (!Array.isArray(act.scenes) || act.scenes.length === 0) {
        errors.push(`actScripts[${i}].scenes 必须为非空数组`);
      } else {
        for (let j = 0; j < act.scenes.length; j++) {
          const scene = act.scenes[j];
          if (typeof scene.title !== 'string' || !scene.title) {
            errors.push(`actScripts[${i}].scenes[${j}].title 必须为非空字符串`);
          }
          if (typeof scene.content !== 'string' || !scene.content) {
            errors.push(`actScripts[${i}].scenes[${j}].content 必须为非空字符串`);
          }
        }
      }
    }
  }

  if (typeof json.personalArc !== 'string' || !json.personalArc) {
    errors.push('personalArc 必须为非空字符串');
  }
  if (!Array.isArray(json.visibleClueTitles)) {
    errors.push('visibleClueTitles 必须为数组');
  }
  if (typeof json.perspectiveNote !== 'string' || !json.perspectiveNote) {
    errors.push('perspectiveNote 必须为非空字符串');
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

  const { scriptId, characterId, params } = body;

  // 并行读取 3 张表：story_bibles + characters + acts(with scenes)
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const [storyBibleResult, characterResult, actsResult] = await Promise.all([
    supabase
      .from('story_bibles')
      .select('murderer_character_name, murder_method, core_trick, motive_chain, character_skeleton, timeline_outline, truth_summary, foreshadowing_plan')
      .eq('script_id', scriptId)
      .single(),
    supabase
      .from('characters')
      .select('id, name, role_identity, gender, age, personality, background_story, personal_task, is_murderer')
      .eq('id', characterId)
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
  if (characterResult.error || !characterResult.data) {
    return new Response(JSON.stringify({ error: '角色不存在，请先完成阶段 1a' }), {
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

  // 构造 CharacterProfile 对象
  const characterRow = characterResult.data;
  const character: CharacterProfile = {
    name: characterRow.name,
    roleIdentity: characterRow.role_identity,
    gender: characterRow.gender,
    age: characterRow.age,
    personality: characterRow.personality,
    backgroundStory: characterRow.background_story,
    personalTask: characterRow.personal_task,
    isMurderer: characterRow.is_murderer,
    secretFromBible: '',
  };
  // 从设定本骨架中找到该角色的 secret
  const bibleNode = storyBible.characterSkeleton.nodes.find((n) => n.name === character.name);
  if (bibleNode) {
    character.secretFromBible = bibleNode.secret;
  }

  // 构造 ActStructureJson 对象
  // 注：searchRounds 不在 acts/scenes 表中存储，留空数组；
  // 角色剧本的可见线索通过 visibleClueTitles 输出，不依赖 searchRounds。
  const actsRows = actsResult.data;
  const actStructure: ActStructureJson = {
    acts: actsRows.map((actRow: any) => ({
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
    })).sort((a, b) => a.sortOrder - b.sortOrder),
  };

  // 构造 prompt + 实例化 provider
  const knowledgeItems = await retrieveStageKnowledge(supabase, {
    stage: 'player_script',
    params,
  });
  const prompt = buildCharacterScriptPrompt({
    params,
    storyBible,
    character,
    actStructure,
  });
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
          encodeSse(encoder, 'start', {
            scriptId,
            characterId,
            stage: 'character-script-init',
          }),
        );

        // 1 + 2. 流式生成并推送 chunk / progress
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.8,
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
        const json = parseJSONWithTolerance<CharacterScriptJson>(accumulated);

        // 4. 校验关键字段
        const validation = validateCharacterScript(json, character, actStructure);
        if (!validation.valid) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: validation.errors.join('; '),
            }),
          );
          return;
        }

        // 5. 入库：upsert character_scripts + 插入 generation_tasks 记录
        // a. 计算 word_count
        const wordCount = json.actScripts.reduce((sum, act) => {
          return sum + act.content.length + act.scenes.reduce((s, sc) => s + sc.content.length, 0);
        }, 0);

        // b. upsert 到 character_scripts 表（默认写入第 1 本完整玩家剧本）
        const { data: upsertedData, error: upsertError } = await supabase
          .from('character_scripts')
          .upsert({
            script_id: scriptId,
            character_id: characterId,
            part_index: 1,
            part_label: '完整玩家剧本',
            act_order: null,
            act_scripts: json.actScripts,
            personal_arc: json.personalArc,
            visible_clue_titles: json.visibleClueTitles,
            perspective_note: json.perspectiveNote,
            is_murderer_script: character.isMurderer,
            word_count: wordCount,
            generation_status: 'completed',
          }, { onConflict: 'script_id,character_id,part_index' })
          .select('id')
          .single();
        if (upsertError) throw new Error(`角色剧本入库失败: ${upsertError.message}`);
        const characterScriptId = upsertedData?.id as string;

        // c. 插入 generation_tasks 记录
        const { error: taskError } = await supabase
          .from('generation_tasks')
          .insert({
            script_id: scriptId,
            task_type: 'CHARACTER_SCRIPT',
            status: 'completed',
            params: { ...params, characterId },
            progress_percent: 100,
            result_data: { characterScriptId, characterName: json.characterName, wordCount },
            started_at: startedAt.toISOString(),
            completed_at: new Date().toISOString(),
          });
        if (taskError) throw new Error(`任务记录创建失败: ${taskError.message}`);

        await recordKnowledgeUsages(supabase, {
          scriptId,
          stage: 'player_script',
          moduleType: 'player_script',
          items: knowledgeItems,
        });
        await recordQualityReport(supabase, {
          scriptId,
          stage: 'player_script',
          moduleType: 'player_script',
          content: json,
        });

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            characterId,
            characterScriptId,
            characterName: json.characterName,
            wordCount,
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
