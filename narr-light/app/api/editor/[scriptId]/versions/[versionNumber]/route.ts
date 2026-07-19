import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CharacterPage, ScriptNodeData, TreeGroup } from '@/components/editor/script-data';

interface EditorSnapshotPreview {
  version: string;
  versionNumber: number;
  time: string;
  note: string;
  title: string;
  dataMap: Record<string, ScriptNodeData>;
  baseDataMap?: Record<string, ScriptNodeData>;
  baseGroups?: TreeGroup[];
  baseLabels?: Record<string, string>;
  groups: TreeGroup[];
  labels: Record<string, string>;
  defaultNodeId: string;
  touchedNodeId?: string;
  compareBaseVersion?: string;
  changes: Record<string, NodeChangeSummary>;
  changedNodeIds: string[];
}

interface NodeChangeSummary {
  status: 'added' | 'modified' | 'removed';
  currentLength: number;
  previousLength: number;
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

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  return `<h2><span class="act-num">${escapeHtml(actNum)}</span>${escapeHtml(title)}</h2>${paragraphsFromText(
    value,
  )
    .map((p) => `<p>${p}</p>`)
    .join('')}`;
}

function optionalHtmlBlock(title: string, value: unknown, actNum = '全本'): string {
  return paragraphsFromText(value).length ? htmlBlock(title, value, actNum) : '';
}

function displayNote(note: string): string {
  const rollbackMatch = note.match(/^回滚到版本\s*(\d+)$/);
  if (rollbackMatch) return `由 v${rollbackMatch[1]} 恢复后保存`;
  return note || '手动保存';
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nodeToComparableText(node: ScriptNodeData | undefined): string {
  if (!node) return '';
  if (node.type === 'character') {
    return node.pages
      .map((page) =>
        [page.act, page.title, page.subtitle, ...page.paragraphs.map(stripHtml)].join('\n'),
      )
      .join('\n\n')
      .trim();
  }
  if (node.type === 'clue-overview') {
    return node.clues
      .map((clue) => [clue.no, clue.title, clue.tag, clue.loc].join(' '))
      .join('\n')
      .trim();
  }
  return stripHtml(node.html);
}

function computeNodeChanges(
  current: Record<string, ScriptNodeData>,
  previous: Record<string, ScriptNodeData>,
): Record<string, NodeChangeSummary> {
  const changes: Record<string, NodeChangeSummary> = {};
  const nodeIds = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const nodeId of nodeIds) {
    const currentNode = current[nodeId];
    const previousNode = previous[nodeId];
    const currentText = nodeToComparableText(currentNode);
    const previousText = nodeToComparableText(previousNode);

    if (!previousNode && currentNode) {
      changes[nodeId] = {
        status: 'added',
        currentLength: currentText.length,
        previousLength: 0,
      };
    } else if (previousNode && !currentNode) {
      changes[nodeId] = {
        status: 'removed',
        currentLength: 0,
        previousLength: previousText.length,
      };
    } else if (currentNode && previousNode && currentText !== previousText) {
      changes[nodeId] = {
        status: 'modified',
        currentLength: currentText.length,
        previousLength: previousText.length,
      };
    }
  }
  return changes;
}

function buildSnapshotPreviewData(snapshotData: Record<string, unknown>): {
  dataMap: Record<string, ScriptNodeData>;
  groups: TreeGroup[];
  labels: Record<string, string>;
  defaultNodeId: string;
  touchedNodeId?: string;
  title: string;
} {
  const dataMap: Record<string, ScriptNodeData> = {};
  const labels: Record<string, string> = {};
  const groups: TreeGroup[] = [];
  const editor = toRecord(snapshotData.editor);
  const touchedNodeId = String(editor.nodeId ?? '') || undefined;
  const colors = ['#8a1c1c', '#b08d57', '#4a7c59', '#3a5a7a', '#7a5c3a', '#6a4a8a', '#8a4a6a'];

  const characters = Array.isArray(snapshotData.characters)
    ? (snapshotData.characters as Array<Record<string, unknown>>)
    : [];
  const characterScripts = Array.isArray(snapshotData.character_scripts)
    ? (snapshotData.character_scripts as Array<Record<string, unknown>>)
    : [];
  const scriptsByCharacter = new Map<string, Record<string, unknown>>();
  for (const row of characterScripts) {
    scriptsByCharacter.set(String(row.character_id), row);
  }

  const charNodeIds: string[] = [];
  for (const [index, character] of characters.entries()) {
    const characterScript = scriptsByCharacter.get(String(character.id));
    if (!characterScript) continue;
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

    const nodeId = `char-${character.id}`;
    dataMap[nodeId] = {
      type: 'character',
      id: nodeId,
      name: String(character.name ?? `角色 ${index + 1}`),
      role: `${character.is_murderer ? '凶手' : '角色'} · ${String(character.role_identity ?? '')}`,
      color: colors[index % colors.length],
      pages,
    };
    labels[nodeId] =
      `${String(character.name ?? `角色 ${index + 1}`)}${character.is_murderer ? '（凶手）' : ''}`;
    charNodeIds.push(nodeId);
  }
  if (charNodeIds.length) {
    groups.push({
      group: 'chars',
      label: '人物剧本',
      children: charNodeIds,
      count: charNodeIds.length,
    });
  }

  const organizerRows = Array.isArray(snapshotData.organizer_manuals)
    ? (snapshotData.organizer_manuals as Array<Record<string, unknown>>)
    : [];
  const organizerData = organizerRows[0];
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

  const clues = Array.isArray(snapshotData.clues)
    ? (snapshotData.clues as Array<Record<string, unknown>>)
    : [];
  if (clues.length) {
    dataMap['clues-overview'] = {
      type: 'clue-overview',
      id: 'clues-overview',
      title: '线索卡',
      actNum: `${clues.length}`,
      fullTitle: `线索卡总览 · ${clues.length}`,
      clues: clues.map((clue, index) => ({
        no: `#${String(index + 1).padStart(3, '0')}`,
        title: String(clue.title ?? `线索 ${index + 1}`),
        tag: clue.is_key_clue
          ? '关键'
          : clue.is_distractor
            ? '伪线索'
            : String(clue.clue_type ?? '线索'),
        tagType: clue.is_key_clue ? 'blood' : clue.is_distractor ? 'ok' : undefined,
        loc: String(clue.location ?? ''),
      })),
    };
    labels['clues-overview'] = '线索卡总览';
    groups.push({
      group: 'clues-overview',
      label: '线索卡',
      children: ['clues-overview'],
      count: clues.length,
    });
  }

  const truthRows = Array.isArray(snapshotData.truth_reviews)
    ? (snapshotData.truth_reviews as Array<Record<string, unknown>>)
    : [];
  const truthData = truthRows[0];
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

  if (
    !groups.length &&
    (String(editor.html ?? '').trim() || String(editor.plainText ?? '').trim())
  ) {
    dataMap['editor-saved-node'] = {
      type: 'simple',
      id: 'editor-saved-node',
      title: String(editor.title ?? '保存内容'),
      actNum: '保存',
      fullTitle: String(editor.title ?? '保存内容'),
      html: String(editor.html ?? `<p>${escapeHtml(editor.plainText)}</p>`),
    };
    labels['editor-saved-node'] = String(editor.title ?? '保存内容');
    groups.push({ group: 'saved', label: '保存内容', children: ['editor-saved-node'], count: 1 });
  }

  const defaultNodeId =
    touchedNodeId && dataMap[touchedNodeId] ? touchedNodeId : (groups[0]?.children[0] ?? '');

  return {
    dataMap,
    groups,
    labels,
    defaultNodeId,
    touchedNodeId: touchedNodeId && dataMap[touchedNodeId] ? touchedNodeId : undefined,
    title: String(editor.title ?? labels[defaultNodeId] ?? '版本快照'),
  };
}

export async function getVersionPreviewResponse(scriptId: string, versionNumber: string) {
  const parsedVersion = Number(versionNumber);

  if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient() as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from('version_snapshots')
      .select('version_number, snapshot_data, change_summary, created_at')
      .eq('script_id', scriptId)
      .eq('version_number', parsedVersion)
      .maybeSingle();

    if (error) throw new Error(`读取版本失败: ${error.message}`);
    if (!data) {
      return NextResponse.json({ error: `版本 v${parsedVersion} 不存在` }, { status: 404 });
    }

    const snapshotData = toRecord(data.snapshot_data);
    const previewData = buildSnapshotPreviewData(snapshotData);

    if (!previewData.defaultNodeId) {
      return NextResponse.json(
        { error: `版本 v${parsedVersion} 暂无可预览的快照内容` },
        { status: 409 },
      );
    }

    const { data: previousSnapshot, error: previousError } = await supabase
      .from('version_snapshots')
      .select('version_number, snapshot_data')
      .eq('script_id', scriptId)
      .lt('version_number', parsedVersion)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) throw new Error(`读取上一版本失败: ${previousError.message}`);

    const previousPreviewData = previousSnapshot
      ? buildSnapshotPreviewData(toRecord(previousSnapshot.snapshot_data))
      : null;
    const changes = previousPreviewData
      ? computeNodeChanges(previewData.dataMap, previousPreviewData.dataMap)
      : {};
    const changedNodeIds = Object.keys(changes);
    const defaultNodeId =
      changedNodeIds.find((nodeId) => previewData.dataMap[nodeId]) ?? previewData.defaultNodeId;

    const preview: EditorSnapshotPreview = {
      version: `v${data.version_number}`,
      versionNumber: Number(data.version_number),
      time: formatVersionTime(String(data.created_at)),
      note: displayNote(String(data.change_summary ?? '')),
      title: previewData.title,
      dataMap: previewData.dataMap,
      baseDataMap: previousPreviewData?.dataMap,
      baseGroups: previousPreviewData?.groups,
      baseLabels: previousPreviewData?.labels,
      groups: previewData.groups,
      labels: previewData.labels,
      defaultNodeId,
      touchedNodeId: previewData.touchedNodeId,
      compareBaseVersion: previousSnapshot ? `v${previousSnapshot.version_number}` : undefined,
      changes,
      changedNodeIds,
    };

    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取版本预览失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scriptId: string; versionNumber: string }> },
) {
  const { scriptId, versionNumber } = await params;
  return getVersionPreviewResponse(scriptId, versionNumber);
}

export async function deleteVersionResponse(scriptId: string, versionNumber: string) {
  const parsedVersion = Number(versionNumber);

  if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient() as unknown as SupabaseClient;
    const { data: latest, error: latestError } = await supabase
      .from('version_snapshots')
      .select('version_number')
      .eq('script_id', scriptId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw new Error(`读取当前版本失败: ${latestError.message}`);
    if (!latest) {
      return NextResponse.json({ error: '暂无可删除的保存记录' }, { status: 404 });
    }
    if (Number(latest.version_number) === parsedVersion) {
      return NextResponse.json(
        { error: '当前版本不能删除，请先保存或恢复到其他版本后再删除' },
        { status: 409 },
      );
    }

    const { data: target, error: targetError } = await supabase
      .from('version_snapshots')
      .select('id, version_number')
      .eq('script_id', scriptId)
      .eq('version_number', parsedVersion)
      .maybeSingle();

    if (targetError) throw new Error(`读取目标版本失败: ${targetError.message}`);
    if (!target) {
      return NextResponse.json({ error: `版本 v${parsedVersion} 不存在` }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('version_snapshots')
      .delete()
      .eq('script_id', scriptId)
      .eq('version_number', parsedVersion);

    if (deleteError) throw new Error(`删除保存记录失败: ${deleteError.message}`);

    return NextResponse.json({
      deleted: true,
      version: `v${target.version_number}`,
      versionNumber: Number(target.version_number),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除保存记录失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ scriptId: string; versionNumber: string }> },
) {
  const { scriptId, versionNumber } = await params;
  return deleteVersionResponse(scriptId, versionNumber);
}
