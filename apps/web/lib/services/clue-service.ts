/**
 * 线索 CRUD / 标记服务。
 *
 * 这里以当前 Supabase `clues` 表为准：
 * title / content / clue_type / search_round / related_character_ids /
 * is_distractor / is_key_clue / unlock_condition / sort_order。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/response';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/types';
import {
  ACT_LABELS,
  CLUE_TYPE_LABELS,
  PHASE_LABELS,
  toChineseOrdinal,
  type Clue,
  type ClueAct,
  type CluePhase,
  type ClueType,
} from '@/components/clue-card/clue-card';

type ClueRow = Database['public']['Tables']['clues']['Row'];
type ClueInsert = Database['public']['Tables']['clues']['Insert'];
type ClueUpdate = Database['public']['Tables']['clues']['Update'];

interface CharacterRow {
  id: string;
  name: string;
}

export interface ClueDTO extends Clue {
  scriptId: string;
  searchRound: number;
  unlockCondition: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClueActTabDTO {
  act: ClueAct | 'all';
  label: string;
}

export interface CreateClueInput {
  scriptId: string;
  type: ClueType;
  title: string;
  text: string;
  location: string;
  searchRound?: number;
  relatedCharacterIds?: string[];
  isDistractor?: boolean;
  isKey?: boolean;
  unlockCondition?: string;
  sortOrder?: number;
}

export type UpdateCluePatch = Partial<Omit<CreateClueInput, 'scriptId'>>;

function toAct(searchRound: number | null): ClueAct {
  if (!searchRound || searchRound < 1) return 'truth';
  return `act${searchRound}`;
}

function toSearchRound(act?: ClueAct): number | undefined {
  if (!act) return undefined;
  if (act === 'act1') return 1;
  if (act === 'act2') return 2;
  if (act === 'act3') return 3;
  return 4;
}

function toPhase(row: Pick<ClueRow, 'is_key_clue' | 'is_distractor'>): CluePhase {
  if (row.is_key_clue) return 'key';
  if (row.is_distractor) return 'trap';
  return 'public';
}

function buildActLabel(sortOrder: number): string {
  const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (sortOrder <= 10) {
    return `第${chinese[sortOrder] ?? sortOrder}幕`;
  }
  return `第${sortOrder}幕`;
}

function buildTag(phase: CluePhase, act: ClueAct, owner?: string): string {
  if (phase === 'key') return PHASE_LABELS.key;
  if (phase === 'trap') return PHASE_LABELS.trap;
  if (phase === 'private' && owner) return `${owner}私有`;
  const actLabel = ACT_LABELS[act] ?? `第${act.replace('act', '')}幕`;
  return `${PHASE_LABELS.public} · ${actLabel.split(' · ')[0]}`;
}

function buildCode(row: Pick<ClueRow, 'sort_order' | 'is_key_clue'>): string {
  const prefix = row.is_key_clue ? 'K' : 'C';
  return `#${prefix}-${String((row.sort_order ?? 0) + 1).padStart(2, '0')}`;
}

function parseRequires(unlockCondition: string): string[] {
  return Array.from(unlockCondition.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi))
    .map((match) => match[0]);
}

/**
 * 线索管理服务。
 */
export class ClueService {
  async getActTabs(scriptId: string): Promise<ClueActTabDTO[]> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('acts')
      .select('title, sort_order')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `获取幕次列表失败: ${error.message}`, 500);
    }

    const actTabs = (data ?? []).map((act) => ({
      act: `act${act.sort_order}` as ClueAct,
      label: buildActLabel(act.sort_order),
    }));

    return [
      { act: 'all', label: '全部' },
      ...actTabs,
      { act: 'truth', label: '真相复盘' },
    ];
  }

  async getClues(scriptId: string): Promise<ClueDTO[]> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('clues')
      .select('*')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `获取线索列表失败: ${error.message}`, 500);
    }

    const characterNameById = await this.getCharacterNameMap(
      supabase,
      scriptId,
      data ?? [],
    );

    return (data ?? []).map((row, index) => this.mapRow(row, index, characterNameById));
  }

  async getClue(clueId: string): Promise<ClueDTO> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('clues')
      .select('*')
      .eq('id', clueId)
      .maybeSingle();

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `获取线索失败: ${error.message}`, 500);
    }
    if (!data) {
      throw new ApiError('NOT_FOUND', `线索 ${clueId} 不存在`, 404);
    }

    const row = data as unknown as ClueRow;
    const characterNameById = await this.getCharacterNameMap(supabase, row.script_id, [row]);
    return this.mapRow(row, row.sort_order ?? 0, characterNameById);
  }

  async createClue(input: CreateClueInput): Promise<ClueDTO> {
    if (!input.title?.trim() || !input.text?.trim()) {
      throw new ApiError('INVALID_CLUE', '线索标题和正文不能为空', 400);
    }

    const supabase = this.getAdminClient();
    const row: ClueInsert = {
      script_id: input.scriptId,
      title: input.title.trim(),
      content: input.text.trim(),
      clue_type: input.type,
      search_round: input.searchRound ?? 1,
      location: input.location?.trim() ?? '',
      related_character_ids: input.relatedCharacterIds ?? [],
      is_distractor: input.isDistractor ?? false,
      is_key_clue: input.isKey ?? false,
      unlock_condition: input.unlockCondition ?? '',
      sort_order: input.sortOrder ?? 0,
    };

    const { data, error } = await supabase
      .from('clues')
      .insert(row as never)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `创建线索失败: ${error.message}`, 500);
    }

    const created = data as unknown as ClueRow;
    const characterNameById = await this.getCharacterNameMap(supabase, input.scriptId, [created]);
    return this.mapRow(created, created.sort_order ?? 0, characterNameById);
  }

  async updateClue(clueId: string, patch: UpdateCluePatch & { act?: ClueAct; phase?: CluePhase }): Promise<ClueDTO> {
    const supabase = this.getAdminClient();
    const update: ClueUpdate = {};

    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.text !== undefined) update.content = patch.text.trim();
    if (patch.type !== undefined) update.clue_type = patch.type;
    if (patch.location !== undefined) update.location = patch.location.trim();
    if (patch.searchRound !== undefined) update.search_round = patch.searchRound;
    if (patch.act !== undefined) update.search_round = toSearchRound(patch.act);
    if (patch.relatedCharacterIds !== undefined) update.related_character_ids = patch.relatedCharacterIds;
    if (patch.isDistractor !== undefined) update.is_distractor = patch.isDistractor;
    if (patch.isKey !== undefined) update.is_key_clue = patch.isKey;
    if (patch.unlockCondition !== undefined) update.unlock_condition = patch.unlockCondition;
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

    if (patch.phase === 'key') {
      update.is_key_clue = true;
      update.is_distractor = false;
    } else if (patch.phase === 'trap') {
      update.is_distractor = true;
      update.is_key_clue = false;
    } else if (patch.phase === 'public' || patch.phase === 'private') {
      update.is_key_clue = false;
      update.is_distractor = false;
    }

    const { data, error } = await supabase
      .from('clues')
      .update(update as never)
      .eq('id', clueId)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `更新线索失败: ${error.message}`, 500);
    }

    const updated = data as unknown as ClueRow;
    const characterNameById = await this.getCharacterNameMap(supabase, updated.script_id, [updated]);
    return this.mapRow(updated, updated.sort_order ?? 0, characterNameById);
  }

  async deleteClue(clueId: string): Promise<void> {
    const supabase = this.getAdminClient();
    const { error } = await supabase.from('clues').delete().eq('id', clueId);
    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `删除线索失败: ${error.message}`, 500);
    }
  }

  async markDistractor(clueId: string, isDistractor: boolean): Promise<ClueDTO> {
    return this.updateClue(clueId, {
      isDistractor,
      isKey: isDistractor ? false : undefined,
    });
  }

  async markKeyClue(clueId: string, isKey: boolean): Promise<ClueDTO> {
    return this.updateClue(clueId, {
      isKey,
      isDistractor: isKey ? false : undefined,
    });
  }

  private getAdminClient(): SupabaseClient {
    return createAdminClient() as unknown as SupabaseClient;
  }

  private async getCharacterNameMap(
    supabase: SupabaseClient,
    scriptId: string,
    clueRows: ClueRow[],
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set(clueRows.flatMap((row) => row.related_character_ids ?? [])));
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
      .from('characters')
      .select('id, name')
      .eq('script_id', scriptId)
      .in('id', ids);

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `获取线索关联人物失败: ${error.message}`, 500);
    }

    return new Map(((data ?? []) as CharacterRow[]).map((character) => [character.id, character.name]));
  }

  private mapRow(
    row: ClueRow,
    index: number,
    characterNameById: Map<string, string>,
  ): ClueDTO {
    const act = toAct(row.search_round);
    const phase = toPhase(row);
    const relatedCharacters = (row.related_character_ids ?? [])
      .map((id) => characterNameById.get(id))
      .filter((name): name is string => Boolean(name));
    const owner = phase === 'private' ? relatedCharacters[0] : undefined;

    return {
      id: row.id,
      scriptId: row.script_id,
      act,
      phase,
      type: row.clue_type,
      corner: toChineseOrdinal(index + 1),
      tag: buildTag(phase, act, owner),
      title: row.title,
      text: row.content,
      code: buildCode(row),
      location: row.location || '未标注',
      owner,
      isDistractor: row.is_distractor,
      isKey: row.is_key_clue,
      relatedCharacters,
      relatedTruth: undefined,
      unlockLevel: row.unlock_condition ? 1 : 0,
      requires: parseRequires(row.unlock_condition ?? ''),
      searchRound: row.search_round ?? 1,
      unlockCondition: row.unlock_condition ?? '',
      sortOrder: row.sort_order ?? index,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const clueService = new ClueService();

export type { Clue };
export { CLUE_TYPE_LABELS };
