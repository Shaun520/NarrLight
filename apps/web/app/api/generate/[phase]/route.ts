import { NextRequest } from 'next/server';
import { parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  getTextProviderInstance,
  getGenerationSpecConfig,
  isProviderKeyConfigured,
} from '@/lib/services/ai-config-service';
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
import {
  buildTimelineStructurePrompt,
  type TimelineStructureJson,
  type TimelineStructureEvent,
} from '@/lib/ai/prompts/timeline-structure';
import type { AIProvider } from '@/lib/ai/providers/base-provider';
import type { PlayerPackageContent } from '@narrlight/shared';
import { illustrationWorkflowService } from '@/lib/services/illustration-workflow-service';
import {
  QuotaService,
  type GenerationCreditPhase,
} from '@/lib/services/quota-service';
import { ApiError } from '@/lib/api/response';
import { buildGenerationSpec } from '@/lib/generation/spec';
import {
  appendKnowledgeToPrompt,
  recordKnowledgeUsages,
  recordQualityReport,
  retrieveStageKnowledge,
  type GenerationKnowledgeItem,
  type GenerationKnowledgeStage,
} from '@/lib/generation/knowledge';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const GENERATION_MODE = process.env.AI_GENERATION_MODE ?? 'mock';

type GenerationMode = 'mock' | 'real';

interface GenerateRequestBody {
  scriptId: string;
  params: ScriptGenerationParams;
  generationTaskId?: string;
  characterId?: string;
  scriptPartIndex?: number;
  scriptPartLabel?: string;
  actOrder?: number;
  storyBible?: StoryBibleJson;
  characterProfiles?: CharacterProfilesJson;
  actStructure?: ActStructureJson;
  characterScripts?: CharacterScriptJson[];
  clues?: CluesJson;
  /** truth_reviews.timeline_full 鍘熸枃锛坱imeline-structure 闃舵浣跨敤锛?*/
  timelineFull?: string;
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

function buildApiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  throw error;
}

function getGenerationMode(): GenerationMode {
  if (GENERATION_MODE === 'real') return 'real';
  if (GENERATION_MODE === 'mock') return 'mock';

  console.warn(`Unknown AI_GENERATION_MODE "${GENERATION_MODE}", falling back to mock mode.`);
  return 'mock';
}

function generationMeta(providerName?: string, modelName?: string) {
  const mode = getGenerationMode();
  return {
    mode,
    provider: mode === 'real' ? providerName ?? 'configured' : 'local',
    model: mode === 'real' ? modelName ?? 'configured' : 'mock',
  };
}

async function prepareKnowledgePrompt(input: {
  stage: GenerationKnowledgeStage;
  params: ScriptGenerationParams;
  userPrompt: string;
}) {
  const supabase = await createGenerationDbClient();
  const items = await retrieveStageKnowledge(supabase, {
    stage: input.stage,
    params: input.params,
  });
  return {
    supabase,
    items,
    userPrompt: appendKnowledgeToPrompt(input.userPrompt, items),
  };
}

async function recordKnowledgePhase(input: {
  supabase: Awaited<ReturnType<typeof createGenerationDbClient>>;
  generationTaskId?: string;
  scriptId: string;
  stage: GenerationKnowledgeStage;
  moduleType: string;
  items: GenerationKnowledgeItem[];
  content: unknown;
}) {
  await recordKnowledgeUsages(input.supabase, {
    generationTaskId: input.generationTaskId,
    scriptId: input.scriptId,
    stage: input.stage,
    moduleType: input.moduleType,
    items: input.items,
  });
  await recordQualityReport(input.supabase, {
    generationTaskId: input.generationTaskId,
    scriptId: input.scriptId,
    stage: input.stage,
    moduleType: input.moduleType,
    content: input.content,
  });
}

function phaseToTaskType(phase: string): string {
  const map: Record<string, string> = {
    'story-bible': 'STORY_BIBLE',
    'character-profiles': 'CHARACTER_PROFILES',
    'act-structure': 'ACT_STRUCTURE',
    'character-script': 'CHARACTER_SCRIPT',
    clues: 'CLUES',
    'organizer-manual': 'ORGANIZER_MANUAL',
    'truth-review': 'TRUTH_REVIEW',
    'timeline-structure': 'TIMELINE_STRUCTURE',
  };
  return map[phase] ?? 'FULL_SCRIPT';
}

async function createRunningGenerationTask(args: {
  scriptId: string;
  phase: GenerationCreditPhase;
  params: ScriptGenerationParams;
  chargedCredits: number;
}): Promise<string> {
  const supabase = await createGenerationDbClient();
  const { data, error } = await supabase
    .from('generation_tasks')
    .insert({
      script_id: args.scriptId,
      task_type: phaseToTaskType(args.phase),
      status: 'running',
      params: args.params,
      progress_percent: 0,
      charged_credits: args.chargedCredits,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Generation task start insert failed: ${error.message}`);
  }

  return (data as { id: string }).id;
}

async function updateGenerationTaskResult(
  taskId: string | undefined,
  resultData: Record<string, unknown>,
): Promise<void> {
  if (!taskId) return;
  const supabase = await createGenerationDbClient();
  const { error } = await supabase
    .from('generation_tasks')
    .update({
      progress_percent: 100,
      result_data: resultData,
    })
    .eq('id', taskId);
  if (error) console.warn(`Generation task result update failed; continuing: ${error.message}`);
}

async function completeGenerationTask(taskId: string | null): Promise<void> {
  if (!taskId) return;
  const supabase = await createGenerationDbClient();
  const { error } = await supabase
    .from('generation_tasks')
    .update({
      status: 'completed',
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) console.warn(`Generation task completion update failed; continuing: ${error.message}`);
}

async function failGenerationTask(
  taskId: string | null,
  failureReason: string,
  refundCredits = 0,
): Promise<void> {
  if (!taskId) return;
  const supabase = await createGenerationDbClient();
  const { error } = await supabase
    .from('generation_tasks')
    .update({
      status: 'failed',
      error_message: failureReason,
      failure_reason: failureReason.slice(0, 100),
      refund_credits: refundCredits,
      quality_status: refundCredits > 0 ? 'refunded' : 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) console.warn(`Generation task failure update failed; continuing: ${error.message}`);
}

async function parseOrRepairJson<T>(text: string, schemaHint: string): Promise<T> {
  try {
    return parseJSONWithTolerance<T>(text);
  } catch (error) {
    const { provider } = await getTextProviderInstance();
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

function normalizeStoryBible(json: StoryBibleJson, players: number): StoryBibleJson {
  const skeleton =
    json.characterSkeleton && typeof json.characterSkeleton === 'object'
      ? json.characterSkeleton
      : { nodes: [], edges: [] };
  const rawNodes = Array.isArray(skeleton.nodes) ? skeleton.nodes : [];
  const rawEdges = Array.isArray(skeleton.edges) ? skeleton.edges : [];
  const normalizedNodes = rawNodes.slice(0, players).map((node, index) => ({
    name: String(node.name || `角色${index + 1}`),
    identity: String(node.identity || '待展开身份'),
    secret: String(node.secret || '与主线案件存在隐秘关联'),
  }));

  for (let index = normalizedNodes.length; index < players; index += 1) {
    normalizedNodes.push({
      name: `角色${index + 1}`,
      identity: '待展开身份',
      secret: '与主线案件存在隐秘关联',
    });
  }

  if (normalizedNodes.length > 0 && !normalizedNodes.some((node) => node.name === json.murdererName)) {
    normalizedNodes[0] = {
      ...normalizedNodes[0],
      name: json.murdererName || normalizedNodes[0].name,
    };
  }

  return {
    ...json,
    characterSkeleton: {
      nodes: normalizedNodes,
      edges: rawEdges.filter((edge) =>
        normalizedNodes.some((node) => node.name === edge.from) &&
        normalizedNodes.some((node) => node.name === edge.to),
      ),
    },
  };
}

function formatStoryBibleValidationErrors(errors: string[]): string {
  return errors
    .map((error) => {
      const nodesLengthMatch = error.match(/^characterSkeleton\.nodes length must be (\d+)$/);
      if (nodesLengthMatch) {
        return `人物关系骨架数量不正确，必须正好 ${nodesLengthMatch[1]} 个角色`;
      }
      const murdererMatch = error.match(/^murdererName "(.+)" is not in characterSkeleton\.nodes$/);
      if (murdererMatch) {
        return `凶手 "${murdererMatch[1]}" 必须出现在人物关系骨架中`;
      }
      return error;
    })
    .join('; ');
}

function buildMockStoryBible(params: ScriptGenerationParams): StoryBibleJson {
  const names = ['林少衡', '苏晚晴', '周知远', '许望', '陈沐舟', '顾明岚', '沈砚'];
  const nodes = Array.from({ length: params.players }, (_, index) => ({
    name: names[index] ?? `角色${index + 1}`,
    identity: index === 0 ? '旧案幸存者' : index === 1 ? '被害者亲属' : '受邀来客',
    secret:
      index === 0
        ? '曾在十年前篡改关键证据'
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
  taskId?: string,
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
  void startedAt;
  await updateGenerationTaskResult(taskId, { storyBibleId });

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
            ? `众人因《${params.title}》聚集，${storyBible.coreTrick}的第一处伏笔被埋下。`
            : sortOrder === actCount
              ? `回收${storyBible.murderMethod}与关键证词，揭开${storyBible.murdererName}的动机链。`
              : '玩家通过证词冲突、地点搜证和人物秘密逐步逼近死亡时间真相。',
        scenes: [
          {
            title: sortOrder === 1 ? '抵达旧镇' : `搜证现场 ${sortOrder}`,
            location: sortOrder === 1 ? '古镇客栈' : ['祠堂', '书房', '码头', '药铺'][index % 4],
            content: '玩家收集证词，发现时间线与人物陈述存在细微矛盾。',
            sortOrder: 1,
          },
          {
            title: sortOrder === actCount ? '终局复盘' : `秘密交错 ${sortOrder}`,
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

async function getCharacterScriptsForPhase(body: GenerateRequestBody): Promise<CharacterScriptJson[]> {
  if (body.characterScripts?.length) {
    return body.characterScripts;
  }

  const supabase = await createGenerationDbClient();
  const { data, error } = await supabase
    .from('character_scripts')
    .select('character_id, part_index, act_scripts, personal_arc, visible_clue_titles, perspective_note, characters(name, sort_order)')
    .eq('script_id', body.scriptId)
    .order('character_id')
    .order('part_index');

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Character scripts are required for truth review: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    act_scripts: CharacterScriptJson['actScripts'] | null;
    personal_arc: string | null;
    visible_clue_titles: string[] | null;
    perspective_note: string | null;
    characters?: { name?: string | null } | { name?: string | null }[] | null;
  }>).map((row) => {
    const characterRow = Array.isArray(row.characters) ? row.characters[0] : row.characters;
    return {
      characterName: characterRow?.name ?? '未知玩家',
      actScripts: row.act_scripts ?? [],
      personalArc: row.personal_arc ?? '',
      visibleClueTitles: row.visible_clue_titles ?? [],
      perspectiveNote: row.perspective_note ?? '',
    };
  });
}

async function getCluesForPhase(body: GenerateRequestBody): Promise<CluesJson> {
  if (body.clues?.clues?.length) {
    return body.clues;
  }

  const supabase = await createGenerationDbClient();
  const [{ data, error }, { data: characterRows }] = await Promise.all([
    supabase
    .from('clues')
    .select('title, content, clue_type, search_round, location, is_distractor, is_key_clue, unlock_condition, related_character_ids')
    .eq('script_id', body.scriptId)
    .order('sort_order'),
    supabase.from('characters').select('id, name').eq('script_id', body.scriptId),
  ]);

  if (error) {
    if (isMissingTableError(error)) return { clues: [] };
    throw new Error(`Clues are required for truth review: ${error.message}`);
  }

  const characterNamesById = new Map(
    ((characterRows ?? []) as Array<{ id: string; name: string }>).map((character) => [character.id, character.name]),
  );

  return {
    clues: ((data ?? []) as Array<{
      title: string | null;
      content: string | null;
      clue_type: string | null;
      search_round: number | null;
      location: string | null;
      is_distractor: boolean | null;
      is_key_clue: boolean | null;
      unlock_condition: string | null;
      related_character_ids: string[] | null;
    }>).map((row) => ({
      title: row.title ?? '',
      content: row.content ?? '',
      clueType: normalizeClueType(row.clue_type ?? 'physical'),
      searchRound: row.search_round ?? 1,
      location: row.location ?? '',
      relatedCharacterNames: (row.related_character_ids ?? [])
        .map((id) => characterNamesById.get(id))
        .filter((name): name is string => Boolean(name)),
      isDistractor: Boolean(row.is_distractor),
      isKeyClue: Boolean(row.is_key_clue),
      unlockCondition: row.unlock_condition ?? '',
      foreshadowingId: '',
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
        const { provider, name, runtime } = await getTextProviderInstance();
        if (!isProviderKeyConfigured(name)) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: `AI provider ${name} 的 API Key 未配置，无法生成剧本`,
            }),
          );
          return;
        }

        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: `${phase}-init`, ...generationMeta(name, runtime.model) }));

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
  taskId?: string,
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

  await updateGenerationTaskResult(taskId, { characterCount: json.characters.length });
}

async function persistActStructure(
  scriptId: string,
  params: ScriptGenerationParams,
  json: ActStructureJson,
  taskId?: string,
  generationSpec?: ReturnType<typeof buildGenerationSpec>,
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

  await updateGenerationTaskResult(taskId, { actCount: json.acts.length, sceneCount, generationSpec });

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
          await persistCharacterProfiles(scriptId, params, json, body.generationTaskId);
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

        const specConfig = await getGenerationSpecConfig();
        const spec = buildGenerationSpec(params, specConfig);
        const json = buildMockActStructure(params, storyBible);
        const sceneCount = await persistActStructure(scriptId, params, json, body.generationTaskId, spec);
        const result = { ...json, generationSpec: spec };
        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'mock' }));
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            actCount: json.acts.length,
            sceneCount,
            result,
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
        const { provider, name, runtime } = await getTextProviderInstance();
        if (!isProviderKeyConfigured(name)) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: `AI provider ${name} 的 API Key 未配置，无法生成剧本`,
            }),
          );
          return;
        }

        const storyBible = await getStoryBibleForPhase(body);
        const characterPrompt = buildCharacterProfilesPrompt({ params, storyBible });
        const {
          supabase: knowledgeSupabase,
          items: knowledgeItems,
          userPrompt,
        } = await prepareKnowledgePrompt({
          stage: 'characters',
          params,
          userPrompt: characterPrompt.userPrompt,
        });
        const systemPrompt = characterPrompt.systemPrompt;

        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'character-profiles-init', ...generationMeta(name, runtime.model) }));
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

        await persistCharacterProfiles(scriptId, params, json, body.generationTaskId);
        await recordKnowledgePhase({
          supabase: knowledgeSupabase,
          generationTaskId: body.generationTaskId,
          scriptId,
          stage: 'characters',
          moduleType: 'characters',
          items: knowledgeItems,
          content: json,
        });
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
        const { provider, name, runtime } = await getTextProviderInstance();
        if (!isProviderKeyConfigured(name)) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: `AI provider ${name} 的 API Key 未配置，无法生成剧本`,
            }),
          );
          return;
        }

        const storyBible = await getStoryBibleForPhase(body);
        const specConfig = await getGenerationSpecConfig();
        const spec = buildGenerationSpec(params, specConfig);
        const actPrompt = buildActStructurePrompt({
          params,
          storyBible,
          spec,
        });
        const {
          supabase: knowledgeSupabase,
          items: knowledgeItems,
          userPrompt,
        } = await prepareKnowledgePrompt({
          stage: 'acts',
          params,
          userPrompt: actPrompt.userPrompt,
        });
        const systemPrompt = actPrompt.systemPrompt;

        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'act-structure-init', ...generationMeta(name, runtime.model) }));
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

        const sceneCount = await persistActStructure(scriptId, params, json, body.generationTaskId, spec);
        await recordKnowledgePhase({
          supabase: knowledgeSupabase,
          generationTaskId: body.generationTaskId,
          scriptId,
          stage: 'acts',
          moduleType: 'acts',
          items: knowledgeItems,
          content: json,
        });
        const result = { ...json, generationSpec: spec };
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            actCount: json.acts.length,
            sceneCount,
            result,
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

function countTextWords(...values: unknown[]): number {
  return values
    .flatMap((value): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap((item) => countTextSource(item));
      if (value && typeof value === 'object') return Object.values(value).flatMap((item) => countTextSource(item));
      return [];
    })
    .join('')
    .replace(/\s+/g, '')
    .length;
}

function countTextSource(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => countTextSource(item));
  if (value && typeof value === 'object') return Object.values(value).flatMap((item) => countTextSource(item));
  return [];
}

function countCharacterScriptWords(json: CharacterScriptJson): number {
  return countTextWords(
    json.personalArc,
    json.perspectiveNote,
    json.visibleClueTitles,
    json.actScripts.map((act) => [
      act.content,
      act.scenes.map((scene) => scene.content),
    ]),
  );
}

function resolveCharacterScriptMaxTokens(minWords: number): number {
  return Math.min(32000, Math.max(8000, Math.ceil(minWords * 2.4)));
}

async function expandCharacterScriptToMinimum(args: {
  provider: AIProvider;
  json: CharacterScriptJson;
  minWords: number;
  currentWords: number;
  character: CharacterProfile;
  partLabel: string;
}): Promise<CharacterScriptJson> {
  const { provider, json, minWords, currentWords, character, partLabel } = args;
  const prompt = [
    `当前玩家：${character.name}（${character.roleIdentity}）`,
    `当前分册：${partLabel}`,
    `当前可读正文约 ${currentWords} 字，最低要求 ${minWords} 字。`,
    '',
    '请在不改变事实、不改变 JSON 结构、不新增字段的前提下扩写下面的玩家剧本 JSON。',
    '扩写重点：actScripts[].content、actScripts[].scenes[].content、personalArc、perspectiveNote。',
    '要求：只返回合法 JSON；最终可读正文必须不少于最低字数；不要用重复句、空话或字段名凑字数。',
    '',
    JSON.stringify(json),
  ].join('\n');

  const expanded = await provider.generate({
    systemPrompt: '你是剧本杀玩家剧本扩写编辑。只返回合法 JSON，不要 markdown，不要解释。',
    prompt,
    temperature: 0.5,
    maxTokens: resolveCharacterScriptMaxTokens(minWords),
  });

  return parseOrRepairJson<CharacterScriptJson>(expanded, 'CharacterScriptJson');
}

async function ensurePlayerIdentityAssignment(args: {
  supabase: Awaited<ReturnType<typeof createGenerationDbClient>>;
  scriptId: string;
  characterId: string;
  character: CharacterProfile;
  partIndex: number;
}): Promise<{ playerSeatId: string | null; identityAssignmentId: string | null }> {
  const { supabase, scriptId, characterId, character, partIndex } = args;
  const { data: characterRows } = await supabase
    .from('characters')
    .select('id, sort_order')
    .eq('script_id', scriptId)
    .order('sort_order');
  const currentCharacter = ((characterRows ?? []) as Array<{ id: string; sort_order: number }>).find(
    (row) => row.id === characterId,
  );
  const seatNo = Math.max(1, (currentCharacter?.sort_order ?? 0) + 1);

  const { data: seat, error: seatError } = await supabase
    .from('player_seats')
    .upsert(
      {
        script_id: scriptId,
        seat_no: seatNo,
        display_name: `玩家${seatNo}`,
      },
      { onConflict: 'script_id,seat_no' },
    )
    .select('id')
    .single();

  if (seatError || !seat?.id) {
    if (isMissingTableError(seatError)) {
      return { playerSeatId: null, identityAssignmentId: null };
    }
    throw new Error(`Player seat upsert failed: ${seatError?.message ?? 'unknown error'}`);
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('player_identity_assignments')
    .upsert(
      {
        script_id: scriptId,
        player_seat_id: seat.id,
        character_id: characterId,
        identity_label: character.roleIdentity || character.name,
        identity_order: partIndex,
      },
      { onConflict: 'script_id,player_seat_id,identity_order' },
    )
    .select('id')
    .single();

  if (assignmentError || !assignment?.id) {
    if (isMissingTableError(assignmentError)) {
      return { playerSeatId: seat.id, identityAssignmentId: null };
    }
    throw new Error(`Player identity assignment upsert failed: ${assignmentError?.message ?? 'unknown error'}`);
  }

  return { playerSeatId: seat.id, identityAssignmentId: assignment.id };
}

function buildPlayerPackageContent(args: {
  character: CharacterProfile;
  json: CharacterScriptJson;
  partLabel: string;
  partIndex: number;
  actOrder?: number;
}): PlayerPackageContent {
  const { character, json, partLabel, partIndex, actOrder } = args;
  return {
    cover: {
      title: partLabel || `第${partIndex}本玩家资料包`,
      subtitle: character.roleIdentity || character.name,
    },
    prologue: json.actScripts[0]?.content,
    publicIdentity: character.roleIdentity,
    privateBackground: character.backgroundStory,
    hiddenSecrets: json.perspectiveNote ? [json.perspectiveNote] : [],
    globalObjectives: character.personalTask ? [character.personalTask] : [],
    actMaterials: json.actScripts.map((act, index) => ({
      actOrder: actOrder ?? index + 1,
      actTitle: act.actTitle || `第${index + 1}幕`,
      mainText: act.content,
      knownFacts: json.visibleClueTitles,
      objectives: character.personalTask ? [character.personalTask] : [],
      pauseInstruction: `${character.name}，先在这里等一等吧。`,
    })),
    endingPrompt: json.personalArc,
  };
}

async function persistPlayerPackage(args: {
  supabase: Awaited<ReturnType<typeof createGenerationDbClient>>;
  body: GenerateRequestBody;
  character: CharacterProfile;
  json: CharacterScriptJson;
  playerSeatId: string | null;
  identityAssignmentId: string | null;
  partIndex: number;
  partLabel: string;
  wordCount: number;
}): Promise<void> {
  const { supabase, body, character, json, playerSeatId, identityAssignmentId, partIndex, partLabel, wordCount } = args;
  if (!playerSeatId) return;

  const content = buildPlayerPackageContent({
    character,
    json,
    partLabel,
    partIndex,
    actOrder: body.actOrder,
  });

  const { error } = await supabase.from('player_packages').upsert(
    {
      script_id: body.scriptId,
      player_seat_id: playerSeatId,
      identity_assignment_id: identityAssignmentId,
      package_order: partIndex,
      package_title: partLabel,
      current_identity: character.roleIdentity || character.name,
      read_order: partIndex,
      package_type: body.actOrder ? 'act' : partIndex === 1 ? 'initial' : 'supplement',
      content_json: content,
      word_count: wordCount,
      generation_status: 'completed',
    },
    { onConflict: 'script_id,player_seat_id,package_order' },
  );

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(`player_packages table is missing; skipped player package persistence: ${error.message}`);
      return;
    }
    throw new Error(`Player package upsert failed: ${error.message}`);
  }
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

  const partIndex = Math.max(1, body.scriptPartIndex ?? 1);
  const wordCount = countCharacterScriptWords(json);
  const partLabel = body.scriptPartLabel || '完整玩家剧本';
  const { playerSeatId, identityAssignmentId } = await ensurePlayerIdentityAssignment({
    supabase,
    scriptId: body.scriptId,
    characterId,
    character,
    partIndex,
  });
  const { error } = await supabase.from('character_scripts').upsert(
    {
      script_id: body.scriptId,
      character_id: characterId,
      player_seat_id: playerSeatId,
      identity_assignment_id: identityAssignmentId,
      part_index: partIndex,
      part_label: partLabel,
      act_order: body.actOrder ?? null,
      act_scripts: json.actScripts,
      personal_arc: json.personalArc,
      visible_clue_titles: json.visibleClueTitles,
      perspective_note: json.perspectiveNote,
      is_murderer_script: character.isMurderer,
      word_count: wordCount,
      generation_status: 'completed',
    },
    { onConflict: 'script_id,character_id,part_index' },
  );

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(
        `character_scripts table is missing; storing character script in generation_tasks fallback: ${error.message}`,
      );
      await persistFallbackGenerationResult(body.scriptId, `character-script:${character.name}`, body.params, {
        characterId,
        characterName: character.name,
        partIndex,
        partLabel,
        script: json,
      }, body.generationTaskId);
      return;
    }
    throw new Error(`Character script upsert failed: ${error.message}`);
  }

  await persistPlayerPackage({
    supabase,
    body,
    character,
    json,
    playerSeatId,
    identityAssignmentId,
    partIndex,
    partLabel,
    wordCount,
  });

  await updateGenerationTaskResult(body.generationTaskId, {
    characterId,
    characterName: character.name,
    partIndex,
    partLabel,
    wordCount,
  });
}

function normalizeClueType(clueType: string): 'physical' | 'testimony' | 'deep' | 'hidden' {
  if (clueType === 'testimony' || clueType === 'deep' || clueType === 'hidden') return clueType;
  return 'physical';
}

async function persistClues(
  scriptId: string,
  params: ScriptGenerationParams,
  json: CluesJson,
  taskId?: string,
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

  await updateGenerationTaskResult(taskId, { clueCount: json.clues.length });
}

async function persistFallbackGenerationResult(
  scriptId: string,
  phase: string,
  params: ScriptGenerationParams,
  result: unknown,
  taskId?: string,
): Promise<void> {
  if (taskId) {
    await updateGenerationTaskResult(taskId, { phase, result });
    return;
  }

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
  taskId?: string,
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
      await persistFallbackGenerationResult(scriptId, 'organizer-manual', params, json, taskId);
      return;
    }
    throw new Error(`Organizer manual upsert failed: ${error.message}`);
  }

  await updateGenerationTaskResult(taskId, { openingFlowCount: json.openingFlow.length });
}

async function persistTruthReview(
  scriptId: string,
  params: ScriptGenerationParams,
  json: TruthReviewJson,
  taskId?: string,
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
      await persistFallbackGenerationResult(scriptId, 'truth-review', params, json, taskId);
      return;
    }
    throw new Error(`Truth review upsert failed: ${error.message}`);
  }

  await updateGenerationTaskResult(taskId, { characterEndingCount: json.characterEndings.length });
}

/**
 * 閹镐椒绠欓崠?timeline-structure 闂冭埖顔屾禍褍鍤惃鍕波閺嬪嫬瀵查弮鍫曟？缁惧じ绨ㄦ禒韬测偓? *
 * 鐎涙顔岄弰鐘茬殸閿涙I 鏉堟挸鍤惃?characterName 闂団偓閸忓牊鐓?characters 鐞涖劏娴嗛幋?character_id閿? * 閹靛彞绗夐崚鏉款嚠鎼存棁顫楅懝鎻掑灟鐠哄疇绻冪拠銉ょ皑娴犺翰鈧竣haracter_scripts 鐞涖劎宸辨径鎲嬬礄isMissingTableError閿? * 閺冩湹绮?console.warn 娑撳秵濮忛柨娆欑礉娣囨繆鐦夐梼鑸殿唽娑撳秴娲滅悰銊у繁婢惰精鈧苯銇戠拹銉ｂ偓? */
async function persistTimelineEvents(
  scriptId: string,
  params: ScriptGenerationParams,
  json: TimelineStructureJson,
  taskId?: string,
): Promise<void> {
  const supabase = await createGenerationDbClient();

  // 1. 閺?characters 鐞涱煉绱濋弸鍕紦 name 閳?id 閺勭姴鐨?
  const { data: characterRows, error: characterError } = await supabase
    .from('characters')
    .select('id, name')
    .eq('script_id', scriptId);

  if (characterError) {
    if (isMissingTableError(characterError)) {
      console.warn(
        `characters table is missing; cannot resolve character_id for timeline_events: ${characterError.message}`,
      );
      return;
    }
    throw new Error(`Timeline event character lookup failed: ${characterError.message}`);
  }

  const characterIdByName = new Map(
    (characterRows ?? []).map((row) => [row.name, row.id]),
  );

  // 2. 閸掔娀娅庣拠?scriptId 閻ㄥ嫭妫?timeline_events 閺佺増宓?
  const { error: deleteError } = await supabase
    .from('timeline_events')
    .delete()
    .eq('script_id', scriptId);
  if (deleteError) {
    if (isMissingTableError(deleteError)) {
      console.warn(
        `timeline_events table is missing; skipping timeline structure persistence: ${deleteError.message}`,
      );
      return;
    }
    throw new Error(`Timeline event cleanup failed: ${deleteError.message}`);
  }

  // 3. 閹靛綊鍣?insert閿涘潏haracterName 閹靛彞绗夐崚?id 閻ㄥ嫪绨ㄦ禒鎯扮儲鏉╁浄绱?
  const rowsToInsert = json.events
    .map((event: TimelineStructureEvent, index: number) => {
      const characterId = characterIdByName.get(event.characterName);
      if (!characterId) return null;
      return {
        script_id: scriptId,
        character_id: characterId,
        event_time: event.time,
        event_description: event.description,
        location: event.location,
        act_order: event.actOrder,
        is_narrative_trick: event.isNarrativeTrick,
        trick_type: event.trickType,
        sort_order: index,
        day: event.day ?? 1,
        event_type: event.eventType ?? 'normal',
        participants: event.participants ?? [],
        thread: event.thread ?? 'main',
        causes: event.causes ?? [],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('timeline_events')
      .insert(rowsToInsert);
    if (insertError) {
      throw new Error(`Timeline event insert failed: ${insertError.message}`);
    }
  }

  // 4. 閸愭瑥鍙?generation_tasks 鐠佹澘缍?
  await updateGenerationTaskResult(taskId, { eventCount: rowsToInsert.length, totalEmitted: json.events.length });

  try {
    await illustrationWorkflowService.ensureScriptWorkspace(scriptId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Illustration workspace bootstrap failed for ${scriptId}: ${message}`);
  }
}

async function handleCharacterScript(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        const { provider, name, runtime } = await getTextProviderInstance();
        if (!isProviderKeyConfigured(name)) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: `AI provider ${name} 的 API Key 未配置，无法生成剧本`,
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
        const specConfig = await getGenerationSpecConfig();
        const spec = buildGenerationSpec(params, specConfig);
        const partIndex = Math.max(1, body.scriptPartIndex ?? 1);
        const partLabel = body.scriptPartLabel || '完整玩家剧本';
        const characterScriptPrompt = buildCharacterScriptPrompt({
          params,
          storyBible,
          character,
          actStructure,
          spec,
          part: {
            index: partIndex,
            label: partLabel,
            actOrder: body.actOrder,
          },
        });
        const {
          supabase: knowledgeSupabase,
          items: knowledgeItems,
          userPrompt,
        } = await prepareKnowledgePrompt({
          stage: 'player_script',
          params,
          userPrompt: characterScriptPrompt.userPrompt,
        });
        const systemPrompt = characterScriptPrompt.systemPrompt;

        controller.enqueue(
          encodeSse(encoder, 'start', {
            scriptId,
            characterId: body.characterId,
            partIndex,
            partLabel,
            stage: 'character-script-init',
            ...generationMeta(name, runtime.model),
          }),
        );

        for await (const chunk of provider.generateStream({
          prompt: userPrompt,
          systemPrompt,
          temperature: 0.7,
          maxTokens: resolveCharacterScriptMaxTokens(spec.minWordsPerCharacterScriptPiece),
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
              content: `模型返回的玩家剧本 JSON 解析失败，已使用分幕概要兜底。原始错误：${parseMessage}`,
              scenes: act.scenes.map((scene) => ({
                title: scene.title,
                content: scene.content,
              })),
            })),
            personalArc: character.personalTask,
            visibleClueTitles: [],
            perspectiveNote: `模型返回的玩家剧本 JSON 解析失败，需人工复核。原始错误：${parseMessage}`,
          };
        }

        if (!Array.isArray(json.actScripts) || json.actScripts.length === 0) {
          controller.enqueue(encodeSse(encoder, 'error', { message: 'Character script result is empty' }));
          return;
        }

        let wordCount = countCharacterScriptWords(json);
        if (wordCount < spec.minWordsPerCharacterScriptPiece) {
          controller.enqueue(
            encodeSse(encoder, 'progress', {
              percent: 100,
              stage: 'expanding',
              message: `玩家剧本正文约 ${wordCount} 字，低于最低 ${spec.minWordsPerCharacterScriptPiece} 字，正在自动扩写`,
            }),
          );
          json = await expandCharacterScriptToMinimum({
            provider,
            json,
            minWords: spec.minWordsPerCharacterScriptPiece,
            currentWords: wordCount,
            character,
            partLabel,
          });
          wordCount = countCharacterScriptWords(json);
        }

        if (wordCount < spec.minWordsPerCharacterScriptPiece) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: `玩家剧本正文约 ${wordCount} 字，低于最低 ${spec.minWordsPerCharacterScriptPiece} 字。请在 Admin 提高模型 max tokens/超时时间，或换用长文本模型后重试。`,
            }),
          );
          return;
        }

        await persistCharacterScript(body, character, json);
        await recordKnowledgePhase({
          supabase: knowledgeSupabase,
          generationTaskId: body.generationTaskId,
          scriptId,
          stage: 'player_script',
          moduleType: 'player_script',
          items: knowledgeItems,
          content: json,
        });
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            characterId: body.characterId,
            partIndex,
            partLabel,
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
  const specConfig = await getGenerationSpecConfig();
  const cluesPrompt = buildCluesPrompt({
    params: body.params,
    storyBible,
    actStructure,
    spec: buildGenerationSpec(body.params, specConfig),
  });
  const {
    supabase: knowledgeSupabase,
    items: knowledgeItems,
    userPrompt,
  } = await prepareKnowledgePrompt({
    stage: 'clues',
    params: body.params,
    userPrompt: cluesPrompt.userPrompt,
  });
  const systemPrompt = cluesPrompt.systemPrompt;
  return runJsonPhase<CluesJson>('clues', body.scriptId, systemPrompt, userPrompt, 0.6, (json) =>
    persistClues(body.scriptId, body.params, json, body.generationTaskId).then(() =>
      recordKnowledgePhase({
        supabase: knowledgeSupabase,
        generationTaskId: body.generationTaskId,
        scriptId: body.scriptId,
        stage: 'clues',
        moduleType: 'clues',
        items: knowledgeItems,
        content: json,
      }),
    ),
  );
}

async function handleOrganizerManual(body: GenerateRequestBody): Promise<Response> {
  const [storyBible, actStructure] = await Promise.all([
    getStoryBibleForPhase(body),
    getActStructureForPhase(body),
  ]);
  const manualPrompt = buildOrganizerManualPrompt({
    params: body.params,
    storyBible,
    actStructure,
  });
  const {
    supabase: knowledgeSupabase,
    items: knowledgeItems,
    userPrompt,
  } = await prepareKnowledgePrompt({
    stage: 'dm_manual',
    params: body.params,
    userPrompt: manualPrompt.userPrompt,
  });
  const systemPrompt = manualPrompt.systemPrompt;
  return runJsonPhase<OrganizerManualJson>(
    'organizer-manual',
    body.scriptId,
    systemPrompt,
    userPrompt,
    0.5,
    (json) => persistOrganizerManual(body.scriptId, body.params, json, body.generationTaskId).then(() =>
      recordKnowledgePhase({
        supabase: knowledgeSupabase,
        generationTaskId: body.generationTaskId,
        scriptId: body.scriptId,
        stage: 'dm_manual',
        moduleType: 'dm_manual',
        items: knowledgeItems,
        content: json,
      }),
    ),
  );
}

async function handleTruthReview(body: GenerateRequestBody): Promise<Response> {
  const [storyBible, actStructure, characterScripts, clues] = await Promise.all([
    getStoryBibleForPhase(body),
    getActStructureForPhase(body),
    getCharacterScriptsForPhase(body),
    getCluesForPhase(body),
  ]);
  const reviewPrompt = buildTruthReviewPrompt({
    params: body.params,
    storyBible,
    actStructure,
    characterScripts,
    clues,
  });
  const {
    supabase: knowledgeSupabase,
    items: knowledgeItems,
    userPrompt,
  } = await prepareKnowledgePrompt({
    stage: 'review',
    params: body.params,
    userPrompt: reviewPrompt.userPrompt,
  });
  const systemPrompt = reviewPrompt.systemPrompt;
  return runJsonPhase<TruthReviewJson>(
    'truth-review',
    body.scriptId,
    systemPrompt,
    userPrompt,
    0.5,
    (json) => persistTruthReview(body.scriptId, body.params, json, body.generationTaskId).then(() =>
      recordKnowledgePhase({
        supabase: knowledgeSupabase,
        generationTaskId: body.generationTaskId,
        scriptId: body.scriptId,
        stage: 'review',
        moduleType: 'truth_review',
        items: knowledgeItems,
        content: json,
      }),
    ),
  );
}

/**
 * 閼惧嘲褰?timeline-structure 闂冭埖顔岄幍鈧棁鈧惃?timeline_full 閺傚洦婀伴妴? * 娴兼ê鍘涢悽?body.timelineFull閿涙稐璐熺粚鍝勫灟閺?truth_reviews 鐞涖劎娈?timeline_full 鐎涙顔岄妴? */
async function getTimelineFullForPhase(body: GenerateRequestBody): Promise<string> {
  if (body.timelineFull && body.timelineFull.trim().length > 0) {
    return body.timelineFull;
  }
  const supabase = await createGenerationDbClient();
  const { data, error } = await supabase
    .from('truth_reviews')
    .select('timeline_full')
    .eq('script_id', body.scriptId)
    .maybeSingle();
  if (error || !data) {
    throw new Error('timeline_full is required for timeline-structure phase');
  }
  return (data as { timeline_full: string | null }).timeline_full ?? '';
}

async function handleTimelineStructure(body: GenerateRequestBody): Promise<Response> {
  const [characterProfiles, actStructure, timelineFull] = await Promise.all([
    getCharacterProfilesForPhase(body),
    getActStructureForPhase(body),
    getTimelineFullForPhase(body),
  ]);
  const { systemPrompt, userPrompt } = buildTimelineStructurePrompt({
    timelineFull,
    characters: characterProfiles.characters.map((c) => ({
      name: c.name,
      roleIdentity: c.roleIdentity,
    })),
    acts: actStructure.acts.map((a) => ({
      title: a.title,
      sortOrder: a.sortOrder,
    })),
  });
  return runJsonPhase<TimelineStructureJson>(
    'timeline-structure',
    body.scriptId,
    systemPrompt,
    userPrompt,
    0.4,
    (json) => persistTimelineEvents(body.scriptId, body.params, json, body.generationTaskId),
  );
}

/**
 * timeline-structure 闃舵鐨?mock 瀹炵幇銆?
 * 浠?body.timelineFull 鎷嗗垎娈佃惤鐢熸垚鍗犱綅浜嬩欢銆?
 */
async function handleTimelineStructureMock(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        controller.enqueue(
          encodeSse(encoder, 'start', { scriptId, stage: 'timeline-structure-init', ...generationMeta() }),
        );

        const supabase = await createGenerationDbClient();

        // 1. 鑾峰彇 timeline_full 鏂囨湰锛宐ody 浼樺厛锛屽洖閫€鏌ヨ truth_reviews銆?
        let timelineFull = body.timelineFull ?? '';
        if (!timelineFull.trim()) {
          const { data } = await supabase
            .from('truth_reviews')
            .select('timeline_full')
            .eq('script_id', scriptId)
            .maybeSingle();
          timelineFull = (data as { timeline_full: string | null } | null)?.timeline_full ?? '';
        }

        // 2. 鑾峰彇瑙掕壊鍒楄〃锛屽崰浣嶄娇鐢ㄧ涓€涓鑹层€?
        const { data: charRows } = await supabase
          .from('characters')
          .select('name')
          .eq('script_id', scriptId)
          .order('sort_order')
          .limit(1);
        const placeholderName =
          charRows?.[0]?.name ?? body.characterProfiles?.characters[0]?.name ?? '瑙掕壊';

        // 3. 鎸夌澶存垨鎹㈣鎷嗗垎娈佃惤锛屾椂闂翠粠 18:00 璧锋閫掑 30 鍒嗛挓銆?
        const segments = timelineFull
          .split(/[鈫抃n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const events: TimelineStructureEvent[] = segments.map((segment, index) => {
          const totalMinutes = Math.min(24 * 60 + 30, 18 * 60 + index * 30);
          const h = Math.floor(totalMinutes / 60);
          const m = totalMinutes % 60;
          const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          return {
            characterName: placeholderName,
            time,
            description: segment.slice(0, 80),
            location: '未指定',
            actOrder: 1,
            isNarrativeTrick: false,
            trickType: '',
          };
        });

        const json: TimelineStructureJson = { events };

        // 4. 鎸佷箙鍖栵紝琛ㄧ己澶辨椂浠呰褰曡鍛娿€?
        try {
          await persistTimelineEvents(scriptId, params, json, body.generationTaskId);
        } catch (persistError) {
          const message = persistError instanceof Error ? persistError.message : 'Unknown persist error';
          console.warn(`Timeline structure mock persist failed; continuing: ${message}`);
        }

        controller.enqueue(encodeSse(encoder, 'progress', { percent: 100, stage: 'mock' }));
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            eventCount: events.length,
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

async function handleStoryBible(body: GenerateRequestBody): Promise<Response> {
  const { scriptId, params } = body;
  const storyBiblePrompt = buildStoryBiblePrompt(params);
  const {
    supabase: knowledgeSupabase,
    items: knowledgeItems,
    userPrompt,
  } = await prepareKnowledgePrompt({
    stage: 'case_core',
    params,
    userPrompt: storyBiblePrompt.userPrompt,
  });
  const systemPrompt = storyBiblePrompt.systemPrompt;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';
      const startedAt = new Date();

      try {
        if (getGenerationMode() === 'mock') {
          controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'story-bible-init', ...generationMeta() }));
          const json = buildMockStoryBible(params);
          const storyBibleId = await persistStoryBible(scriptId, params, json, startedAt, body.generationTaskId);
          await recordKnowledgePhase({
            supabase: knowledgeSupabase,
            generationTaskId: body.generationTaskId,
            scriptId,
            stage: 'case_core',
            moduleType: 'case_core',
            items: knowledgeItems,
            content: json,
          });
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

        const { provider, name, runtime } = await getTextProviderInstance();
        if (!isProviderKeyConfigured(name)) {
          controller.enqueue(
            encodeSse(encoder, 'error', {
              message: `AI provider ${name} 的 API Key 未配置，无法生成剧本`,
            }),
          );
          return;
        }

        controller.enqueue(encodeSse(encoder, 'start', { scriptId, stage: 'story-bible-init', ...generationMeta(name, runtime.model) }));

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
        const parsedJson = await parseOrRepairJson<StoryBibleJson>(accumulated, 'StoryBibleJson');
        const json = normalizeStoryBible(parsedJson, params.players);
        const validationErrors = validateStoryBible(json, params.players);
        if (validationErrors.length > 0) {
          controller.enqueue(encodeSse(encoder, 'error', { message: formatStoryBibleValidationErrors(validationErrors) }));
          return;
        }

        const storyBibleId = await persistStoryBible(scriptId, params, json, startedAt, body.generationTaskId);
        await recordKnowledgePhase({
          supabase: knowledgeSupabase,
          generationTaskId: body.generationTaskId,
          scriptId,
          stage: 'case_core',
          moduleType: 'case_core',
          items: knowledgeItems,
          content: json,
        });

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

async function resolveAuthenticatedUser(request: NextRequest): Promise<{ id: string; isBanned: boolean } | null> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (token && SUPABASE_URL && anonKey) {
    const supabase = createSupabaseClient(SUPABASE_URL, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (user) {
      const isBanned = await checkUserBanned(user.id);
      return { id: user.id, isBanned };
    }
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const isBanned = await checkUserBanned(user.id);
  return { id: user.id, isBanned };
}

/**
 * 鏌ヨ鐢ㄦ埛灏佺鐘舵€併€?
 * admin 绔彲閫氳繃 users.is_banned 瀛楁灏佺鐢ㄦ埛锛屽皝绂佸悗搴旈樆姝㈡柊鐨勭敓鎴愯姹傘€?
 * 鐢变簬姝?API 鍦ㄧ敤鎴?JWT 涓婁笅鏂囦腑杩愯锛堜笉鑳界洿鎺ヨ users 琛ㄧ殑 RLS锛夛紝
 * 浣跨敤 service role client 缁曡繃 RLS 璇诲彇 is_banned 瀛楁銆?
 */
async function checkUserBanned(userId: string): Promise<boolean> {
  const supabase = await createGenerationDbClient();
  const { data, error } = await supabase
    .from('users')
    .select('is_banned')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    // 鏌ヨ澶辫触鏃朵繚瀹堝鐞嗭細涓嶉樆鏂紙閬垮厤 DB 鏁呴殰瀵艰嚧鎵€鏈夌敤鎴锋棤娉曠敓鎴愶級
    // 浣嗚褰曞憡璀︿究浜庡悗缁帓鏌?
    console.warn(`Failed to check is_banned for user ${userId}: ${error?.message ?? 'no row'}`);
    return false;
  }
  return data.is_banned === true;
}

async function wrapMeteredSseResponse(
  response: Response,
  settlement: {
    userId: string;
    phase: GenerationCreditPhase;
    scriptId: string;
    amount: number;
    transactionId: string | null;
    taskId: string | null;
  },
): Promise<Response> {
  const quotaService = new QuotaService();
  let completed = false;
  let failed = !response.ok;
  let refunded = false;
  const refund = async (failureReason: string) => {
    if (refunded || settlement.amount <= 0) return;
    refunded = true;
    try {
      await quotaService.refundCredits(
        settlement.userId,
        settlement.amount,
        `生成失败返还：${settlement.phase}`,
        {
          phase: settlement.phase,
          scriptId: settlement.scriptId,
          consumeTransactionId: settlement.transactionId,
          failureReason,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Credit refund failed; continuing response stream: ${message}`);
    }
    await failGenerationTask(settlement.taskId, failureReason, settlement.amount);
  };

  if (!response.body) {
    if (failed) await refund(`http_${response.status}`);
    return response;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          if (text.includes('event: completed')) completed = true;
          if (text.includes('event: error')) failed = true;
          controller.enqueue(value);
        }

        if (failed || !completed) {
          await refund(failed ? 'sse_error' : 'stream_closed_without_completed');
        } else {
          await completeGenerationTask(settlement.taskId);
        }
        controller.close();
      } catch (error) {
        await refund('stream_read_error');
        controller.error(error);
      }
    },
    async cancel() {
      await refund('stream_cancelled');
      await reader.cancel();
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function runMeteredGeneration(
  request: NextRequest,
  phase: GenerationCreditPhase,
  body: GenerateRequestBody,
  execute: () => Promise<Response>,
): Promise<Response> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return buildError('未登录或登录状态已失效', 401);
  }
  // admin 绔皝绂佺敤鎴峰悗闃绘鏂扮殑鐢熸垚璇锋眰锛泃oken 澶辨晥鍓嶅凡绛惧彂鐨勮姹備篃浼氳鎷︽埅
  if (user.isBanned) {
    return buildError('账号已被封禁，无法生成剧本', 403);
  }
  const userId = user.id;

  const quotaService = new QuotaService();
  let charge: { amount: number; transactionId: string | null };
  try {
    charge = await quotaService.consumeGenerationPhase(userId, phase, body.scriptId);
  } catch (error) {
    return buildApiError(error);
  }
  let taskId: string | null = null;

  try {
    taskId = await createRunningGenerationTask({
      scriptId: body.scriptId,
      phase,
      params: body.params,
      chargedCredits: charge.amount,
    });
    body.generationTaskId = taskId;

    const response = await execute();
    return wrapMeteredSseResponse(response, {
      userId,
      phase,
      scriptId: body.scriptId,
      amount: charge.amount,
      transactionId: charge.transactionId,
      taskId,
    });
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    try {
      await quotaService.refundCredits(userId, charge.amount, `生成异常返还：${phase}`, {
        phase,
        scriptId: body.scriptId,
        consumeTransactionId: charge.transactionId,
        failureReason,
      });
    } catch (refundError) {
      const message = refundError instanceof Error ? refundError.message : String(refundError);
      console.warn(`Credit refund failed after generation exception: ${message}`);
    }
    await failGenerationTask(taskId, failureReason, charge.amount);
    throw error;
  }
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
    return runMeteredGeneration(request, phase, body, () => handleStoryBible(body));
  }

  if (phase === 'character-profiles' || phase === 'act-structure') {
    const body: unknown = await request.json().catch(() => null);
    if (!validateBody(body)) {
      return buildError('Invalid parameters', 400);
    }
    if (getGenerationMode() === 'real') {
      if (phase === 'character-profiles') {
        return runMeteredGeneration(request, phase, body, () => handleCharacterProfiles(body));
      }
      return runMeteredGeneration(request, phase, body, () => handleActStructure(body));
    }
    return runMeteredGeneration(request, phase, body, () => handleMockPhase(phase, body));
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
        return runMeteredGeneration(request, phase, body, () => handleCharacterScript(body));
      }
      if (phase === 'clues') {
        return runMeteredGeneration(request, phase, body, () => handleClues(body));
      }
      if (phase === 'organizer-manual') {
        return runMeteredGeneration(request, phase, body, () => handleOrganizerManual(body));
      }
      return runMeteredGeneration(request, phase, body, () => handleTruthReview(body));
    }
    return runMeteredGeneration(request, phase, body, () => Promise.resolve(handleGenericMockPhase(phase, body)));
  }

  if (phase === 'timeline-structure') {
    const body: unknown = await request.json().catch(() => null);
    if (!validateBody(body)) {
      return buildError('Invalid parameters', 400);
    }
    if (getGenerationMode() === 'real') {
      return runMeteredGeneration(request, phase, body, () => handleTimelineStructure(body));
    }
    return runMeteredGeneration(request, phase, body, () => handleTimelineStructureMock(body));
  }

  // 鏈煡闃舵锛氭棭鏈熼€氳繃 proxySupabaseGenerate 鍏滃簳浠ｇ悊鍒?Supabase Edge Function锛?
  // 浣嗗垎闃舵缂栨帓涓婄嚎鍚庢墍鏈夊凡鐭?phase 閮藉凡鍒嗘敮澶勭悊锛孍dge Function 宸插簾寮冪Щ闄わ紝
  // 鏈煡 phase 鐩存帴杩斿洖 404锛岄伩鍏嶉潤榛樿皟鐢ㄤ笉瀛樺湪鐨勪笂娓搞€?
  return buildError(`Unknown generation phase: ${phase}`, 404);
}
