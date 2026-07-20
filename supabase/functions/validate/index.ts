/**
 * TIMELINE 类型 Edge Function - 时间线校验（T149 · 视图4）
 *
 * 接收 POST 请求，参数为 { scriptId: string }：
 *   1. 调用 TimelineExtractor.extract(scriptId) 提取全角色时间线事件
 *   2. 调用 ConflictDetector.detect(events) 检测冲突
 *   3. 将校验结果写入 validation_reports 表（report_type=TIMELINE）
 *   4. 返回 { events, conflicts, stats } JSON
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将服务层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { TimelineExtractor } from '@/lib/validation/timeline/extractor';
import {
  ConflictDetector,
  type ConflictItem,
  type ConflictSeverity,
} from '@/lib/validation/timeline/conflict-detector';
import type { TimelineEvent } from '@/lib/validation/timeline/extractor';

/** 入参体 */
interface ValidateRequestBody {
  scriptId: string;
}

/** 校验结果统计 */
interface ValidationStats {
  totalEvents: number;
  totalConflicts: number;
  severeCount: number;
  warningCount: number;
  hintCount: number;
  narrativeTrickCount: number;
}

/** 校验结果响应 */
interface ValidateResponse {
  scriptId: string;
  events: TimelineEvent[];
  conflicts: ConflictItem[];
  stats: ValidationStats;
  reportId: string | null;
  createdAt: string;
}

/** 校验入参 */
function validateBody(body: unknown): body is ValidateRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.scriptId === 'string' && b.scriptId.length > 0;
}

/** 统计冲突数量 */
function computeStats(
  events: TimelineEvent[],
  conflicts: ConflictItem[],
): ValidationStats {
  const stats: ValidationStats = {
    totalEvents: events.length,
    totalConflicts: conflicts.length,
    severeCount: 0,
    warningCount: 0,
    hintCount: 0,
    narrativeTrickCount: 0,
  };
  conflicts.forEach((c) => {
    if (c.severity === 'severe') stats.severeCount += 1;
    else if (c.severity === 'warning') stats.warningCount += 1;
    else stats.hintCount += 1;
  });
  events.forEach((e) => {
    if (e.isNarrativeTrick) stats.narrativeTrickCount += 1;
  });
  return stats;
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
    return new Response(JSON.stringify({ error: 'Invalid parameters: scriptId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { scriptId } = body;

  try {
    // 1. 提取时间线事件
    const extractor = new TimelineExtractor();
    const events = await extractor.extract(scriptId);

    // 内容不足校验：事件数过少则拦截
    if (events.length === 0) {
      return new Response(
        JSON.stringify({
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
          },
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 2. 冲突检测
    const detector = new ConflictDetector();
    const conflicts = detector.detect(events);

    // 3. 统计
    const stats = computeStats(events, conflicts);

    // 4. 写入 validation_reports 表（容错：失败不阻塞返回）
    let reportId: string | null = null;
    try {
      // 注意：Edge Function 部署到 Deno 时需替换为 supabase-js 客户端
      // 此处保留与项目内服务层一致的引用方式
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const id = crypto.randomUUID();
      const { data: reportRow } = await supabase
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
      if (reportRow) {
        reportId = (reportRow as { id: string }).id;
      }
    } catch {
      // 写库失败不影响校验结果返回
    }

    // 5. 返回结果
    const response: ValidateResponse = {
      scriptId,
      events,
      conflicts,
      stats,
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
      JSON.stringify({ error: `时间线校验失败: ${message}`, scriptId }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// @ts-ignore - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
Deno.serve(handleRequest);

export type { ValidateRequestBody, ValidateResponse, ValidationStats, ConflictSeverity };
