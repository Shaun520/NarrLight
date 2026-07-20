/**
 * 逻辑校验 Edge Function - LOGIC / FULL 类型（T205）
 *
 * 接收 POST 请求，参数为 { scriptId: string; reportType: 'LOGIC' | 'FULL' }：
 *   1. 加载剧本完整数据（characters/acts/scenes/clues/character_relations/timeline_events）
 *   2. 调用 buildLogicValidationPrompt 构建校验 prompt
 *   3. 调用 DeepSeekProvider.generateJSON<LogicValidationResult> 获取校验结果
 *   4. 若 reportType=FULL，额外执行：
 *      - TimelineExtractor + ConflictDetector（时间线校验）
 *      - DifficultyAssessor（难度评估）
 *      - NarrativeTrickDetector（叙诡识别）
 *   5. 用 IssueClassifier 分类漏洞
 *   6. 写入 validation_reports 表（report_type=LOGIC / FULL）
 *   7. 返回校验结果 JSON
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将 service 层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { DeepSeekProvider } from '@/lib/ai/providers/deepseek-provider';
import {
  buildLogicValidationPrompt,
  type LogicValidationResult,
  type ScriptValidationData,
} from '@/lib/ai/prompts/logic-validation';
import type {
  GeneratedAct,
  GeneratedCharacter,
  GeneratedClue,
  GeneratedScene,
  GeneratedScriptJson,
  GeneratedTruth,
} from '@/lib/ai/prompts/script-generation';
import { TimelineExtractor, type TimelineEvent } from '@/lib/validation/timeline/extractor';
import {
  ConflictDetector,
  type ConflictItem,
  type ConflictSeverity,
} from '@/lib/validation/timeline/conflict-detector';
import {
  NarrativeTrickDetector,
  type DetectedTrick,
} from '@/lib/validation/logic/narrative-trick-detector';
import {
  IssueClassifier,
  type GroupedIssues,
  type ValidationIssue,
} from '@/lib/validation/logic/issue-classifier';
import {
  DifficultyAssessor,
  type DifficultyAssessment,
} from '@/lib/validation/difficulty/assessor';
import type { ScriptGenre, ScriptDifficulty } from '@/types';
import type { createClient } from '@/lib/supabase/server';

/** 推断 supabase 客户端类型（仅用于类型标注，运行时不引入 next/headers） */
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** 入参体 */
interface LogicRequestBody {
  scriptId: string;
  reportType: 'LOGIC' | 'FULL';
}

/** 完整校验结果响应 */
interface LogicValidationResponse {
  scriptId: string;
  reportType: 'LOGIC' | 'FULL';
  issues: ValidationIssue[];
  grouped: GroupedIssues;
  tricks: DetectedTrick[];
  timeline?: {
    events: TimelineEvent[];
    conflicts: ConflictItem[];
    stats: {
      totalEvents: number;
      totalConflicts: number;
      severe: number;
      warning: number;
      hint: number;
    };
  };
  difficulty?: DifficultyAssessment;
  reportId: string | null;
  createdAt: string;
}

// ===== 数据库行类型（snake_case → camelCase 映射用） =====

interface ScriptRow {
  title: string;
  genre: string;
  difficulty: string;
  player_count: number;
}

interface CharacterRow {
  name: string;
  role_identity: string | null;
  gender: string | null;
  age: number | null;
  personality: string | null;
  background_story: string | null;
  personal_task: string | null;
  is_murderer: boolean;
  sort_order: number;
}

interface ActRow {
  id: string;
  title: string;
  sort_order: number;
  content: string | null;
}

interface SceneRow {
  act_id: string;
  title: string;
  location: string | null;
  content: string | null;
  sort_order: number;
}

interface ClueRow {
  title: string;
  content: string;
  clue_type: 'physical' | 'testimony' | 'deep' | 'hidden';
  search_round: number | null;
  location: string | null;
  is_distractor: boolean;
  is_key_clue: boolean;
  unlock_condition: string | null;
  sort_order: number;
}

interface SnapshotRow {
  snapshot_data: Record<string, unknown>;
}

/** 合法 genre / difficulty 取值（用于 DB 字段安全转换） */
const VALID_GENRES: readonly ScriptGenre[] = [
  'hardcore',
  'emotion',
  'horror',
  'funny',
  'mechanism',
];
const VALID_DIFFICULTIES: readonly ScriptDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
];

/** 校验入参 */
function validateBody(body: unknown): body is LogicRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  return b.reportType === 'LOGIC' || b.reportType === 'FULL';
}

/**
 * 从数据库加载剧本完整数据并组装为 ScriptValidationData。
 *
 * 真相复盘（truth）优先从最近一次版本快照的 snapshot_data.truth 读取；
 * 若快照缺失，则从凶手背景与幕次内容构造最小化真相，保证 prompt 可用。
 */
async function loadScriptValidationData(
  scriptId: string,
  supabase: SupabaseClient,
): Promise<{ data: ScriptValidationData; playerCount: number }> {
  // 1. 剧本元信息
  const { data: scriptRow, error: scriptErr } = await supabase
    .from('scripts')
    .select('title, genre, difficulty, player_count')
    .eq('id', scriptId)
    .maybeSingle();
  if (scriptErr) throw new Error(`加载剧本失败: ${scriptErr.message}`);
  if (!scriptRow) throw new Error(`剧本不存在: ${scriptId}`);

  const script = scriptRow as ScriptRow;
  const genre: ScriptGenre = VALID_GENRES.includes(script.genre as ScriptGenre)
    ? (script.genre as ScriptGenre)
    : 'hardcore';
  const difficulty: ScriptDifficulty = VALID_DIFFICULTIES.includes(
    script.difficulty as ScriptDifficulty,
  )
    ? (script.difficulty as ScriptDifficulty)
    : 'intermediate';

  // 2. 人物
  const { data: charRows, error: charErr } = await supabase
    .from('characters')
    .select(
      'name, role_identity, gender, age, personality, background_story, personal_task, is_murderer, sort_order',
    )
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: true });
  if (charErr) throw new Error(`加载人物失败: ${charErr.message}`);

  const characters: GeneratedCharacter[] = (charRows ?? []).map((r) => {
    const row = r as CharacterRow;
    return {
      name: row.name,
      roleIdentity: row.role_identity ?? '',
      gender:
        row.gender === 'male' || row.gender === 'female' ? row.gender : 'unknown',
      age: row.age,
      personality: row.personality ?? '',
      backgroundStory: row.background_story ?? '',
      personalTask: row.personal_task ?? '',
      isMurderer: row.is_murderer ?? false,
    };
  });

  // 3. 幕次 + 场景
  const { data: actRows, error: actErr } = await supabase
    .from('acts')
    .select('id, title, sort_order, content')
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: true });
  if (actErr) throw new Error(`加载幕次失败: ${actErr.message}`);

  const actIds = (actRows ?? []).map((a) => (a as ActRow).id);
  let sceneRows: SceneRow[] = [];
  if (actIds.length > 0) {
    const { data: sRows, error: sceneErr } = await supabase
      .from('scenes')
      .select('act_id, title, location, content, sort_order')
      .in('act_id', actIds)
      .order('sort_order', { ascending: true });
    if (sceneErr) throw new Error(`加载场景失败: ${sceneErr.message}`);
    sceneRows = (sRows ?? []) as unknown as SceneRow[];
  }

  const scenesByAct = new Map<string, GeneratedScene[]>();
  for (const s of sceneRows) {
    const arr = scenesByAct.get(s.act_id) ?? [];
    arr.push({
      title: s.title,
      location: s.location ?? '',
      content: s.content ?? '',
      sortOrder: s.sort_order,
    });
    scenesByAct.set(s.act_id, arr);
  }

  const acts: GeneratedAct[] = (actRows ?? []).map((a) => {
    const row = a as ActRow;
    return {
      title: row.title,
      sortOrder: row.sort_order,
      content: row.content ?? '',
      scenes: scenesByAct.get(row.id) ?? [],
    };
  });

  // 4. 线索
  const { data: clueRows, error: clueErr } = await supabase
    .from('clues')
    .select(
      'title, content, clue_type, search_round, location, is_distractor, is_key_clue, unlock_condition, sort_order',
    )
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: true });
  if (clueErr) throw new Error(`加载线索失败: ${clueErr.message}`);

  const clues: GeneratedClue[] = (clueRows ?? []).map((c) => {
    const row = c as ClueRow;
    return {
      title: row.title,
      content: row.content,
      clueType: row.clue_type,
      searchRound: row.search_round ?? 1,
      location: row.location ?? '',
      relatedCharacterNames: [],
      isDistractor: row.is_distractor ?? false,
      isKeyClue: row.is_key_clue ?? false,
      unlockCondition: row.unlock_condition ?? '',
    };
  });

  // 5. 真相复盘：优先从最近一次版本快照读取
  const { data: snapRows, error: snapErr } = await supabase
    .from('version_snapshots')
    .select('snapshot_data')
    .eq('script_id', scriptId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (snapErr) throw new Error(`加载版本快照失败: ${snapErr.message}`);

  let truth: GeneratedTruth = {
    summary: '',
    murdererMethod: '',
    motive: '',
    timeline: '',
    foreshadowing: [],
  };
  if (snapRows && snapRows.length > 0) {
    const payload = (snapRows[0] as SnapshotRow).snapshot_data;
    const truthRaw = payload?.truth;
    if (truthRaw && typeof truthRaw === 'object') {
      const t = truthRaw as Record<string, unknown>;
      truth = {
        summary: typeof t.summary === 'string' ? t.summary : '',
        murdererMethod: typeof t.murdererMethod === 'string' ? t.murdererMethod : '',
        motive: typeof t.motive === 'string' ? t.motive : '',
        timeline: typeof t.timeline === 'string' ? t.timeline : '',
        foreshadowing: Array.isArray(t.foreshadowing)
          ? (t.foreshadowing as unknown[]).filter(
              (x): x is string => typeof x === 'string',
            )
          : [],
      };
    }
  }

  // 真相兜底：快照无真相时从凶手背景与幕次内容构造最小化真相
  if (!truth.murdererMethod && !truth.motive) {
    const murderer = characters.find((c) => c.isMurderer);
    truth = {
      summary: acts.map((a) => a.content).join('\n').slice(0, 200) || '暂无',
      murdererMethod: '未提供（请补充真相复盘）',
      motive: murderer
        ? `${murderer.name} 的动机：${murderer.backgroundStory.slice(0, 60)}`
        : '未提供',
      timeline: '',
      foreshadowing: [],
    };
  }

  const scriptJson: GeneratedScriptJson = { characters, acts, clues, truth };

  return {
    data: {
      scriptId,
      title: script.title,
      genre,
      difficulty,
      script: scriptJson,
    },
    playerCount: script.player_count,
  };
}

/** 统计冲突数量 */
function countConflicts(
  conflicts: ConflictItem[],
): { totalConflicts: number; severe: number; warning: number; hint: number } {
  const severe = conflicts.filter((c) => c.severity === 'severe').length;
  const warning = conflicts.filter((c) => c.severity === 'warning').length;
  const hint = conflicts.filter((c) => c.severity === 'hint').length;
  return {
    totalConflicts: conflicts.length,
    severe,
    warning,
    hint,
  };
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
    return new Response(
      JSON.stringify({
        error: 'Invalid parameters: scriptId 必填，reportType 必须为 LOGIC 或 FULL',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { scriptId, reportType } = body;

  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    // 1. 加载剧本完整数据
    const { data: scriptData, playerCount } = await loadScriptValidationData(
      scriptId,
      supabase,
    );

    // 2 + 3. 构建校验 prompt 并调用 AI（低温保证结构稳定）
    const { systemPrompt, userPrompt } = buildLogicValidationPrompt(scriptData);
    const provider = new DeepSeekProvider();
    const aiResult = await provider.generateJSON<LogicValidationResult>({
      prompt: userPrompt,
      systemPrompt,
      temperature: 0.3,
    });

    const issues = Array.isArray(aiResult.issues) ? aiResult.issues : [];
    const aiTricks = Array.isArray(aiResult.tricks) ? aiResult.tricks : [];

    // 4. 叙诡识别（LOGIC / FULL 均执行，从 issues 中剥离设计性叙诡）
    const trickDetector = new NarrativeTrickDetector();
    const detectedTricks = trickDetector.detect(scriptData, aiTricks);

    // 5. 用 IssueClassifier 分类漏洞
    const classifier = new IssueClassifier();
    const grouped = classifier.classify(
      issues,
      aiTricks,
      trickDetector.getMarkedTrickIds(),
      trickDetector.getExcludedIds(),
    );

    // 4（续）. FULL 类型额外执行时间线校验与难度评估
    let timelineResult: LogicValidationResponse['timeline'];
    let difficultyResult: DifficultyAssessment | undefined;

    if (reportType === 'FULL') {
      // 时间线校验：提取事件 + 冲突检测
      const extractor = new TimelineExtractor();
      const events = await extractor.extract(scriptId);
      const conflictDetector = new ConflictDetector();
      const conflicts = conflictDetector.detect(events);
      const conflictStats = countConflicts(conflicts);
      timelineResult = {
        events,
        conflicts,
        stats: {
          totalEvents: events.length,
          ...conflictStats,
        },
      };

      // 难度评估：综合 5 维度评分
      const assessor = new DifficultyAssessor();
      difficultyResult = assessor.assess({
        scriptId,
        genre: scriptData.genre,
        script: scriptData.script,
        playerCount,
        grouped,
        trickCount: detectedTricks.length,
      });
    }

    const flatIssues = classifier.flatten(grouped);

    // 6. 写入 validation_reports 表（容错：失败不阻塞返回）
    let reportId: string | null = null;
    try {
      const id = crypto.randomUUID();
      const resultData = {
        issues: flatIssues,
        grouped,
        tricks: detectedTricks,
        timeline: timelineResult,
        difficulty: difficultyResult,
      };
      const { data: reportRow } = await supabase
        .from('validation_reports')
        .insert({
          id,
          script_id: scriptId,
          report_type: reportType,
          status: 'completed',
          result_data: resultData as unknown as never,
          issue_count_severe: grouped.CRITICAL.length,
          issue_count_warning: grouped.WARNING.length,
          issue_count_hint: grouped.SUGGESTION.length,
          script_version_ref: null,
        })
        .select('id')
        .single();
      if (reportRow) {
        reportId = (reportRow as { id: string }).id;
      }
    } catch {
      // 写库失败不影响校验结果返回
    }

    // 7. 返回校验结果
    const response: LogicValidationResponse = {
      scriptId,
      reportType,
      issues: flatIssues,
      grouped,
      tricks: detectedTricks,
      timeline: timelineResult,
      difficulty: difficultyResult,
      reportId,
      createdAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `逻辑校验失败: ${message}`, scriptId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// @ts-expect-error - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
Deno.serve(handleRequest);

export type { LogicRequestBody, LogicValidationResponse };
export type { ConflictSeverity };
