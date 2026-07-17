import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { VersionService } from '@/lib/services/version-service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasRollbackPayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    isRecord(payload.script) ||
      Array.isArray(payload.characters) ||
      Array.isArray(payload.acts) ||
      Array.isArray(payload.scenes) ||
      Array.isArray(payload.clues) ||
      Array.isArray(payload.character_relations) ||
      Array.isArray(payload.timeline_events) ||
      Array.isArray(payload.character_scripts) ||
      Array.isArray(payload.organizer_manuals) ||
      Array.isArray(payload.truth_reviews),
  );
}

async function loadScriptMetadata(
  supabase: SupabaseClient,
  scriptId: string,
): Promise<{ id: string; updatedAt: string; wordCount: number }> {
  const { data, error } = await supabase
    .from('scripts')
    .select('id, updated_at, word_count')
    .eq('id', scriptId)
    .single();

  if (error) throw new Error(`读取剧本元信息失败: ${error.message}`);
  return {
    id: String(data.id),
    updatedAt: String(data.updated_at),
    wordCount: Number(data.word_count ?? 0),
  };
}

async function invalidateValidationResults(supabase: SupabaseClient, scriptId: string) {
  const [reports, difficulty] = await Promise.all([
    supabase.from('validation_reports').delete().eq('script_id', scriptId),
    supabase.from('difficulty_assessments').delete().eq('script_id', scriptId),
  ]);

  if (reports.error) throw new Error(`清理旧校验报告失败: ${reports.error.message}`);
  if (difficulty.error) throw new Error(`清理旧难度评估失败: ${difficulty.error.message}`);

  return {
    validation: true,
    timeline: true,
    difficulty: true,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isRecord(body) || typeof body.versionNumber !== 'number') {
    return NextResponse.json({ error: 'Invalid rollback payload' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient() as unknown as SupabaseClient;
    const { data: target, error } = await supabase
      .from('version_snapshots')
      .select('snapshot_data')
      .eq('script_id', scriptId)
      .eq('version_number', body.versionNumber)
      .maybeSingle();

    if (error) throw new Error(`读取目标版本失败: ${error.message}`);
    if (!target) {
      return NextResponse.json({ error: `版本 v${body.versionNumber} 不存在` }, { status: 404 });
    }

    const snapshotData = target.snapshot_data as Record<string, unknown>;
    if (!hasRollbackPayload(snapshotData)) {
      return NextResponse.json(
        { error: `版本 v${body.versionNumber} 缺少完整回滚快照，不能用于编辑器回滚` },
        { status: 409 },
      );
    }

    const versionService = new VersionService(supabase);
    const snapshot = await versionService.rollback(scriptId, body.versionNumber);
    const script = await loadScriptMetadata(supabase, scriptId);
    const invalidated = await invalidateValidationResults(supabase, scriptId);
    return NextResponse.json({ snapshot, script, invalidated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '回滚失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
