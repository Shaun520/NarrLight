import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  CharacterPage,
  ScriptNodeData,
  TreeGroup,
} from '@/components/editor/script-data';

interface EditorDataBundle {
  dataMap: Record<string, ScriptNodeData>;
  groups: TreeGroup[];
  labels: Record<string, string>;
  defaultNodeId: string;
  /** 剧本标题（从 scripts 表查询，供时间线校验页等下游模块复用） */
  scriptTitle: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphsFromText(value: unknown): string[] {
  const text = String(value ?? '').trim();
  if (!text) return ['暂无内容。'];
  return text
    .split(/\n{2,}|\r?\n/)
    .map((line) => escapeHtml(line.trim()))
    .filter(Boolean);
}

function htmlBlock(title: string, value: unknown, actNum = '全本'): string {
  return `<h2><span class="act-num">${escapeHtml(actNum)}</span>${escapeHtml(title)}</h2>${paragraphsFromText(value)
    .map((p) => `<p>${p}</p>`)
    .join('')}`;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return Boolean(
    error.code === 'PGRST205' ||
      error.message?.includes('Could not find the table') ||
      error.message?.includes('schema cache'),
  );
}

function isRecord(value: Record<string, unknown> | null): value is Record<string, unknown> {
  return Boolean(value);
}

async function safeQuery<T>(query: PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>) {
  const { data, error } = await query;
  if (error && !isMissingTableError(error)) {
    console.warn(`Editor data query failed: ${error.message}`);
  }
  return error ? null : data;
}

async function loadFallbackTasks(scriptId: string) {
  const supabase = createAdminClient();
  const data = await safeQuery(
    supabase
      .from('generation_tasks')
      .select('task_type, result_data, completed_at, created_at')
      .eq('script_id', scriptId)
      .order('completed_at', { ascending: false }),
  );

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => row.result_data as Record<string, unknown> | null)
    .filter(isRecord);
}

export async function GET(_request: Request, { params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  const supabase = createAdminClient();

  const [characters, characterScripts, clues, organizerRows, truthRows, fallbacks, scriptRows] = await Promise.all([
    safeQuery(
      supabase
        .from('characters')
        .select('id, name, role_identity, is_murderer, sort_order')
        .eq('script_id', scriptId)
        .order('sort_order'),
    ),
    safeQuery(
      supabase
        .from('character_scripts')
        .select('character_id, act_scripts, personal_arc, perspective_note')
        .eq('script_id', scriptId),
    ),
    safeQuery(
      supabase
        .from('clues')
        .select('title, content, clue_type, search_round, location, is_distractor, is_key_clue, unlock_condition')
        .eq('script_id', scriptId)
        .order('search_round'),
    ),
    safeQuery(
      supabase
        .from('organizer_manuals')
        .select('opening_flow, duration_control, pacing_hints, npc_guide, mechanism_rules')
        .eq('script_id', scriptId)
        .limit(1),
    ),
    safeQuery(
      supabase
        .from('truth_reviews')
        .select('full_summary, method_detail, motive_detail, timeline_full')
        .eq('script_id', scriptId)
        .limit(1),
    ),
    loadFallbackTasks(scriptId),
    safeQuery(
      supabase
        .from('scripts')
        .select('title')
        .eq('id', scriptId)
        .limit(1),
    ),
  ]);

  // 提取剧本标题（容错：查询失败或无记录时回退为空字符串）
  const scriptTitle = ((scriptRows as Array<Record<string, unknown>> | null)?.[0]?.title as string | undefined) ?? '';

  const dataMap: Record<string, ScriptNodeData> = {};
  const labels: Record<string, string> = {};
  const groups: TreeGroup[] = [];

  const scriptFallbacks = fallbacks
    .filter((item) => String(item.phase ?? '').startsWith('character-script:'))
    .map((item) => item as { phase?: string; result?: { characterName?: string; script?: Record<string, unknown> } });

  const scriptsByCharacter = new Map<string, Record<string, unknown>>();
  for (const row of (characterScripts ?? []) as Array<Record<string, unknown>>) {
    scriptsByCharacter.set(String(row.character_id), row);
  }

  const colors = ['#8a1c1c', '#b08d57', '#4a7c59', '#3a5a7a', '#7a5c3a', '#6a4a8a', '#8a4a6a'];
  const charNodeIds: string[] = [];
  for (const [index, character] of ((characters ?? []) as Array<Record<string, unknown>>).entries()) {
    const nodeId = `char-${character.id}`;
    const fallbackScript = scriptFallbacks.find((item) => item.result?.characterName === character.name)?.result?.script;
    const script = scriptsByCharacter.get(String(character.id)) ?? fallbackScript ?? {};
    const actScripts = Array.isArray(script.act_scripts)
      ? (script.act_scripts as Array<Record<string, unknown>>)
      : Array.isArray(script.actScripts)
        ? (script.actScripts as Array<Record<string, unknown>>)
        : [];
    const perspectiveNote = String(script.perspective_note ?? script.perspectiveNote ?? '');
    const pages: CharacterPage[] = actScripts.length
      ? actScripts.map((act, actIndex) => ({
          act: String(act.actTitle ?? `第${actIndex + 1}幕`),
          title: String(act.actTitle ?? `第${actIndex + 1}幕`),
          subtitle: perspectiveNote,
          paragraphs: paragraphsFromText(act.content),
        }))
      : [
          {
            act: '全本',
            title: '人物设定',
            subtitle: String(character.role_identity ?? ''),
            paragraphs: paragraphsFromText(script.personal_arc ?? script.personalArc ?? character.role_identity ?? '暂无角色剧本。'),
          },
        ];

    dataMap[nodeId] = {
      type: 'character',
      id: nodeId,
      name: String(character.name ?? `角色 ${index + 1}`),
      role: `${character.is_murderer ? '凶手' : '角色'} · ${String(character.role_identity ?? '')}`,
      color: colors[index % colors.length],
      pages,
    };
    labels[nodeId] = `${String(character.name ?? `角色 ${index + 1}`)}${character.is_murderer ? '（凶手）' : ''}`;
    charNodeIds.push(nodeId);
  }

  if (charNodeIds.length) {
    groups.push({ group: 'chars', label: '人物剧本', children: charNodeIds, count: charNodeIds.length });
  }

  const organizer = ((organizerRows ?? []) as Array<Record<string, unknown>>)[0];
  const organizerFallback = fallbacks.find((item) => item.phase === 'organizer-manual')?.result as Record<string, unknown> | undefined;
  const organizerData = organizer ?? organizerFallback;
  if (organizerData) {
    const openingFlow = Array.isArray(organizerData.opening_flow)
      ? organizerData.opening_flow
      : Array.isArray(organizerData.openingFlow)
        ? organizerData.openingFlow
        : [];
    const durationControl = Array.isArray(organizerData.duration_control)
      ? organizerData.duration_control
      : Array.isArray(organizerData.durationControl)
        ? organizerData.durationControl
        : [];

    dataMap['org-search'] = {
      type: 'simple',
      id: 'org-search',
      title: '第二幕 · 公共搜证',
      actNum: '第二幕',
      fullTitle: '组织者手册 · 公共搜证',
      html: htmlBlock('公共搜证', organizerData.pacing_hints ?? organizerData.pacingHints ?? '暂无扶车提示。', '第二幕'),
    };
    dataMap['org-flow'] = {
      type: 'simple',
      id: 'org-flow',
      title: '开本流程',
      actNum: '流程',
      fullTitle: '组织者手册 · 开本流程',
      html: openingFlow
        .map((step: Record<string, unknown>) =>
          htmlBlock(
            `${step.step ?? ''} ${step.title ?? '流程'}`,
            `${step.content ?? ''}${step.durationMinutes ? `\n预计 ${step.durationMinutes} 分钟` : ''}`,
            '流程',
          ),
        )
        .join(''),
    };
    dataMap['org-rescue'] = {
      type: 'simple',
      id: 'org-rescue',
      title: '扶车提示',
      actNum: '提示',
      fullTitle: '组织者手册 · 扶车提示',
      html: [htmlBlock('扶车提示', organizerData.pacing_hints ?? organizerData.pacingHints, '提示'), htmlBlock('NPC 指引', organizerData.npc_guide ?? organizerData.npcGuide, 'NPC')].join(''),
    };
    dataMap['org-duration'] = {
      type: 'simple',
      id: 'org-duration',
      title: '时长控制',
      actNum: '时长',
      fullTitle: '组织者手册 · 时长控制',
      html: durationControl
        .map((item: Record<string, unknown>) =>
          htmlBlock(
            String(item.actTitle ?? '时长控制'),
            `${item.durationMinutes ? `${item.durationMinutes} 分钟\n` : ''}${item.pacingHint ?? ''}`,
            '时长',
          ),
        )
        .join('') || htmlBlock('时长控制', '暂无内容。', '时长'),
    };

    labels['org-search'] = '第二幕 · 公共搜证';
    labels['org-flow'] = '开本流程';
    labels['org-rescue'] = '扶车提示';
    labels['org-duration'] = '时长控制';
    groups.push({
      group: 'organizer',
      label: '组织者手册',
      children: ['org-search', 'org-flow', 'org-rescue', 'org-duration'],
      count: 4,
    });
  }

  const clueItems = ((clues ?? []) as Array<Record<string, unknown>>).map((clue, index) => ({
    no: `#${String(index + 1).padStart(3, '0')}`,
    title: String(clue.title ?? `线索 ${index + 1}`),
    tag: clue.is_key_clue ? '关键' : clue.is_distractor ? '伪线索' : String(clue.clue_type ?? '线索'),
    tagType: clue.is_key_clue ? ('blood' as const) : clue.is_distractor ? ('ok' as const) : undefined,
    loc: String(clue.location ?? ''),
  }));

  dataMap['clues-overview'] = {
    type: 'clue-overview',
    id: 'clues-overview',
    title: '线索卡',
    actNum: `${clueItems.length}`,
    fullTitle: `线索卡总览 · ${clueItems.length}`,
    clues: clueItems,
  };
  labels['clues-overview'] = '线索卡总览';
  groups.push({ group: 'clues-overview', label: '线索卡', children: ['clues-overview'], count: clueItems.length });

  const truth = (((truthRows ?? []) as Array<Record<string, unknown>>)[0] ??
    fallbacks.find((item) => item.phase === 'truth-review')?.result ??
    {}) as Record<string, unknown>;
  dataMap.truth = {
    type: 'simple',
    id: 'truth',
    title: '真相复盘',
    actNum: '终局',
    fullTitle: '真相复盘',
    html: [
      htmlBlock('真相总述', truth.full_summary ?? truth.fullSummary, '全本'),
      htmlBlock('作案手法', truth.method_detail ?? truth.methodDetail, '手法'),
      htmlBlock('动机链', truth.motive_detail ?? truth.motiveDetail, '动机'),
      htmlBlock('完整时间线', truth.timeline_full ?? truth.timelineFull, '时间线'),
    ].join(''),
  };
  labels.truth = '真相复盘';
  groups.push({ group: 'truth', label: '真相复盘', children: ['truth'], count: 1 });

  const bundle: EditorDataBundle = {
    dataMap,
    labels,
    groups,
    defaultNodeId: groups.find((group) => group.group === 'organizer')?.children[0] ?? charNodeIds[0] ?? 'clues-overview',
    scriptTitle,
  };

  if (!Object.keys(dataMap).length) {
    return NextResponse.json({ error: 'Editor data not found' }, { status: 404 });
  }

  return NextResponse.json(bundle);
}
