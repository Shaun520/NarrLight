import { NextRequest } from 'next/server';
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import { buildStoryBiblePrompt, type StoryBibleJson } from '@/lib/ai/prompts/story-bible';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import {
  buildCharacterProfilesPrompt,
  type CharacterProfilesJson,
} from '@/lib/ai/prompts/character-profiles';
import {
  buildActStructurePrompt,
  type ActStructureJson,
} from '@/lib/ai/prompts/act-structure';
import {
  buildCharacterScriptPrompt,
  type CharacterScriptJson,
} from '@/lib/ai/prompts/character-script';
import type { CharacterProfile } from '@/lib/ai/prompts/character-profiles';
import { buildCluesPrompt, type CluesJson } from '@/lib/ai/prompts/clues';
import {
  buildOrganizerManualPrompt,
  type OrganizerManualJson,
} from '@/lib/ai/prompts/organizer-manual';
import {
  buildTruthReviewPrompt,
  type TruthReviewJson,
} from '@/lib/ai/prompts/truth-review';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const GENERATION_MODE = process.env.AI_GENERATION_MODE ?? 'mock';

type GenerationMode = 'mock' | 'real';

interface GenerateRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
  characterId?: string;
  storyBible?: StoryBibleJson;
  characterProfiles?: CharacterProfilesJson;
  actStructure?: ActStructureJson;
  characterScripts?: CharacterScriptJson[];
  clues?: CluesJson;
}

async function createGenerationDbClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasValidServiceRoleKey =
    typeof serviceRoleKey === 'string' &&
    serviceRoleKey.startsWith('eyJ') &&
    ![...serviceRoleKey].some((char) => char.codePointAt(0)! > 127);

  if (SUPABASE_URL && hasValidServiceRoleKey) {
    return createSupabaseClient(SUPABASE_URL, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY is missing or invalid; generation persistence may be blocked by RLS. Use the Supabase service_role JWT, not a placeholder.',
  );
  return createServerSupabaseClient();
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return Boolean(
    error.code === 'PGRST205' ||
      error.message?.includes('Could not find the table') ||
      error.message?.includes('schema cache'),
  );
}

function buildError(message: string, status = 500): Response {
  return Response.json({ error: message }, { status });
}

function getGenerationMode(): GenerationMode {
  if (GENERATION_MODE === 'real') return 'real';
  if (GENERATION_MODE === 'mock') return 'mock';

  console.warn(`Unknown AI_GENERATION_MODE "${GENERATION_MODE}", falling back to mock mode.`);
  return 'mock';
}

function generationMeta() {
  const mode = getGenerationMode();
  return {
    mode,
    provider: mode === 'real' ? 'deepseek' : 'local',
    model: mode === 'real' ? 'deepseek-chat' : 'mock',
  };
}

async function parseOrRepairJson<T>(text: string, schemaHint: string): Promise<T> {
  try {
    return parseJSONWithTolerance<T>(text);
  } catch (error) {
    const provider = new DeepSeekProvider();
    const repaired = await provider.generate({
      systemPrompt:
        'You repair malformed JSON. Return only valid JSON. Do not add markdown, comments, or explanation. Preserve the original meaning and fields.',
      prompt: [
        `Fix this malformed JSON for schema: ${schemaHint}.`,
        'Rules: keep Chinese text as-is, escape quotes inside strings, add missing commas/brackets only when needed.',
        'Malformed JSON:',
        text,
      ].join('\n\n'),
      temperature: 0,
    });

    try {
      return parseJSONWithTolerance<T>(repaired);
    } catch {
      if (error instanceof Error) throw error;
      throw new Error('Failed to parse JSON from AI response');
    }
  }
}

function encodeSse(encoder: TextEncoder, event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function validateBody(body: unknown): body is GenerateRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (!b.params || typeof b.params !== 'object') return false;
  const p = b.params as Record<string, unknown>;
  return typeof p.title === 'string' && typeof p.players === 'number';
}

function validateStoryBible(json: StoryBibleJson, players: number): string[] {
  const errors: string[] = [];

  if (typeof json.murdererName !== 'string' || !json.murdererName) {
    errors.push('murdererName must be a non-empty string');
  }
  if (typeof json.murderMethod !== 'string' || !json.murderMethod) {
    errors.push('murderMethod must be a non-empty string');
  }
  if (typeof json.coreTrick !== 'string' || !json.coreTrick) {
    errors.push('coreTrick must be a non-empty string');
  }
  if (typeof json.motiveChain !== 'string' || !json.motiveChain) {
    errors.push('motiveChain must be a non-empty string');
  }
  if (typeof json.timelineOutline !== 'string' || !json.timelineOutline) {
    errors.push('timelineOutline must be a non-empty string');
  }
  if (typeof json.truthSummary !== 'string' || !json.truthSummary) {
    errors.push('truthSummary must be a non-empty string');
  }

  if (!json.characterSkeleton || typeof json.characterSkeleton !== 'object') {
    errors.push('characterSkeleton must be an object');
  } else {
    if (!Array.isArray(json.characterSkeleton.nodes)) {
      errors.push('characterSkeleton.nodes must be an array');
    } else {
      if (json.characterSkeleton.nodes.length !== players) {
        errors.push(`characterSkeleton.nodes length must be ${players}`);
      }
      const nodeNames = json.characterSkeleton.nodes.map((node) => node.name);
      if (!nodeNames.includes(json.murdererName)) {
        errors.push(`murdererName "${json.murdererName}" is not in characterSkeleton.nodes`);
      }
    }
    if (!Array.isArray(json.characterSkeleton.edges)) {
      errors.push('characterSkeleton.edges must be an array');
    }
  }

  if (!Array.isArray(json.foreshadowingPlan)) {
    errors.push('foreshadowingPlan must be an array');
  } else {
    json.foreshadowingPlan.forEach((item, index) => {
      if (item.payoffAct < item.plantAct) {
        errors.push(`foreshadowingPlan[${index}].payoffAct must be >= plantAct`);
      }
    });
  }

  return errors;
}

function buildMockStoryBible(params: ScriptGenerationParams): StoryBibleJson {
  const names = ['林少衡', '苏晚晴', '周知远', '许曼', '陈泊舟', '顾明岚', '沈砚'];
  const nodes = Array.from({ length: params.players }, (_, index) => ({
    name: names[index] ?? `角色${index + 1}`,
    identity: index === 0 ? '旧案幸存者' : index === 1 ? '被害者亲属' : '受邀来客',
    secret:
      index === 0
        ? '曾在十年前篡改关键证词'
        : index === 1
          ? '暗中调查家族遗产流向'
          : '与当年的失踪案存在隐秘关联',
  }));

  const murdererName = nodes[0]?.name ?? '林少衡';

  return {
    murdererName,
    murderMethod: '利用停电后的三分钟时间差，借预先布置的机关制造不在场证明。',
    coreTrick: '所有人以为钟声来自大厅，其实声音由书房录音延迟播放，误导了死亡时间。',
    motiveChain: `${murdererName}因旧案真相即将曝光而被逼入绝境，选择在聚会中清除唯一知情者。`,
    characterSkeleton: {
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        from: murdererName,
        to: node.name,
        type: index % 2 === 0 ? 'enemy' : 'conspiracy',
        label: index % 2 === 0 ? '旧怨未清' : '共同隐瞒',
        isHidden: true,
      })),
    },
    timelineOutline:
      '第一幕建立暴雨山庄与旧案阴影；第二幕通过停电、钟声和证词冲突制造时间线谜团；第三幕回收录音机关与证词漏洞，揭示真实死亡时间。',
    truthSummary:
      '凶手提前布置录音与机关，在众人视线被停电转移时完成作案，并用延迟钟声重塑所有人的时间记忆。',
    foreshadowingPlan: [
      {
        id: 'f-1',
        description: '大厅老钟偶尔慢三分钟',
        plantAct: 1,
        payoffAct: 3,
      },
      {
        id: 'f-2',
        description: '书房录音机被误认为装饰品',
        plantAct: 1,
        payoffAct: 3,
      },
      {
        id: 'f-3',
        description: '凶手对停电路线异常熟悉',
        plantAct: 2,
        payoffAct: 3,
      },
    ],
  };
}

async function persistStoryBible(
  scriptId: string,
  params: ScriptGenerationParams,
  json: StoryBibleJson,
  startedAt: Date,
): Promise<string | null> {
  const supabase = await createGenerationDbClient();
  const { data: upsertedData, error: upsertError } = await supabase
    .from('story_bibles')
    .upsert(
      {
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
      },
      { onConflict: 'script_id' },
    )
    .select('id')
    .single();

  if (upsertError) {
    const missingStoryBibleTable =
      upsertError.code === 'PGRST205' ||
      upsertError.message.includes("Could not find the table 'public.story_bibles'");

    if (missingStoryBibleTable) {
      console.warn(
        'story_bibles table is missing; returning story bible without persistence. Run supabase migrations to enable resume/gate persistence.',
      );
      return null;
    }

    throw new Error(`Story bible upsert failed: ${upsertError.message}`);
  }

  const storyBibleId = upsertedData?.id as string;
  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'STORY_BIBLE',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { storyBibleId },
    started_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (taskError) {
    console.warn(`Generation task insert failed; continuing without task record: ${taskError.message}`);
  }

  return storyBibleId;
}

function buildMockCharacterProfiles(storyBible: StoryBibleJson): CharacterProfilesJson {
  return {
    characters: storyBible.characterSkeleton.nodes.map((node, index) => ({
      name: node.name,
      roleIdentity: node.identity,
      gender: index % 3 === 0 ? 'male' : index % 3 === 1 ? 'female' : 'unknown',
      age: 24 + index * 4,
      personality: index === 0 ? '克制、敏锐、习惯掌控局面' : '外热内冷，擅长隐藏真实情绪',
      backgroundStory: `${node.name}与旧案存在牵连，表面身份是${node.identity}，真实秘密是：${node.secret}`,
      personalTask: index === 0 ? '掩盖旧案证据并转移众人怀疑' : '查清聚会背后的真实目的',
      isMurderer: node.name === storyBible.murdererName,
      secretFromBible: node.secret,
    })),
  };
}

function buildMockActStructure(params: ScriptGenerationParams, storyBible: StoryBibleJson): ActStructureJson {
  const actCount = Math.min(5, Math.max(3, Math.ceil(params.duration / 1.5)));
  return {
    acts: Array.from({ length: actCount }, (_, index) => {
      const sortOrder = index + 1;
      return {
        title:
          sortOrder === 1
            ? '第一幕 · 旧镇邀约'
            : sortOrder === actCount
              ? `第${sortOrder}幕 · 真相回声`
              : `第${sortOrder}幕 · 疑云加深`,
        sortOrder,
        content:
          sortOrder === 1
            ? `众人因${params.title}聚集，${storyBible.coreTrick}的第一处伏笔被埋下。`
            : sortOrder === actCount
              ? `回收${storyBible.murderMethod}与关键证词，揭开${storyBible.murdererName}的动机链。`
              : '玩家通过证词冲突、地点搜证和人物秘密逐步逼近死亡时间真相。',
        scenes: [
          {
            title: sortOrder === 1 ? '抵达古镇' : `搜证现场 ${sortOrder}`,
            location: sortOrder === 1 ? '古镇客栈' : ['祠堂', '书房', '码头', '药铺'][index % 4],
            content: '玩家收集证词，发现时间线与人物陈述存在细微矛盾。',
            sortOrder: 1,
          },
          {
            title: sortOrder === actCount ? '终局复盘' : `秘密交锋 ${sortOrder}`,
            location: sortOrder === actCount ? '旧钟楼' : ['后院', '档案室', '茶室', '暗巷'][index % 4],
            content: '关键人物暴露隐藏关系，新的线索指向旧案真相。',
            sortOrder: 2,
          },
        ],
        searchRounds: [
          {
            round: sortOrder,
            locations: ['古镇客栈', '旧钟楼', '祠堂'].slice(0, sortOrder === 1 ? 2 : 3),
          },
        ],
      };
    }),
  };
}

async function getStoryBibleForPhase(body: GenerateRequestBody): Promise<StoryBibleJson> {
  if (body.storyBible) {
    return body.storyBible;
  }

  const supabase = await createGenerationDbClient();
  const { data, error } = await supabase
    .from('story_bibles')
    .select(
      'murderer_character_name, murder_method, core_trick, motive_chain, character_skeleton, timeline_outline, truth_summary, foreshadowing_plan',
    )
    .eq('script_id', body.scriptId)
    .single();

  if (error || !data) {
    throw new Error('Story bible is required for this phase');
  }

  return {
    murdererName: data.murderer_character_name,
    murderMethod: data.murder_method,
    coreTrick: data.core_trick,
    motiveChain: data.motive_chain,
    characterSkeleton: data.character_skeleton,
    timelineOutline: data.timeline_outline,
    truthSummary: data.truth_summary,
    foreshadowingPlan: data.foreshadowing_plan,
  };
}

async function getCharacterProfilesForPhase(body: GenerateRequestBody): Promise<CharacterProfilesJson> {
  if (body.characterProfiles?.characters?.length) {
    return body.characterProfiles;
  }

  const supabase = await createGenerationDbClient();
  const { data, error } = await supabase
    .from('characters')
    .select('name, role_identity, gender, age, personality, background_story, personal_task, is_murderer')
    .eq('script_id', body.scriptId)
    .order('sort_order');

  if (error || !data?.length) {
    throw new Error('Character profiles are required for character script generation');
  }

  const storyBible = await getStoryBibleForPhase(body);
  return {
    characters: data.map((row) => {
      const bibleNode = storyBible.characterSkeleton.nodes.find((node) => node.name === row.name);
      return {
        name: row.name,
        roleIdentity: row.role_identity,
        gender: row.gender,
        age: row.age,
        personality: row.personality,
        backgroundStory: row.background_story,
        personalTask: row.personal_task,
        isMurderer: row.is_murderer,
        secretFromBible: bibleNode?.secret ?? '',
      };
    }),
  };
}

async function getActStructureForPhase(body: GenerateRequestBody): Promise<ActStructureJson> {
  if (body.actStructure?.acts?.length) {
    return body.actStructure;
  }

  const supabase = await createGenerationDbClient();
  const { data: acts, error } = await supabase
    .from('acts')
    .select('id, title, sort_order, content, scenes(title, location, content, sort_order)')
    .eq('script_id', body.scriptId)
    .order('sort_order');

  if (error || !acts?.length) {
    throw new Error('Act structure is required for character script generation');
  }

  return {
    acts: acts.map((act) => ({
      title: act.title,
      sortOrder: act.sort_order,
      content: act.content,
      scenes: (act.scenes ?? []).map(
        (scene: { title: string; location: string; content: string; sort_order: number }) => ({
          title: scene.title,
          location: scene.location,
          content: scene.content,
          sortOrder: scene.sort_order,
        }),
      ),
      searchRounds: [],
    })),
  };
}

function getCharacterForScript(
  body: GenerateRequestBody,
  profiles: CharacterProfilesJson,
): CharacterProfile {
  if (!body.characterId) {
    throw new Error('characterId is required');
  }

  const mockMatch = body.characterId.match(/^mock-character-(\d+)$/);
  if (mockMatch) {
    const index = Number(mockMatch[1]) - 1;
    const character = profiles.characters[index];
    if (character) return character;
  }

  const byName = profiles.characters.find((character) => character.name === body.characterId);
  if (byName) return byName;

  throw new Error(`Character not found for id ${body.characterId}`);
}

async function runJsonPhase<T>(
  phase: string,
  scriptId: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.6,
  onComplete?: (result: T) => Promise<void>,
): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        if (!process.env.DEEPSEEK_API_KEY) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: 'AI_GENERATION_MODE=real requires DEEPSEEK_API_KEY',
            }),
          );
          return;
        }

        const provider = new DeepSeekProvider();
        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: `${phase}-init`, ...generationMeta() }));

        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature,
          onChunk: (content) => {
            accumulated += content;
          },
        })) {
          if (chunk.content) controller.enqueue(encodeSse(encoder, 'chunk', { content: chunk.content }));
          if (typeof chunk.progress === 'number') {
            controller.enqueue(encodeSse(encoder, 'progress', { percent: Math.round(chunk.progress * 100) }));
          }
          if (chunk.done) break;
        }

        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }));
        const result = await parseOrRepairJson<T>(accumulated, phase);
        await onComplete?.(result);
        controller.enqueue(encodeSse(encoder, 'completed', { scriptId, result }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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

async function persistCharacterProfiles(
  scriptId: string,
  params: ScriptGenerationParams,
  json: CharacterProfilesJson,
): Promise<void> {
  const supabase = await createGenerationDbClient();
  const { error: deleteError } = await supabase.from('characters').delete().eq('script_id', scriptId);
  if (deleteError) {
    console.warn(`Character cleanup failed; continuing without persistence: ${deleteError.message}`);
    return;
  }

  const { error: insertError } = await supabase.from('characters').insert(
    json.characters.map((character, index) => ({
      script_id: scriptId,
      name: character.name,
      role_identity: character.roleIdentity,
      gender: character.gender,
      age: character.age,
      personality: character.personality,
      background_story: character.backgroundStory,
      personal_task: character.personalTask,
      is_murderer: character.isMurderer,
      sort_order: index,
    })),
  );
  if (insertError) {
    console.warn(`Character insert failed; continuing without persistence: ${insertError.message}`);
    return;
  }

  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'CHARACTER_PROFILES',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { characterCount: json.characters.length },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (taskError) console.warn(`Character task insert failed; continuing: ${taskError.message}`);
}

async function persistActStructure(
  scriptId: string,
  params: ScriptGenerationParams,
  json: ActStructureJson,
): Promise<number> {
  const supabase = await createGenerationDbClient();
  const { error: deleteError } = await supabase.from('acts').delete().eq('script_id', scriptId);
  if (deleteError) {
    console.warn(`Act cleanup failed; continuing without persistence: ${deleteError.message}`);
    return json.acts.reduce((sum, act) => sum + act.scenes.length, 0);
  }

  let sceneCount = 0;
  for (const act of json.acts) {
    const { data: actData, error: actError } = await supabase
      .from('acts')
      .insert({
        script_id: scriptId,
        title: act.title,
        sort_order: act.sortOrder,
        content: act.content,
      })
      .select('id')
      .single();
    if (actError) {
      console.warn(`Act insert failed; continuing without persistence: ${actError.message}`);
      return json.acts.reduce((sum, currentAct) => sum + currentAct.scenes.length, 0);
    }

    const { error: sceneError } = await supabase.from('scenes').insert(
      act.scenes.map((scene) => ({
        act_id: actData.id,
        title: scene.title,
        location: scene.location,
        content: scene.content,
        sort_order: scene.sortOrder,
      })),
    );
    if (sceneError) {
      console.warn(`Scene insert failed; continuing without persistence: ${sceneError.message}`);
      return json.acts.reduce((sum, currentAct) => sum + currentAct.scenes.length, 0);
    }
    sceneCount += act.scenes.length;
  }

  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'ACT_STRUCTURE',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { actCount: json.acts.length, sceneCount },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (taskError) console.warn(`Act task insert failed; continuing: ${taskError.message}`);

  return sceneCount;
}

async function handleMockPhase(
  phase: 'character-profiles' | 'act-structure',
  body: GenerateRequestBody,
): Promise<Response> {
  const { scriptId, params } = body;
  const storyBible = buildMockStoryBible(params);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: `${phase}-init`, ...generationMeta() }));

        if (phase === 'character-profiles') {
          const json = buildMockCharacterProfiles(storyBible);
          await persistCharacterProfiles(scriptId, params, json);
          controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'mock' }));
          controller.enqueue(
            encodeSse(encoder, 'completed', {
              scriptId,
              characterCount: json.characters.length,
              result: json,
            }),
          );
          return;
        }

        const json = buildMockActStructure(params, storyBible);
        const sceneCount = await persistActStructure(scriptId, params, json);
        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'mock' }));
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            actCount: json.acts.length,
            sceneCount,
            result: json,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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

function handleGenericMockPhase(phase: string, body: GenerateRequestBody): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encodeSse(encoder, 'start', { scriptId: body.scriptId, stage: `${phase}-mock`, ...generationMeta() }));
      controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'mock' }));
      controller.enqueue(
        encodeSse(encoder, 'completed', {
          scriptId: body.scriptId,
          result: { phase, mocked: true },
        }),
      );
      controller.close();
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

async function handleCharacterProfiles(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        if (!process.env.DEEPSEEK_API_KEY) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: 'AI_GENERATION_MODE=real requires DEEPSEEK_API_KEY',
            }),
          );
          return;
        }

        const storyBible = await getStoryBibleForPhase(body);
        const { systemPrompt, userPrompt } = buildCharacterProfilesPrompt({ params, storyBible });
        const provider = new DeepSeekProvider();

        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'character-profiles-init', ...generationMeta() }));
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.7,
          onChunk: (content) => {
            accumulated += content;
          },
        })) {
          if (chunk.content) controller.enqueue(encodeSse(encoder, 'chunk', { content: chunk.content }));
          if (typeof chunk.progress === 'number') {
            controller.enqueue(encodeSse(encoder, 'progress', { percent: Math.round(chunk.progress * 100) }));
          }
          if (chunk.done) break;
        }

        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }));
        const json = await parseOrRepairJson<CharacterProfilesJson>(accumulated, 'CharacterProfilesJson');

        if (!Array.isArray(json.characters) || json.characters.length === 0) {
          controller.enqueue(encodeSse(encoder, 'error', { message: 'Character profiles result is empty' }));
          return;
        }

        await persistCharacterProfiles(scriptId, params, json);
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            characterCount: json.characters.length,
            result: json,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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

async function handleActStructure(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        if (!process.env.DEEPSEEK_API_KEY) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: 'AI_GENERATION_MODE=real requires DEEPSEEK_API_KEY',
            }),
          );
          return;
        }

        const storyBible = await getStoryBibleForPhase(body);
        const { systemPrompt, userPrompt } = buildActStructurePrompt({ params, storyBible });
        const provider = new DeepSeekProvider();

        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'act-structure-init', ...generationMeta() }));
        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.6,
          onChunk: (content) => {
            accumulated += content;
          },
        })) {
          if (chunk.content) controller.enqueue(encodeSse(encoder, 'chunk', { content: chunk.content }));
          if (typeof chunk.progress === 'number') {
            controller.enqueue(encodeSse(encoder, 'progress', { percent: Math.round(chunk.progress * 100) }));
          }
          if (chunk.done) break;
        }

        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }));
        const json = await parseOrRepairJson<ActStructureJson>(accumulated, 'ActStructureJson');

        if (!Array.isArray(json.acts) || json.acts.length === 0) {
          controller.enqueue(encodeSse(encoder, 'error', { message: 'Act structure result is empty' }));
          return;
        }

        const sceneCount = await persistActStructure(scriptId, params, json);
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            actCount: json.acts.length,
            sceneCount,
            result: json,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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

async function persistCharacterScript(
  body: GenerateRequestBody,
  character: CharacterProfile,
  json: CharacterScriptJson,
): Promise<void> {
  if (!body.characterId) {
    return;
  }

  const supabase = await createGenerationDbClient();
  let characterId = body.characterId;
  if (characterId.startsWith('mock-character-')) {
    const sortOrder = Number(characterId.match(/^mock-character-(\d+)$/)?.[1] ?? 1) - 1;
    const { data, error } = await supabase
      .from('characters')
      .select('id')
      .eq('script_id', body.scriptId)
      .eq('name', character.name)
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) {
      const { data: insertedCharacter, error: insertError } = await supabase
        .from('characters')
        .insert({
          script_id: body.scriptId,
          name: character.name,
          role_identity: character.roleIdentity,
          gender: character.gender,
          age: character.age,
          personality: character.personality,
          background_story: character.backgroundStory,
          personal_task: character.personalTask,
          is_murderer: character.isMurderer,
          sort_order: Math.max(0, sortOrder),
        })
        .select('id')
        .single();

      if (insertError || !insertedCharacter?.id) {
        throw new Error(
          `Character script persistence failed; character row not found for ${character.name}: ${
            error?.message ?? insertError?.message ?? 'unknown error'
          }`,
        );
      }
      characterId = insertedCharacter.id;
    } else {
      characterId = data.id;
    }
  }

  const wordCount = JSON.stringify(json.actScripts).length;
  const { error } = await supabase.from('character_scripts').upsert(
    {
      script_id: body.scriptId,
      character_id: characterId,
      act_scripts: json.actScripts,
      personal_arc: json.personalArc,
      visible_clue_titles: json.visibleClueTitles,
      perspective_note: json.perspectiveNote,
      is_murderer_script: character.isMurderer,
      word_count: wordCount,
      generation_status: 'completed',
    },
    { onConflict: 'script_id,character_id' },
  );

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(
        `character_scripts table is missing; storing character script in generation_tasks fallback: ${error.message}`,
      );
      await persistFallbackGenerationResult(body.scriptId, `character-script:${character.name}`, body.params, {
        characterId,
        characterName: character.name,
        script: json,
      });
      return;
    }
    throw new Error(`Character script upsert failed: ${error.message}`);
  }
}

function normalizeClueType(clueType: string): 'physical' | 'testimony' | 'deep' | 'hidden' {
  if (clueType === 'testimony' || clueType === 'deep' || clueType === 'hidden') return clueType;
  return 'physical';
}

async function persistClues(
  scriptId: string,
  params: ScriptGenerationParams,
  json: CluesJson,
): Promise<void> {
  const supabase = await createGenerationDbClient();
  const { data: characters, error: characterError } = await supabase
    .from('characters')
    .select('id, name')
    .eq('script_id', scriptId);

  if (characterError) {
    throw new Error(`Clue character lookup failed: ${characterError.message}`);
  }

  const characterIdsByName = new Map((characters ?? []).map((character) => [character.name, character.id]));

  const { error: deleteError } = await supabase.from('clues').delete().eq('script_id', scriptId);
  if (deleteError) {
    throw new Error(`Clue cleanup failed: ${deleteError.message}`);
  }

  if (json.clues.length > 0) {
    const { error: insertError } = await supabase.from('clues').insert(
      json.clues.map((clue, index) => ({
        script_id: scriptId,
        title: clue.title,
        content: clue.content,
        clue_type: normalizeClueType(clue.clueType),
        search_round: clue.searchRound,
        location: clue.location,
        related_character_ids: clue.relatedCharacterNames
          .map((name) => characterIdsByName.get(name))
          .filter((id): id is string => Boolean(id)),
        is_distractor: clue.isDistractor,
        is_key_clue: clue.isKeyClue,
        unlock_condition: clue.unlockCondition,
        sort_order: index,
      })),
    );

    if (insertError) {
      throw new Error(`Clue insert failed: ${insertError.message}`);
    }
  }

  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'CLUES',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { clueCount: json.clues.length },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (taskError) console.warn(`Clue task insert failed; continuing: ${taskError.message}`);
}

async function persistFallbackGenerationResult(
  scriptId: string,
  phase: string,
  params: ScriptGenerationParams,
  result: unknown,
): Promise<void> {
  const supabase = await createGenerationDbClient();
  const { error } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'FULL_SCRIPT',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { phase, result },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (error) {
    console.warn(`Fallback generation task insert failed for ${phase}; continuing: ${error.message}`);
  }
}

async function persistOrganizerManual(
  scriptId: string,
  params: ScriptGenerationParams,
  json: OrganizerManualJson,
): Promise<void> {
  const supabase = await createGenerationDbClient();
  const { error } = await supabase.from('organizer_manuals').upsert(
    {
      script_id: scriptId,
      opening_flow: json.openingFlow,
      duration_control: json.durationControl,
      pacing_hints: json.pacingHints,
      npc_guide: json.npcGuide,
      mechanism_rules: json.mechanismRules,
    },
    { onConflict: 'script_id' },
  );

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(
        `organizer_manuals table is missing; storing organizer manual in generation_tasks fallback: ${error.message}`,
      );
      await persistFallbackGenerationResult(scriptId, 'organizer-manual', params, json);
      return;
    }
    throw new Error(`Organizer manual upsert failed: ${error.message}`);
  }

  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'ORGANIZER_MANUAL',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { openingFlowCount: json.openingFlow.length },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (taskError) console.warn(`Organizer manual task insert failed; continuing: ${taskError.message}`);
}

async function persistTruthReview(
  scriptId: string,
  params: ScriptGenerationParams,
  json: TruthReviewJson,
): Promise<void> {
  const supabase = await createGenerationDbClient();
  const { error } = await supabase.from('truth_reviews').upsert(
    {
      script_id: scriptId,
      full_summary: json.fullSummary,
      method_detail: json.methodDetail,
      motive_detail: json.motiveDetail,
      character_endings: json.characterEndings,
      foreshadowing_resolution: json.foreshadowingResolution,
      timeline_full: json.timelineFull,
    },
    { onConflict: 'script_id' },
  );

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(`truth_reviews table is missing; storing truth review in generation_tasks fallback: ${error.message}`);
      await persistFallbackGenerationResult(scriptId, 'truth-review', params, json);
      return;
    }
    throw new Error(`Truth review upsert failed: ${error.message}`);
  }

  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'TRUTH_REVIEW',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { characterEndingCount: json.characterEndings.length },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (taskError) console.warn(`Truth review task insert failed; continuing: ${taskError.message}`);
}

async function handleCharacterScript(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        if (!process.env.DEEPSEEK_API_KEY) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: 'AI_GENERATION_MODE=real requires DEEPSEEK_API_KEY',
            }),
          );
          return;
        }

        const [storyBible, characterProfiles, actStructure] = await Promise.all([
          getStoryBibleForPhase(body),
          getCharacterProfilesForPhase(body),
          getActStructureForPhase(body),
        ]);
        const character = getCharacterForScript(body, characterProfiles);
        const { systemPrompt, userPrompt } = buildCharacterScriptPrompt({
          params,
          storyBible,
          character,
          actStructure,
        });
        const provider = new DeepSeekProvider();

        controller.enqueue(
          encodeSse(encoder, 'start', {
            scriptId,
            characterId: body.characterId,
            stage: 'character-script-init',
            ...generationMeta(),
          }),
        );

        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.7,
          onChunk: (content) => {
            accumulated += content;
          },
        })) {
          if (chunk.content) controller.enqueue(encodeSse(encoder, 'chunk', { content: chunk.content }));
          if (typeof chunk.progress === 'number') {
            controller.enqueue(encodeSse(encoder, 'progress', { percent: Math.round(chunk.progress * 100) }));
          }
          if (chunk.done) break;
        }

        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }));
        let json: CharacterScriptJson;
        try {
          json = await parseOrRepairJson<CharacterScriptJson>(accumulated, 'CharacterScriptJson');
        } catch (parseError) {
          const parseMessage = parseError instanceof Error ? parseError.message : 'JSON parse failed';
          json = {
            characterName: character.name,
            actScripts: actStructure.acts.map((act) => ({
              actTitle: act.title,
              content: `该角色剧本生成内容 JSON 格式异常，已保留流程继续。原始错误：${parseMessage}`,
              scenes: act.scenes.map((scene) => ({
                title: scene.title,
                content: scene.content,
              })),
            })),
            personalArc: character.personalTask,
            visibleClueTitles: [],
            perspectiveNote: `原始模型输出 JSON 格式异常，可重试该角色。错误：${parseMessage}`,
          };
        }

        if (!Array.isArray(json.actScripts) || json.actScripts.length === 0) {
          controller.enqueue(encodeSse(encoder, 'error', { message: 'Character script result is empty' }));
          return;
        }

        await persistCharacterScript(body, character, json);
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            characterId: body.characterId,
            result: json,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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

async function handleClues(body: GenerateRequestBody): Promise<Response> {
  const [storyBible, actStructure] = await Promise.all([
    getStoryBibleForPhase(body),
    getActStructureForPhase(body),
  ]);
  const { systemPrompt, userPrompt } = buildCluesPrompt({
    params: body.params,
    storyBible,
    actStructure,
  });
  return runJsonPhase<CluesJson>('clues', body.scriptId, systemPrompt, userPrompt, 0.6, (json) =>
    persistClues(body.scriptId, body.params, json),
  );
}

async function handleOrganizerManual(body: GenerateRequestBody): Promise<Response> {
  const [storyBible, actStructure] = await Promise.all([
    getStoryBibleForPhase(body),
    getActStructureForPhase(body),
  ]);
  const { systemPrompt, userPrompt } = buildOrganizerManualPrompt({
    params: body.params,
    storyBible,
    actStructure,
  });
  return runJsonPhase<OrganizerManualJson>(
    'organizer-manual',
    body.scriptId,
    systemPrompt,
    userPrompt,
    0.5,
    (json) => persistOrganizerManual(body.scriptId, body.params, json),
  );
}

async function handleTruthReview(body: GenerateRequestBody): Promise<Response> {
  const [storyBible, actStructure] = await Promise.all([
    getStoryBibleForPhase(body),
    getActStructureForPhase(body),
  ]);
  const clues = body.clues ?? { clues: [] };
  const { systemPrompt, userPrompt } = buildTruthReviewPrompt({
    params: body.params,
    storyBible,
    actStructure,
    characterScripts: body.characterScripts ?? [],
    clues,
  });
  return runJsonPhase<TruthReviewJson>(
    'truth-review',
    body.scriptId,
    systemPrompt,
    userPrompt,
    0.5,
    (json) => persistTruthReview(body.scriptId, body.params, json),
  );
}

async function handleStoryBible(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;
  const { systemPrompt, userPrompt } = buildStoryBiblePrompt(params);
  const provider = new DeepSeekProvider();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'story-bible-init', ...generationMeta() }));

        if (getGenerationMode() === 'mock') {
          const json = buildMockStoryBible(params);
          const storyBibleId = await persistStoryBible(scriptId, params, json, startedAt);
          controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'mock' }));
          controller.enqueue(
            encodeSse(encoder, 'completed', {
              scriptId,
              storyBibleId,
              result: json,
            }),
          );
          return;
        }

        if (!process.env.DEEPSEEK_API_KEY) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: 'AI_GENERATION_MODE=real requires DEEPSEEK_API_KEY',
            }),
          );
          return;
        }

        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.6,
          onChunk: (content) => {
            accumulated += content;
          },
        })) {
          if (chunk.content) {
            controller.enqueue(encodeSse(encoder, 'chunk', { content: chunk.content }));
          }
          if (typeof chunk.progress === 'number') {
            controller.enqueue(
              encodeSse(encoder, 'progress', { percent: Math.round(chunk.progress * 100) }),
            );
          }
          if (chunk.done) break;
        }

        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }));
        const json = await parseOrRepairJson<StoryBibleJson>(accumulated, 'StoryBibleJson');
        const validationErrors = validateStoryBible(json, params.players);
        if (validationErrors.length > 0) {
          controller.enqueue(encodeSse(encoder, 'error', { message: validationErrors.join('; ') }));
          return;
        }

        const storyBibleId = await persistStoryBible(scriptId, params, json, startedAt);

        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            storyBibleId,
            result: json,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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

async function proxySupabaseGenerate(
  request: NextRequest,
  phase: string,
  body: GenerateRequestBody,
): Promise<Response> {
  const authorization = request.headers.get('authorization');
  const apikey = request.headers.get('apikey') ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!authorization) {
    return buildError('Missing authorization header', 401);
  }

  if (!apikey) {
    return buildError('Missing Supabase anon key', 500);
  }

  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/generate/${phase}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey,
      'Content-Type': 'application/json',
      Accept: request.headers.get('accept') ?? 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') ?? 'no-cache, no-transform',
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ phase: string }> },
): Promise<Response> {
  if (!SUPABASE_URL) {
    return buildError('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }

  const { phase } = await context.params;
  if (phase === 'story-bible') {
    const body: unknown = await request.json().catch(() => null);
    if (!validateBody(body)) {
      return buildError('Invalid parameters', 400);
    }
    return handleStoryBible(body);
  }

  if (phase === 'character-profiles' || phase === 'act-structure') {
    const body: unknown = await request.json().catch(() => null);
    if (!validateBody(body)) {
      return buildError('Invalid parameters', 400);
    }
    if (getGenerationMode() === 'real') {
      if (phase === 'character-profiles') {
        return handleCharacterProfiles(body);
      }
      return handleActStructure(body);
    }
    return handleMockPhase(phase, body);
  }

  if (
    phase === 'character-script' ||
    phase === 'clues' ||
    phase === 'organizer-manual' ||
    phase === 'truth-review'
  ) {
    const body: unknown = await request.json().catch(() => null);
    if (!validateBody(body)) {
      return buildError('Invalid parameters', 400);
    }
    if (getGenerationMode() === 'real') {
      if (phase === 'character-script') {
        return handleCharacterScript(body);
      }
      if (phase === 'clues') {
        return handleClues(body);
      }
      if (phase === 'organizer-manual') {
        return handleOrganizerManual(body);
      }
      return handleTruthReview(body);
    }
    return handleGenericMockPhase(phase, body);
  }

  const body: unknown = await request.json().catch(() => null);
  if (!validateBody(body)) {
    return buildError('Invalid parameters', 400);
  }
  return proxySupabaseGenerate(request, phase, body);
}
