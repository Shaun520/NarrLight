/**
 * 时间线校验 API 路由（T149 · 视图4）
 *
 * 路由：POST /api/validate
 * 入参：{ scriptId: string }
 *
 * 复用本地算法（TimelineExtractor + ConflictDetector），不依赖 Supabase Edge Function 部署。
 * 与 /api/generate/[phase]/route.ts 模式一致：本地直接调用算法层，避免 dev 环境 404。
 *
 * 流程：
 *   1. TimelineExtractor.extract(scriptId) 提取全角色时间线事件
 *   2. ConflictDetector.detect(events) 检测冲突
 *   3. 结果写入 validation_reports 表（容错：失败不阻塞返回）
 *   4. 返回 { events, conflicts, stats, reportId, createdAt }
 *
 * 响应：
 *   - 200：{ scriptId, events, conflicts, stats, reportId, createdAt }
 *   - 400：{ error } 参数缺失
 *   - 422：{ error, scriptId, events: [], conflicts: [], stats } 内容不足（事件数为 0）
 *   - 500：{ error, scriptId } 校验异常
 */
import { NextResponse } from 'next/server';
import { TimelineExtractor } from '@/lib/validation/timeline/extractor';
import {
  ConflictDetector,
  type ConflictItem,
  type ConflictSeverity,
} from '@/lib/validation/timeline/conflict-detector';
import type { TimelineEvent } from '@/lib/validation/timeline/extractor';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ValidateRequestBody {
  scriptId: string;
}

interface ValidationStats {
  totalEvents: number;
  totalConflicts: number;
  severeCount: number;
  warningCount: number;
  hintCount: number;
  narrativeTrickCount: number;
  locationConflictCount: number;
  causalityBreakCount: number;
  coverageWarningCount: number;
}

interface ValidateResponse {
  scriptId: string;
  events: TimelineEvent[];
  conflicts: ConflictItem[];
  stats: ValidationStats;
  reportId: string | null;
  createdAt: string;
}

function validateBody(body: unknown): body is ValidateRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.scriptId === 'string' && b.scriptId.length > 0;
}

/** 统计冲突数量 */
function computeStats(events: TimelineEvent[], conflicts: ConflictItem[]): ValidationStats {
  const stats: ValidationStats = {
    totalEvents: events.length,
    totalConflicts: conflicts.length,
    severeCount: 0,
    warningCount: 0,
    hintCount: 0,
    narrativeTrickCount: 0,
    locationConflictCount: 0,
    causalityBreakCount: 0,
    coverageWarningCount: 0,
  };
  conflicts.forEach((c) => {
    if (c.severity === 'severe') stats.severeCount += 1;
    else if (c.severity === 'warning') stats.warningCount += 1;
    else stats.hintCount += 1;
    // 新类型统计
    if (c.type === 'location_conflict') stats.locationConflictCount += 1;
    else if (c.type === 'causality_break') stats.causalityBreakCount += 1;
    else if (c.type === 'coverage_warning') stats.coverageWarningCount += 1;
  });
  events.forEach((e) => {
    if (e.isNarrativeTrick) stats.narrativeTrickCount += 1;
  });
  return stats;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return Boolean(
    error.code === 'PGRST205' ||
      error.message?.includes('Could not find the table') ||
      error.message?.includes('schema cache'),
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!validateBody(body)) {
    return NextResponse.json(
      { error: 'Invalid parameters: scriptId required' },
      { status: 400 },
    );
  }

  const { scriptId } = body;

  try {
    // 1. 提取时间线事件
    const extractor = new TimelineExtractor();
    const events = await extractor.extract(scriptId);

    // 2. 内容不足校验：事件数为 0 则返回 422 友好提示
    if (events.length === 0) {
      return NextResponse.json(
        {
          error: '内容不足：未提取到任何时间线事件，请先在剧本中标注时间点',
          scriptId,
          events: [],
          conflicts: [],
          stats: {
            totalEvents: 0,
            totalConflicts: 0,
            severeCount: 0,
            warningCount: 0,
            hintCount: 0,
            narrativeTrickCount: 0,
            locationConflictCount: 0,
            causalityBreakCount: 0,
            coverageWarningCount: 0,
          },
        },
        { status: 422 },
      );
    }

    // 查询剧本 genre（用于事件类型覆盖校验）
    let genre: string | undefined;
    try {
      const adminClient = createAdminClient();
      const { data: scriptRow } = await adminClient
        .from('scripts')
        .select('genre')
        .eq('id', scriptId)
        .maybeSingle();
      genre = scriptRow?.genre ?? undefined;
    } catch {
      // 查询失败不阻塞校验
    }

    // 3. 冲突检测（传 genre 给覆盖校验）
    const detector = new ConflictDetector();
    const conflicts = detector.detect(events, genre ? { genre } : undefined);

    // 4. 统计
    const stats = computeStats(events, conflicts);

    // 5. 写入 validation_reports 表（容错：失败不阻塞返回）
    // 优先用 service_role admin 客户端绕过 RLS；不可用则回退到会话客户端
    let reportId: string | null = null;
    try {
      let supabase: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createServerSupabaseClient>>;
      try {
        supabase = createAdminClient();
      } catch {
        supabase = await createServerSupabaseClient();
      }

      const id = crypto.randomUUID();
      const { data: reportRow, error: reportError } = await supabase
        .from('validation_reports')
        .insert({
          id,
          script_id: scriptId,
          report_type: 'TIMELINE',
          status: 'completed',
          result_data: { events, conflicts, stats } as unknown as never,
          issue_count_severe: stats.severeCount,
          issue_count_warning: stats.warningCount,
          issue_count_hint: stats.hintCount,
          script_version_ref: null,
        })
        .select('id')
        .single();

      if (reportError && !isMissingTableError(reportError)) {
        console.warn(`validation_reports insert failed: ${reportError.message}`);
      } else if (reportRow) {
        reportId = (reportRow as { id: string }).id;
      }
    } catch (err) {
      // 写库失败不影响校验结果返回
      console.warn('validation_reports persistence skipped:', err instanceof Error ? err.message : 'unknown');
    }

    // 6. 返回结果
    const response: ValidateResponse = {
      scriptId,
      events,
      conflicts,
      stats,
      reportId,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `时间线校验失败: ${message}`, scriptId },
      { status: 500 },
    );
  }
}

// 导出类型供前端复用
export type { ValidateRequestBody, ValidateResponse, ValidationStats, ConflictSeverity };
