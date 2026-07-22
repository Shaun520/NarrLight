import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deleteVersionResponse,
  getVersionPreviewResponse,
} from './versions/[versionNumber]/route';
import type {
  CharacterPage,
  ScriptNodeData,
  TreeGroup,
} from '@/components/editor/script-data';
import type { SupabaseClient } from '@supabase/supabase-js';

interface EditorDataBundle {
  dataMap: Record<string, ScriptNodeData>;
  groups: TreeGroup[];
  labels: Record<string, string>;
  defaultNodeId: string;
  /** 剧本标题（从 scripts 表查询，供时间线校验页等下游模块复用） */
  scriptTitle: string;
  versions: EditorVersionItem[];
}

interface EditorVersionItem {
  version: string;
  versionNumber: number;
  time: string;
  note: string;
  isCurrent?: boolean;
}

interface VersionSnapshotListRow {
  version_number: number;
  change_summary: string | null;
  created_at: string;
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
  if (!text) return [];
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

function optionalHtmlBlock(title: string, value: unknown, actNum = '全本'): string {
  return paragraphsFromText(value).length ? htmlBlock(title, value, actNum) : '';
}

function isFullPlayerScriptLabel(label: string): boolean {
  return label === '完整玩家剧本' || label === '完整角色本';
}

async function queryOrThrow<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string,
) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function formatVersionTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  if (sameDay) return `${time} 今日`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨日 ${time}`;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

async function loadVersions(supabase: SupabaseClient, scriptId: string): Promise<EditorVersionItem[]> {
  const { data, error } = await supabase
    .from('version_snapshots')
    .select('version_number, change_summary, created_at')
    .eq('script_id', scriptId)
    .order('version_number', { ascending: false });

  if (error) throw new Error(`获取版本列表失败: ${error.message}`);

  return ((data ?? []) as VersionSnapshotListRow[]).map((snapshot, index) => ({
    version: `v${snapshot.version_number}`,
    versionNumber: snapshot.version_number,
    time: formatVersionTime(snapshot.created_at),
    note: snapshot.change_summary || '保存版本',
    isCurrent: index === 0,
  }));
}

export async function GET(request: Request, { params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  const previewVersion = new URL(request.url).searchParams.get('previewVersion');
  if (previewVersion) {
    return getVersionPreviewResponse(scriptId, previewVersion);
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;

  try {
    const [script, characters, characterScripts, clues, organizer, truth, versions] =
      await Promise.all([
        queryOrThrow(
          supabase.from('scripts').select('id, title').eq('id', scriptId).maybeSingle(),
          '读取剧本失败',
        ),
        queryOrThrow(
          supabase
            .from('characters')
            .select('id, name, role_identity, is_murderer, sort_order')
            .eq('script_id', scriptId)
            .order('sort_order'),
          '读取人物失败',
        ),
        queryOrThrow(
          supabase
            .from('character_scripts')
            .select('character_id, part_index, part_label, act_order, act_scripts, personal_arc, perspective_note')
            .eq('script_id', scriptId)
            .order('part_index'),
          '读取人物剧本失败',
        ),
        queryOrThrow(
          supabase
            .from('clues')
            .select('title, clue_type, search_round, location, is_distractor, is_key_clue')
            .eq('script_id', scriptId)
            .order('search_round'),
          '读取线索失败',
        ),
        queryOrThrow(
          supabase
            .from('organizer_manuals')
            .select('opening_flow, duration_control, pacing_hints, npc_guide, mechanism_rules')
            .eq('script_id', scriptId)
            .maybeSingle(),
          '读取组织者手册失败',
        ),
        queryOrThrow(
          supabase
            .from('truth_reviews')
            .select('full_summary, method_detail, motive_detail, timeline_full')
            .eq('script_id', scriptId)
            .maybeSingle(),
          '读取真相复盘失败',
        ),
        loadVersions(supabase, scriptId),
      ]);

    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    const dataMap: Record<string, ScriptNodeData> = {};
    const labels: Record<string, string> = {};
    const groups: TreeGroup[] = [];
    const scriptTitle = String((script as Record<string, unknown>).title ?? '');

    const scriptsByCharacter = new Map<string, Array<Record<string, unknown>>>();
    for (const row of (characterScripts ?? []) as Array<Record<string, unknown>>) {
      const characterId = String(row.character_id);
      const rows = scriptsByCharacter.get(characterId) ?? [];
      rows.push(row);
      scriptsByCharacter.set(characterId, rows);
    }

    const colors = ['#8a1c1c', '#b08d57', '#4a7c59', '#3a5a7a', '#7a5c3a', '#6a4a8a', '#8a4a6a'];
    const charNodeIds: string[] = [];
    for (const [index, character] of ((characters ?? []) as Array<Record<string, unknown>>).entries()) {
      const characterScriptRows = scriptsByCharacter.get(String(character.id)) ?? [];
      for (const characterScript of characterScriptRows) {
        const actScripts = Array.isArray(characterScript.act_scripts)
          ? (characterScript.act_scripts as Array<Record<string, unknown>>)
          : [];
        const perspectiveNote = String(characterScript.perspective_note ?? '');
        const personalArc = paragraphsFromText(characterScript.personal_arc);
        const pages: CharacterPage[] = actScripts.length
          ? actScripts
              .map((act, actIndex) => ({
                act: String(act.actTitle ?? `第${actIndex + 1}幕`),
                title: String(act.actTitle ?? `第${actIndex + 1}幕`),
                subtitle: perspectiveNote,
                paragraphs: paragraphsFromText(act.content),
              }))
              .filter((page) => page.paragraphs.length > 0)
          : personalArc.length
            ? [
                {
                  act: '全本',
                  title: '人物设定',
                  subtitle: String(character.role_identity ?? ''),
                  paragraphs: personalArc,
                },
              ]
            : [];

        if (!pages.length) continue;

        const partIndex = Number(characterScript.part_index ?? 1) || 1;
        const partLabel = String(characterScript.part_label ?? '完整玩家剧本');
        const nodeId =
          characterScriptRows.length === 1 && partIndex === 1 && isFullPlayerScriptLabel(partLabel)
            ? `char-${character.id}`
            : `char-${character.id}-part-${partIndex}`;
        const name = String(character.name ?? `角色 ${index + 1}`);
        dataMap[nodeId] = {
          type: 'character',
          id: nodeId,
          name,
          partLabel,
          role: `${character.is_murderer ? '凶手' : '角色'} · ${String(character.role_identity ?? '')}`,
          color: colors[index % colors.length],
          pages,
        };
        labels[nodeId] =
          `${name}${character.is_murderer ? '（凶手）' : ''}${isFullPlayerScriptLabel(partLabel) ? '' : ` · ${partLabel}`}`;
        charNodeIds.push(nodeId);
      }
    }

    if (charNodeIds.length) {
      groups.push({ group: 'chars', label: '人物剧本', children: charNodeIds, count: charNodeIds.length });
    }

    const organizerData = organizer as Record<string, unknown> | null;
    if (organizerData) {
      const openingFlow = Array.isArray(organizerData.opening_flow)
        ? (organizerData.opening_flow as Array<Record<string, unknown>>)
        : [];
      const durationControl = Array.isArray(organizerData.duration_control)
        ? (organizerData.duration_control as Array<Record<string, unknown>>)
        : [];
      const organizerChildren: string[] = [];

      if (String(organizerData.pacing_hints ?? '').trim()) {
        dataMap['org-search'] = {
          type: 'simple',
          id: 'org-search',
          title: '公共搜证',
          actNum: '搜证',
          fullTitle: '组织者手册 · 公共搜证',
          html: htmlBlock('公共搜证', organizerData.pacing_hints, '搜证'),
        };
        labels['org-search'] = '公共搜证';
        organizerChildren.push('org-search');
      }

      if (openingFlow.length) {
        dataMap['org-flow'] = {
          type: 'simple',
          id: 'org-flow',
          title: '开本流程',
          actNum: '流程',
          fullTitle: '组织者手册 · 开本流程',
          html: openingFlow
            .map((step) =>
              htmlBlock(
                `${step.step ?? ''} ${step.title ?? '流程'}`,
                `${step.content ?? ''}${step.durationMinutes ? `\n预计 ${step.durationMinutes} 分钟` : ''}`,
                '流程',
              ),
            )
            .join(''),
        };
        labels['org-flow'] = '开本流程';
        organizerChildren.push('org-flow');
      }

      if (String(organizerData.npc_guide ?? '').trim()) {
        dataMap['org-rescue'] = {
          type: 'simple',
          id: 'org-rescue',
          title: '扶车提示',
          actNum: '提示',
          fullTitle: '组织者手册 · 扶车提示',
          html: htmlBlock('NPC 指引', organizerData.npc_guide, 'NPC'),
        };
        labels['org-rescue'] = '扶车提示';
        organizerChildren.push('org-rescue');
      }

      if (durationControl.length) {
        dataMap['org-duration'] = {
          type: 'simple',
          id: 'org-duration',
          title: '时长控制',
          actNum: '时长',
          fullTitle: '组织者手册 · 时长控制',
          html: durationControl
            .map((item) =>
              htmlBlock(
                String(item.actTitle ?? '时长控制'),
                `${item.durationMinutes ? `${item.durationMinutes} 分钟\n` : ''}${item.pacingHint ?? ''}`,
                '时长',
              ),
            )
            .join(''),
        };
        labels['org-duration'] = '时长控制';
        organizerChildren.push('org-duration');
      }

      if (organizerChildren.length) {
        groups.push({
          group: 'organizer',
          label: '组织者手册',
          children: organizerChildren,
          count: organizerChildren.length,
        });
      }
    }

    const clueItems = ((clues ?? []) as Array<Record<string, unknown>>).map((clue, index) => ({
      no: `#${String(index + 1).padStart(3, '0')}`,
      title: String(clue.title ?? `线索 ${index + 1}`),
      tag: clue.is_key_clue ? '关键' : clue.is_distractor ? '伪线索' : String(clue.clue_type ?? '线索'),
      tagType: clue.is_key_clue ? ('blood' as const) : clue.is_distractor ? ('ok' as const) : undefined,
      loc: String(clue.location ?? ''),
    }));

    if (clueItems.length) {
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
    }

    const truthData = truth as Record<string, unknown> | null;
    if (truthData) {
      const truthHtml = [
        optionalHtmlBlock('真相总述', truthData.full_summary, '全本'),
        optionalHtmlBlock('作案手法', truthData.method_detail, '手法'),
        optionalHtmlBlock('动机链', truthData.motive_detail, '动机'),
        optionalHtmlBlock('完整时间线', truthData.timeline_full, '时间线'),
      ].join('');
      if (truthHtml.trim()) {
        dataMap.truth = {
          type: 'simple',
          id: 'truth',
          title: '真相复盘',
          actNum: '终局',
          fullTitle: '真相复盘',
          html: truthHtml,
        };
        labels.truth = '真相复盘';
        groups.push({ group: 'truth', label: '真相复盘', children: ['truth'], count: 1 });
      }
    }

    const defaultNodeId = groups[0]?.children[0];
    if (!defaultNodeId) {
      return NextResponse.json({ error: 'Editor data not found' }, { status: 404 });
    }

    const bundle: EditorDataBundle = {
      dataMap,
      labels,
      groups,
      defaultNodeId,
      scriptTitle,
      versions,
    };

    return NextResponse.json(bundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取编辑器数据失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  const deleteVersion = new URL(request.url).searchParams.get('deleteVersion');
  if (!deleteVersion) {
    return NextResponse.json({ error: 'Missing deleteVersion' }, { status: 400 });
  }

  return deleteVersionResponse(scriptId, deleteVersion);
}
