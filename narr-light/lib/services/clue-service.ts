/**
 * 线索 CRUD / 标记 / 跨模块同步服务（T164）
 *
 * 管理线索卡完整生命周期：查询、创建、更新、删除、标记干扰项/关键线索、
 * 同步至剧本正文（FR-012 / FR-013）。
 *
 * 服务端使用，通过动态导入 @/lib/supabase/server 获取带会话的客户端，
 * 避免 next/headers 被打包进客户端 bundle。
 *
 * 依赖数据库表：
 *   - clues（id / script_id / act / phase / type / title / text / code / location /
 *     owner / is_distractor / is_key / related_characters(json) / related_truth /
 *     unlock_level / requires(json) / sort_order / synced_at / created_at / updated_at）
 *
 * 注：clues 表尚未在 lib/supabase/types.ts 中声明，本服务以行接口显式定义，
 *     待迁移脚本创建表后再同步至 supabase/types.ts。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/response';
import type { Json } from '@/lib/supabase/types';
import type {
  ClueAct,
  CluePhase,
  ClueType,
} from '@/components/clue-card/clue-card';

/** clues 表行结构（snake_case） */
interface ClueRow {
  id: string;
  script_id: string;
  act: ClueAct;
  phase: CluePhase;
  type: ClueType;
  title: string;
  text: string;
  code: string;
  location: string;
  owner: string | null;
  is_distractor: boolean;
  is_key: boolean;
  related_characters: string[] | null;
  related_truth: string | null;
  unlock_level: number | null;
  requires: string[] | null;
  sort_order: number;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 服务层返回的线索结构（蛇形转驼峰） */
export interface ClueDTO {
  id: string;
  scriptId: string;
  act: ClueAct;
  phase: CluePhase;
  type: ClueType;
  title: string;
  text: string;
  code: string;
  location: string;
  owner: string | null;
  isDistractor: boolean;
  isKey: boolean;
  relatedCharacters: string[];
  relatedTruth: string | null;
  unlockLevel: number;
  requires: string[];
  sortOrder: number;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建线索入参 */
export interface CreateClueInput {
  scriptId: string;
  act: ClueAct;
  phase: CluePhase;
  type: ClueType;
  title: string;
  text: string;
  code: string;
  location: string;
  owner?: string;
  isDistractor?: boolean;
  isKey?: boolean;
  relatedCharacters?: string[];
  relatedTruth?: string;
  unlockLevel?: number;
  requires?: string[];
  sortOrder?: number;
}

/** 更新线索补丁 */
export type UpdateCluePatch = Partial<Omit<CreateClueInput, 'scriptId'>>;

/**
 * 线索管理服务
 *
 * 通过 ClueService 单例方法操作 clues 表。
 * 所有方法均为服务端方法，依赖带会话的 Supabase 客户端。
 */
export class ClueService {
  /**
   * 获取剧本的全部线索，按 sort_order 升序返回。
   * @param scriptId 剧本 ID
   * @throws {ApiError} DB_QUERY_ERROR 当查询失败时抛出 (500)
   */
  async getClues(scriptId: string): Promise<ClueDTO[]> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from('clues')
      .select('*')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `获取线索列表失败: ${error.message}`, 500);
    }
    return (data ?? []).map((row) => this.mapRow(row as unknown as ClueRow));
  }

  /**
   * 获取单条线索。
   * @param clueId 线索 ID
   * @throws {ApiError} NOT_FOUND 当线索不存在时抛出 (404)
   * @throws {ApiError} DB_QUERY_ERROR 当查询失败时抛出 (500)
   */
  async getClue(clueId: string): Promise<ClueDTO> {
    const supabase = await this.getServerClient();
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
    return this.mapRow(data as unknown as ClueRow);
  }

  /**
   * 创建线索。
   * 校验必填字段（title / text / code / location），缺失时抛出 INVALID_CLUE (400)。
   * @param input 创建入参
   * @throws {ApiError} INVALID_CLUE 当必填字段缺失时抛出 (400)
   * @throws {ApiError} DB_UPDATE_ERROR 当写入失败时抛出 (500)
   */
  async createClue(input: CreateClueInput): Promise<ClueDTO> {
    if (!input.title?.trim() || !input.text?.trim() || !input.code?.trim() || !input.location?.trim()) {
      throw new ApiError(
        'INVALID_CLUE',
        '线索必填字段缺失（title / text / code / location）',
        400,
      );
    }
    const supabase = await this.getServerClient();
    const now = new Date().toISOString();
    const row: Partial<ClueRow> = {
      script_id: input.scriptId,
      act: input.act,
      phase: input.phase,
      type: input.type,
      title: input.title,
      text: input.text,
      code: input.code,
      location: input.location,
      owner: input.owner ?? null,
      is_distractor: input.isDistractor ?? false,
      is_key: input.isKey ?? false,
      related_characters: input.relatedCharacters ?? [],
      related_truth: input.relatedTruth ?? null,
      unlock_level: input.unlockLevel ?? 0,
      requires: input.requires ?? [],
      sort_order: input.sortOrder ?? 0,
      synced_at: null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await supabase
      .from('clues')
      .insert(row as never)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `创建线索失败: ${error.message}`, 500);
    }
    return this.mapRow(data as unknown as ClueRow);
  }

  /**
   * 更新线索。仅更新补丁中提供的字段。
   * @param clueId 线索 ID
   * @param patch  更新补丁
   * @throws {ApiError} NOT_FOUND 当线索不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当更新失败时抛出 (500)
   */
  async updateClue(clueId: string, patch: UpdateCluePatch): Promise<ClueDTO> {
    const supabase = await this.getServerClient();
    const { data: existing, error: existErr } = await supabase
      .from('clues')
      .select('id')
      .eq('id', clueId)
      .maybeSingle();
    if (existErr) {
      throw new ApiError('DB_QUERY_ERROR', `校验线索存在性失败: ${existErr.message}`, 500);
    }
    if (!existing) {
      throw new ApiError('NOT_FOUND', `线索 ${clueId} 不存在`, 404);
    }

    const update: Partial<ClueRow> & { updated_at: string } = { updated_at: new Date().toISOString() };
    if (patch.act !== undefined) update.act = patch.act;
    if (patch.phase !== undefined) update.phase = patch.phase;
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.text !== undefined) update.text = patch.text;
    if (patch.code !== undefined) update.code = patch.code;
    if (patch.location !== undefined) update.location = patch.location;
    if (patch.owner !== undefined) update.owner = patch.owner;
    if (patch.isDistractor !== undefined) update.is_distractor = patch.isDistractor;
    if (patch.isKey !== undefined) update.is_key = patch.isKey;
    if (patch.relatedCharacters !== undefined) update.related_characters = patch.relatedCharacters;
    if (patch.relatedTruth !== undefined) update.related_truth = patch.relatedTruth;
    if (patch.unlockLevel !== undefined) update.unlock_level = patch.unlockLevel;
    if (patch.requires !== undefined) update.requires = patch.requires;
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

    const { data, error } = await supabase
      .from('clues')
      .update(update as never)
      .eq('id', clueId)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `更新线索失败: ${error.message}`, 500);
    }
    return this.mapRow(data as unknown as ClueRow);
  }

  /**
   * 删除线索。删除后逻辑校验模块将不再识别该条线索。
   * @param clueId 线索 ID
   * @throws {ApiError} NOT_FOUND 当线索不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当删除失败时抛出 (500)
   */
  async deleteClue(clueId: string): Promise<void> {
    const supabase = await this.getServerClient();
    const { data: existing, error: existErr } = await supabase
      .from('clues')
      .select('id')
      .eq('id', clueId)
      .maybeSingle();
    if (existErr) {
      throw new ApiError('DB_QUERY_ERROR', `校验线索存在性失败: ${existErr.message}`, 500);
    }
    if (!existing) {
      throw new ApiError('NOT_FOUND', `线索 ${clueId} 不存在`, 404);
    }
    const { error } = await supabase.from('clues').delete().eq('id', clueId);
    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `删除线索失败: ${error.message}`, 500);
    }
  }

  /**
   * 标记干扰项（FR-013）。干扰项计入难度评估的干扰项占比。
   * @param clueId       线索 ID
   * @param isDistractor 是否为干扰项
   * @throws {ApiError} NOT_FOUND 当线索不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当更新失败时抛出 (500)
   */
  async markDistractor(clueId: string, isDistractor: boolean): Promise<ClueDTO> {
    return this.updateClue(clueId, { isDistractor });
  }

  /**
   * 标记关键线索（FR-013）。关键线索在校验、复盘关联中优先展示，
   * 不被判定为无效干扰项。
   * @param clueId 线索 ID
   * @param isKey  是否为关键线索
   * @throws {ApiError} NOT_FOUND 当线索不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当更新失败时抛出 (500)
   */
  async markKeyClue(clueId: string, isKey: boolean): Promise<ClueDTO> {
    return this.updateClue(clueId, { isKey });
  }

  /**
   * 跨模块同步到剧本（FR-012）。
   * 将线索的最新文案回写至剧本正文与复盘对应解释，标记 synced_at 时间戳。
   * 注：实际正文合并由 script-import / version 服务承载，本方法完成同步握手
   *     （置位 synced_at 并返回最新线索），触发后续版本快照。
   * @param clueId 线索 ID
   * @throws {ApiError} NOT_FOUND 当线索不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当同步失败时抛出 (500)
   */
  async syncToScript(clueId: string): Promise<ClueDTO> {
    const supabase = await this.getServerClient();
    const { data: existing, error: existErr } = await supabase
      .from('clues')
      .select('id')
      .eq('id', clueId)
      .maybeSingle();
    if (existErr) {
      throw new ApiError('DB_QUERY_ERROR', `校验线索存在性失败: ${existErr.message}`, 500);
    }
    if (!existing) {
      throw new ApiError('NOT_FOUND', `线索 ${clueId} 不存在`, 404);
    }
    const { data, error } = await supabase
      .from('clues')
      .update({ synced_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
      .eq('id', clueId)
      .select('*')
      .single();
    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `同步线索至剧本失败: ${error.message}`, 500);
    }
    return this.mapRow(data as unknown as ClueRow);
  }

  // ===== 内部工具方法 =====

  /** 动态导入服务端 Supabase Client（避免 next/headers 进入客户端 bundle） */
  private async getServerClient(): Promise<SupabaseClient> {
    const { createClient } = await import('@/lib/supabase/server');
    return createClient();
  }

  /** 将 clues 行映射为 DTO */
  private mapRow(row: ClueRow): ClueDTO {
    return {
      id: row.id,
      scriptId: row.script_id,
      act: row.act,
      phase: row.phase,
      type: row.type,
      title: row.title,
      text: row.text,
      code: row.code,
      location: row.location,
      owner: row.owner,
      isDistractor: row.is_distractor,
      isKey: row.is_key,
      relatedCharacters: row.related_characters ?? [],
      relatedTruth: row.related_truth,
      unlockLevel: row.unlock_level ?? 0,
      requires: row.requires ?? [],
      sortOrder: row.sort_order,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/** 服务单例（无状态，可直接复用） */
export const clueService = new ClueService();

/** 兼容 Json 类型导入（避免未使用告警） */
export type { Json };
