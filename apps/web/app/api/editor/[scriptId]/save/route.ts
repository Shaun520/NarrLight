import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { VersionService } from '@/lib/services/version-service';
import type { Json } from '@/lib/supabase/types';
import type { OperationType } from '@/types';

type EditorNodeType = 'character' | 'simple' | 'clue-overview';

interface CharacterPageInput {
  act: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
}

interface SectionInput {
  actNum: string;
  title: string;
  text: string;
}

interface ClueInput {
  no: string;
  title: string;
  tag: string;
  loc: string;
}

interface SaveEditorNodeRequest {
  nodeId: string;
  nodeType: EditorNodeType;
  title: string;
  html: string;
  plainText: string;
  partLabel?: string;
  pages?: CharacterPageInput[];
  sections?: SectionInput[];
  clues?: ClueInput[];
  createVersion?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidBody(value: unknown): value is SaveEditorNodeRequest {
  if (!isRecord(value)) return false;
  if (
    typeof value.nodeId !== 'string' ||
    typeof value.nodeType !== 'string' ||
    !['character', 'simple', 'clue-overview'].includes(value.nodeType) ||
    typeof value.title !== 'string' ||
    typeof value.html !== 'string' ||
    typeof value.plainText !== 'string'
  ) {
    return false;
  }
  if (value.createVersion !== undefined && typeof value.createVersion !== 'boolean') {
    return false;
  }
  return true;
}

function wordCount(value: string): number {
  return value.replace(/\s+/g, '').length;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function textFromSections(sections: SectionInput[] | undefined, fallback: string): string {
  const text = (sections ?? [])
    .map((section) => section.text.trim())
    .filter(Boolean)
    .join('\n\n');
  return text || fallback;
}

function findSectionText(sections: SectionInput[] | undefined, keywords: string[], fallback = ''): string {
  const section = (sections ?? []).find((item) =>
    keywords.some((keyword) => item.title.includes(keyword)),
  );
  return section?.text.trim() || fallback;
}

function mapOperationType(nodeType: EditorNodeType): OperationType {
  if (nodeType === 'character') return 'EDIT_CHARACTER';
  if (nodeType === 'clue-overview') return 'EDIT_CLUE';
  return 'STYLE_CHANGE';
}

function mapClueType(tag: string, fallback: string): string {
  if (tag.includes('口供')) return 'testimony';
  if (tag.includes('深层') || tag.includes('关键')) return 'deep';
  if (tag.includes('隐藏')) return 'hidden';
  return fallback || 'physical';
}

function parseCharacterNodeId(nodeId: string): { characterId: string; partIndex: number } | null {
  const partMatch = nodeId.match(/^char-(.+)-part-(\d+)$/);
  if (partMatch) {
    return {
      characterId: partMatch[1],
      partIndex: Math.max(1, Number(partMatch[2]) || 1),
    };
  }
  if (nodeId.startsWith('char-')) {
    return {
      characterId: nodeId.replace(/^char-/, ''),
      partIndex: 1,
    };
  }
  return null;
}

async function safeRows<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function ensureScriptExists(supabase: SupabaseClient, scriptId: string): Promise<void> {
  const { data, error } = await supabase
    .from('scripts')
    .select('id')
    .eq('id', scriptId)
    .maybeSingle();
  if (error) throw new Error(`查询剧本失败: ${error.message}`);
  if (!data) throw new Error('剧本不存在');
}

async function saveCharacterNode(
  supabase: SupabaseClient,
  scriptId: string,
  payload: SaveEditorNodeRequest,
): Promise<void> {
  const parsedNode = parseCharacterNodeId(payload.nodeId);
  if (!parsedNode?.characterId) {
    throw new Error('人物节点 ID 无效');
  }

  const pages = payload.pages?.length
    ? payload.pages
    : [
        {
          act: '全本',
          title: payload.title || '人物剧本',
          subtitle: '',
          paragraphs: [payload.plainText],
        },
      ];

  const actScripts = pages.map((page, index) => ({
    actTitle: page.title || page.act || `第${index + 1}幕`,
    content: page.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean).join('\n\n'),
  }));

  const { error } = await supabase.from('character_scripts').upsert(
    {
      script_id: scriptId,
      character_id: parsedNode.characterId,
      part_index: parsedNode.partIndex,
      part_label: payload.partLabel || (parsedNode.partIndex === 1 ? '完整玩家剧本' : `第${parsedNode.partIndex}本玩家剧本`),
      act_order: null,
      act_scripts: actScripts as unknown as Json,
      personal_arc: payload.plainText,
      visible_clue_titles: [],
      perspective_note: pages[0]?.subtitle ?? '',
      word_count: wordCount(payload.plainText),
      generation_status: 'completed',
    },
    { onConflict: 'script_id,character_id,part_index' },
  );

  if (error) throw new Error(`保存人物剧本失败: ${error.message}`);
}

async function saveOrganizerNode(
  supabase: SupabaseClient,
  scriptId: string,
  payload: SaveEditorNodeRequest,
): Promise<void> {
  const existing = await safeRows<Record<string, unknown>>(
    supabase
      .from('organizer_manuals')
      .select('opening_flow, duration_control, pacing_hints, npc_guide, mechanism_rules')
      .eq('script_id', scriptId)
      .maybeSingle(),
  );

  const row: Record<string, unknown> = {
    script_id: scriptId,
    opening_flow: Array.isArray(existing?.opening_flow) ? existing.opening_flow : [],
    duration_control: Array.isArray(existing?.duration_control) ? existing.duration_control : [],
    pacing_hints: normalizeText(existing?.pacing_hints),
    npc_guide: normalizeText(existing?.npc_guide),
    mechanism_rules: normalizeText(existing?.mechanism_rules),
  };

  if (payload.nodeId === 'org-flow') {
    row.opening_flow = (payload.sections?.length ? payload.sections : [{ actNum: '', title: payload.title, text: payload.plainText }]).map(
      (section, index) => ({
        step: index + 1,
        title: section.title || `流程 ${index + 1}`,
        content: section.text,
        durationMinutes: null,
      }),
    );
  } else if (payload.nodeId === 'org-duration') {
    row.duration_control = (payload.sections?.length ? payload.sections : [{ actNum: '', title: payload.title, text: payload.plainText }]).map(
      (section) => ({
        actTitle: section.title || '时长控制',
        durationMinutes: null,
        pacingHint: section.text,
      }),
    );
  } else if (payload.nodeId === 'org-rescue') {
    row.pacing_hints = findSectionText(payload.sections, ['扶车', '提示'], row.pacing_hints as string);
    row.npc_guide = findSectionText(payload.sections, ['NPC', '指引'], payload.plainText);
  } else {
    row.pacing_hints = textFromSections(payload.sections, payload.plainText);
  }

  const { error } = await supabase
    .from('organizer_manuals')
    .upsert(row, { onConflict: 'script_id' });
  if (error) throw new Error(`保存组织者手册失败: ${error.message}`);
}

async function saveTruthNode(
  supabase: SupabaseClient,
  scriptId: string,
  payload: SaveEditorNodeRequest,
): Promise<void> {
  const existing = await safeRows<Record<string, unknown>>(
    supabase
      .from('truth_reviews')
      .select('full_summary, method_detail, motive_detail, character_endings, foreshadowing_resolution, timeline_full')
      .eq('script_id', scriptId)
      .maybeSingle(),
  );

  const row = {
    script_id: scriptId,
    full_summary: findSectionText(payload.sections, ['真相总述', '真相'], normalizeText(existing?.full_summary) || payload.plainText),
    method_detail: findSectionText(payload.sections, ['作案手法', '手法'], normalizeText(existing?.method_detail)),
    motive_detail: findSectionText(payload.sections, ['动机'], normalizeText(existing?.motive_detail)),
    timeline_full: findSectionText(payload.sections, ['完整时间线', '时间线'], normalizeText(existing?.timeline_full)),
    character_endings: Array.isArray(existing?.character_endings) ? existing.character_endings : [],
    foreshadowing_resolution: Array.isArray(existing?.foreshadowing_resolution)
      ? existing.foreshadowing_resolution
      : [],
  };

  const { error } = await supabase
    .from('truth_reviews')
    .upsert(row, { onConflict: 'script_id' });
  if (error) throw new Error(`保存真相复盘失败: ${error.message}`);
}

async function saveClueOverview(
  supabase: SupabaseClient,
  scriptId: string,
  payload: SaveEditorNodeRequest,
): Promise<void> {
  if (!payload.clues?.length) {
    throw new Error('没有可保存的线索数据');
  }

  const { data, error } = await supabase
    .from('clues')
    .select('id, clue_type')
    .eq('script_id', scriptId)
    .order('search_round')
    .order('sort_order');
  if (error) throw new Error(`读取线索失败: ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; clue_type: string }>;
  await Promise.all(
    payload.clues.map(async (clue, index) => {
      const row = rows[index];
      if (!row) return;
      const tag = clue.tag.trim();
      const { error: updateError } = await supabase
        .from('clues')
        .update({
          title: clue.title.trim() || `线索 ${index + 1}`,
          location: clue.loc.trim(),
          clue_type: mapClueType(tag, row.clue_type),
          is_key_clue: tag.includes('关键'),
          is_distractor: tag.includes('伪'),
        })
        .eq('id', row.id);
      if (updateError) throw new Error(`保存线索 ${clue.no || index + 1} 失败: ${updateError.message}`);
    }),
  );
}

async function saveEditorNode(
  supabase: SupabaseClient,
  scriptId: string,
  payload: SaveEditorNodeRequest,
): Promise<void> {
  if (payload.nodeType === 'character') {
    await saveCharacterNode(supabase, scriptId, payload);
  } else if (payload.nodeType === 'clue-overview') {
    await saveClueOverview(supabase, scriptId, payload);
  } else if (payload.nodeId === 'truth') {
    await saveTruthNode(supabase, scriptId, payload);
  } else if (payload.nodeId.startsWith('org-')) {
    await saveOrganizerNode(supabase, scriptId, payload);
  } else {
    throw new Error(`暂不支持保存节点 ${payload.nodeId}`);
  }
}

async function recomputeScriptWordCount(supabase: SupabaseClient, scriptId: string): Promise<number> {
  const [characterScripts, organizer, truth, clues] = await Promise.all([
    safeRows<Array<Record<string, unknown>>>(
      supabase.from('character_scripts').select('word_count, personal_arc, act_scripts').eq('script_id', scriptId),
    ),
    safeRows<Record<string, unknown>>(
      supabase
        .from('organizer_manuals')
        .select('pacing_hints, npc_guide, mechanism_rules, opening_flow, duration_control')
        .eq('script_id', scriptId)
        .maybeSingle(),
    ),
    safeRows<Record<string, unknown>>(
      supabase
        .from('truth_reviews')
        .select('full_summary, method_detail, motive_detail, timeline_full')
        .eq('script_id', scriptId)
        .maybeSingle(),
    ),
    safeRows<Array<Record<string, unknown>>>(
      supabase.from('clues').select('title, content').eq('script_id', scriptId),
    ),
  ]);

  let total = 0;
  for (const row of characterScripts ?? []) {
    const stored = Number(row.word_count ?? 0);
    if (Number.isFinite(stored) && stored > 0) {
      total += stored;
      continue;
    }
    total += wordCount(String(row.personal_arc ?? ''));
    if (Array.isArray(row.act_scripts)) {
      for (const act of row.act_scripts as Array<Record<string, unknown>>) {
        total += wordCount(String(act.content ?? ''));
      }
    }
  }

  if (organizer) {
    total += wordCount(String(organizer.pacing_hints ?? ''));
    total += wordCount(String(organizer.npc_guide ?? ''));
    total += wordCount(String(organizer.mechanism_rules ?? ''));
    total += wordCount(JSON.stringify(organizer.opening_flow ?? []));
    total += wordCount(JSON.stringify(organizer.duration_control ?? []));
  }

  if (truth) {
    total += wordCount(String(truth.full_summary ?? ''));
    total += wordCount(String(truth.method_detail ?? ''));
    total += wordCount(String(truth.motive_detail ?? ''));
    total += wordCount(String(truth.timeline_full ?? ''));
  }

  for (const clue of clues ?? []) {
    total += wordCount(String(clue.title ?? ''));
    total += wordCount(String(clue.content ?? ''));
  }

  return total;
}

async function refreshScriptMetadata(
  supabase: SupabaseClient,
  scriptId: string,
): Promise<{ id: string; updatedAt: string; wordCount: number }> {
  const wordCountValue = await recomputeScriptWordCount(supabase, scriptId);
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('scripts')
    .update({ word_count: wordCountValue, updated_at: updatedAt })
    .eq('id', scriptId)
    .select('id, updated_at, word_count')
    .single();

  if (error) throw new Error(`更新剧本元信息失败: ${error.message}`);
  return {
    id: String(data.id),
    updatedAt: String(data.updated_at),
    wordCount: Number(data.word_count ?? wordCountValue),
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

async function buildSnapshotData(
  supabase: SupabaseClient,
  scriptId: string,
  payload: SaveEditorNodeRequest,
): Promise<Record<string, unknown>> {
  const [
    scriptRows,
    characters,
    acts,
    clues,
    characterRelations,
    timelineEvents,
    characterScripts,
    organizerManuals,
    truthReviews,
  ] = await Promise.all([
    safeRows(supabase.from('scripts').select('*').eq('id', scriptId).limit(1)),
    safeRows(supabase.from('characters').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('acts').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('clues').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('character_relations').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('timeline_events').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('character_scripts').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('organizer_manuals').select('*').eq('script_id', scriptId)),
    safeRows(supabase.from('truth_reviews').select('*').eq('script_id', scriptId)),
  ]);

  const actIds = ((acts ?? []) as Array<Record<string, unknown>>)
    .map((row) => String(row.id ?? ''))
    .filter(Boolean);
  const scenes = actIds.length
    ? await safeRows(
        supabase
          .from('scenes')
          .select('*')
          .in('act_id', actIds),
      )
    : [];

  return {
    editor: {
      nodeId: payload.nodeId,
      nodeType: payload.nodeType,
      title: payload.title,
      html: payload.html,
      plainText: payload.plainText,
      savedAt: new Date().toISOString(),
    },
    script: ((scriptRows ?? []) as Record<string, unknown>[])[0],
    characters: characters ?? [],
    acts: acts ?? [],
    scenes: scenes ?? [],
    clues: clues ?? [],
    character_relations: characterRelations ?? [],
    timeline_events: timelineEvents ?? [],
    character_scripts: characterScripts ?? [],
    organizer_manuals: organizerManuals ?? [],
    truth_reviews: truthReviews ?? [],
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

  if (!isValidBody(body)) {
    return NextResponse.json({ error: 'Invalid editor save payload' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient() as unknown as SupabaseClient;
    await ensureScriptExists(supabase, scriptId);
    await saveEditorNode(supabase, scriptId, body);

    // 编辑保存（不生成版本）：只更新字数，跳过校验清理等重操作，保证快速响应
    if (body.createVersion === false) {
      const wordCountValue = wordCount(body.plainText);
      await supabase
        .from('scripts')
        .update({ word_count: wordCountValue, updated_at: new Date().toISOString() })
        .eq('id', scriptId);
      return NextResponse.json({ saved: true });
    }

    // 版本保存：重算字数 + 清理旧校验 + 生成版本快照
    const script = await refreshScriptMetadata(supabase, scriptId);
    const invalidated = await invalidateValidationResults(supabase, scriptId);

    const snapshotData = await buildSnapshotData(supabase, scriptId, body);
    const versionService = new VersionService(supabase);
    const snapshot = await versionService.createSnapshot(
      scriptId,
      `手动保存 · ${body.title || body.nodeId}`,
      mapOperationType(body.nodeType),
      snapshotData,
    );

    return NextResponse.json({ snapshot, script, invalidated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
