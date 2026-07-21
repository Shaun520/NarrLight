/**
 * 时间线结构重新生成 API
 *
 * 路由：POST /api/timeline/regenerate
 * 入参：{ scriptId: string }
 *
 * 用途：当 /api/validate 返回 422（timeline_events 表为空且 acts/scenes 文本
 * 无 HH:MM 时间点）时，前端可调用本接口触发 timeline-structure 阶段重新生成，
 * 把 truth_reviews.timeline_full 的自然语言时间描述结构化为 timeline_events 行。
 *
 * 流程：
 *   1. 读取 scripts / characters / acts / truth_reviews 表
 *   2. 构造 TimelineStructurePrompt，调用 DeepSeek（无 API key 时回退 mock 分段）
 *   3. 解析 JSON 后写入 timeline_events 表（先删后插）
 *   4. 返回 { success, eventCount, mode } 或 { error }
 *
 * 响应：
 *   - 200：{ success: true, eventCount, mode, scriptId }
 *   - 400：{ error } 参数缺失
 *   - 404：{ error } timeline_full 为空（缺少前置 truth-review 产物）
 *   - 500：{ error } 生成或持久化失败
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import { getTextProviderInstance } from '@/lib/services/ai-config-service';
import {
  buildTimelineStructurePrompt,
  type TimelineStructureJson,
  type TimelineStructureEvent,
} from '@/lib/ai/prompts/timeline-structure';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';

interface RegenerateRequestBody {
  scriptId: string;
}

/** scripts 表行（仅取生成参数所需字段） */
interface ScriptRow {
  title: string;
  genre: string;
  player_count: number;
  duration_hours: number;
  difficulty: string;
  background_setting: string;
  core_theme: string;
}

/** characters 表行 */
interface CharacterRow {
  id: string;
  name: string;
  role_identity: string;
  sort_order: number;
}

/** acts 表行 */
interface ActRow {
  id: string;
  title: string;
  sort_order: number;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return Boolean(
    error.code === 'PGRST205' ||
      error.message?.includes('Could not find the table') ||
      error.message?.includes('schema cache'),
  );
}

/** 从 scripts 表行构造最小可用 ScriptGenerationParams（仅供 generation_tasks 持久化） */
function buildParamsFromScript(row: ScriptRow): ScriptGenerationParams {
  return {
    title: row.title,
    genre: row.genre as ScriptGenerationParams['genre'],
    players: row.player_count,
    duration: row.duration_hours,
    difficulty: row.difficulty as ScriptGenerationParams['difficulty'],
    background: row.background_setting ?? '',
    theme: row.core_theme ?? '',
    ageRating: 'ALL',
    writingStyle: '悬疑冷峻',
    switches: {
      noEdgeRole: false,
      compliancePreCheck: false,
      mechanismRules: false,
    },
    extraReq: '',
  };
}

/**
 * 持久化 timeline-structure 产物到 timeline_events 表（先删后插）。
 * characterName 找不到对应 character_id 的事件跳过。
 */
async function persistTimelineEvents(
  supabase: ReturnType<typeof createAdminClient>,
  scriptId: string,
  params: ScriptGenerationParams,
  json: TimelineStructureJson,
): Promise<number> {
  // 1. 查 characters 表构建 name → id 映射
  const { data: characterRows, error: characterError } = await supabase
    .from('characters')
    .select('id, name')
    .eq('script_id', scriptId);

  if (characterError) {
    if (isMissingTableError(characterError)) {
      console.warn(
        `characters table missing; cannot resolve character_id: ${characterError.message}`,
      );
      return 0;
    }
    throw new Error(`Character lookup failed: ${characterError.message}`);
  }

  const characterIdByName = new Map(
    (characterRows ?? []).map((r: { name: string; id: string }) => [r.name, r.id]),
  );

  // 2. 删除旧 timeline_events
  const { error: deleteError } = await supabase
    .from('timeline_events')
    .delete()
    .eq('script_id', scriptId);
  if (deleteError && !isMissingTableError(deleteError)) {
    throw new Error(`Timeline event cleanup failed: ${deleteError.message}`);
  }

  // 3. 批量 insert
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
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('timeline_events')
      .insert(rowsToInsert);
    if (insertError) {
      throw new Error(`Timeline event insert failed: ${insertError.message}`);
    }
  }

  // 4. 写 generation_tasks 记录（容错）
  const { error: taskError } = await supabase.from('generation_tasks').insert({
    script_id: scriptId,
    task_type: 'TIMELINE_STRUCTURE',
    status: 'completed',
    params,
    progress_percent: 100,
    result_data: { eventCount: rowsToInsert.length, totalEmitted: json.events.length },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (taskError) {
    console.warn(`Timeline structure task insert failed; continuing: ${taskError.message}`);
  }

  return rowsToInsert.length;
}

/**
 * Mock 模式：无 DEEPSEEK_API_KEY 时，按 → / 换行分段生成占位事件。
 * 时间用 18:00 起步递增 30 分钟（上限 24:30），characterName 取第一个角色。
 */
function buildMockTimelineEvents(
  timelineFull: string,
  characters: CharacterRow[],
): TimelineStructureJson {
  const placeholderName = characters[0]?.name ?? '角色';
  const segments = timelineFull
    .split(/[→\n]/)
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

  return { events };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) {
    return NextResponse.json(
      { error: 'Invalid parameters: scriptId required' },
      { status: 400 },
    );
  }

  const { scriptId } = b as unknown as RegenerateRequestBody;

  try {
    const supabase = createAdminClient();

    // 1. 并行读取 scripts / characters / acts / truth_reviews
    const [scriptRes, charRes, actRes, truthRes] = await Promise.all([
      supabase
        .from('scripts')
        .select('title, genre, player_count, duration_hours, difficulty, background_setting, core_theme')
        .eq('id', scriptId)
        .maybeSingle(),
      supabase
        .from('characters')
        .select('id, name, role_identity, sort_order')
        .eq('script_id', scriptId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('acts')
        .select('id, title, sort_order')
        .eq('script_id', scriptId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('truth_reviews')
        .select('timeline_full')
        .eq('script_id', scriptId)
        .maybeSingle(),
    ]);

    if (scriptRes.error || !scriptRes.data) {
      return NextResponse.json(
        { error: `剧本不存在或查询失败: ${scriptRes.error?.message ?? 'not found'}` },
        { status: 404 },
      );
    }

    const scriptRow = scriptRes.data as ScriptRow;
    const characters = (charRes.data ?? []) as CharacterRow[];
    const acts = (actRes.data ?? []) as ActRow[];
    const timelineFull =
      ((truthRes.data as { timeline_full: string | null } | null)?.timeline_full ?? '').trim();

    if (!timelineFull) {
      return NextResponse.json(
        {
          error:
            'truth_reviews.timeline_full 为空，请先完成「真相复盘」阶段生成后再重试时间线结构化',
        },
        { status: 404 },
      );
    }

    if (characters.length === 0) {
      return NextResponse.json(
        { error: 'characters 表为空，请先完成「人物设定」阶段生成' },
        { status: 404 },
      );
    }

    const params = buildParamsFromScript(scriptRow);

    // 2. 生成 timeline-structure（real / mock 两种模式）
    let json: TimelineStructureJson;
    let mode: 'real' | 'mock';

    if (process.env.DEEPSEEK_API_KEY) {
      mode = 'real';
      const { systemPrompt, userPrompt } = buildTimelineStructurePrompt({
        timelineFull,
        characters: characters.map((c) => ({
          name: c.name,
          roleIdentity: c.role_identity,
        })),
        acts: acts.map((a) => ({
          title: a.title,
          sortOrder: a.sort_order,
        })),
      });

      const { provider } = await getTextProviderInstance();
      const raw = await provider.generate({
        systemPrompt,
        prompt: userPrompt,
        temperature: 0.4,
      });

      try {
        json = parseJSONWithTolerance<TimelineStructureJson>(raw);
      } catch {
        // 二次修复：让模型修复畸形 JSON
        const repaired = await provider.generate({
          systemPrompt:
            'You repair malformed JSON. Return only valid JSON. Do not add markdown, comments, or explanation.',
          prompt: `Fix this malformed JSON for schema: TimelineStructureJson.\n\n${raw}`,
          temperature: 0,
        });
        json = parseJSONWithTolerance<TimelineStructureJson>(repaired);
      }

      if (!Array.isArray(json.events)) {
        return NextResponse.json(
          { error: 'AI 返回的 JSON 结构异常：缺少 events 数组' },
          { status: 500 },
        );
      }
    } else {
      // mock 模式：按 → / 换行分段生成占位事件
      mode = 'mock';
      json = buildMockTimelineEvents(timelineFull, characters);
    }

    if (json.events.length === 0) {
      return NextResponse.json(
        {
          success: false,
          eventCount: 0,
          mode,
          scriptId,
          error: '未能从 timeline_full 中识别出任何时间线事件',
        },
        { status: 422 },
      );
    }

    // 3. 持久化到 timeline_events 表
    const persistedCount = await persistTimelineEvents(supabase, scriptId, params, json);

    return NextResponse.json({
      success: true,
      eventCount: persistedCount,
      mode,
      scriptId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `时间线结构生成失败: ${message}` },
      { status: 500 },
    );
  }
}
