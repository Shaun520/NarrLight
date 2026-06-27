/**
 * 剧本元信息 CRUD 与状态管理服务
 *
 * 管理 scripts 表的完整生命周期：
 *   draft → generating → completed → archived
 *
 * 字段在 DB 为 snake_case，对外的 Script 接口为 camelCase，由 mapRow 做映射。
 * 服务端使用，依赖 @/lib/supabase/server 创建带会话的客户端。
 */
import { createClient } from '@/lib/supabase/server';
import type {
  Script,
  ScriptDifficulty,
  ScriptGenre,
  ScriptStatus,
} from '@/types';

/** scripts 表原始行（snake_case） */
interface ScriptRow {
  id: string;
  author_id: string;
  title: string;
  description: string;
  genre: ScriptGenre;
  player_count: number;
  duration_hours: number;
  difficulty: ScriptDifficulty;
  background_setting: string;
  core_theme: string;
  status: ScriptStatus;
  word_count: number;
  created_at: string;
  updated_at: string;
}

/** 创建剧本入参 */
export interface CreateScriptInput {
  title: string;
  genre: ScriptGenre;
  playerCount?: number;
  durationHours?: number;
  difficulty?: ScriptDifficulty;
  backgroundSetting?: string;
  coreTheme?: string;
  description?: string;
}

/** 更新剧本补丁 */
export type UpdateScriptPatch = Partial<CreateScriptInput>;

/** 合法的状态转换映射 */
const ALLOWED_STATUS_TRANSITIONS: Record<ScriptStatus, ScriptStatus[]> = {
  draft: ['generating', 'archived'],
  generating: ['completed', 'draft'],
  completed: ['archived', 'draft'],
  archived: ['draft'],
};

export class ScriptService {
  /**
   * 创建剧本（status=draft）。
   * @param authorId 作者用户 ID
   * @param data     剧本基础信息
   */
  async createScript(authorId: string, data: CreateScriptInput): Promise<Script> {
    const supabase = await createClient();
    const id = crypto.randomUUID();

    const { data: row, error } = await supabase
      .from('scripts')
      .insert({
        id,
        author_id: authorId,
        title: data.title,
        description: data.description ?? '',
        genre: data.genre,
        player_count: data.playerCount ?? 6,
        duration_hours: data.durationHours ?? 4,
        difficulty: data.difficulty ?? 'intermediate',
        background_setting: data.backgroundSetting ?? '',
        core_theme: data.coreTheme ?? '',
        status: 'draft',
        word_count: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`创建剧本失败: ${error.message}`);
    return this.mapRow(row as unknown as ScriptRow);
  }

  /**
   * 获取用户剧本列表（按 updated_at 倒序）。
   * @param authorId 作者用户 ID
   */
  async getScripts(authorId: string): Promise<Script[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('author_id', authorId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`获取剧本列表失败: ${error.message}`);
    return (data ?? []).map((row) => this.mapRow(row as unknown as ScriptRow));
  }

  /**
   * 获取单个剧本。
   * @param scriptId 剧本 ID
   */
  async getScript(scriptId: string): Promise<Script | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .maybeSingle();

    if (error) throw new Error(`获取剧本失败: ${error.message}`);
    return data ? this.mapRow(data as unknown as ScriptRow) : null;
  }

  /**
   * 更新剧本字段。
   * @param scriptId 剧本 ID
   * @param patch    更新补丁
   */
  async updateScript(scriptId: string, patch: UpdateScriptPatch): Promise<Script> {
    const supabase = await createClient();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.genre !== undefined) update.genre = patch.genre;
    if (patch.playerCount !== undefined) update.player_count = patch.playerCount;
    if (patch.durationHours !== undefined) update.duration_hours = patch.durationHours;
    if (patch.difficulty !== undefined) update.difficulty = patch.difficulty;
    if (patch.backgroundSetting !== undefined) update.background_setting = patch.backgroundSetting;
    if (patch.coreTheme !== undefined) update.core_theme = patch.coreTheme;

    const { data, error } = await supabase
      .from('scripts')
      .update(update)
      .eq('id', scriptId)
      .select()
      .single();

    if (error) throw new Error(`更新剧本失败: ${error.message}`);
    return this.mapRow(data as unknown as ScriptRow);
  }

  /**
   * 删除剧本（关联实体由 DB ON DELETE CASCADE 级联清理）。
   * @param scriptId 剧本 ID
   */
  async deleteScript(scriptId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('scripts').delete().eq('id', scriptId);
    if (error) throw new Error(`删除剧本失败: ${error.message}`);
  }

  /**
   * 状态转换：draft→generating→completed→archived。
   * 转换合法性由 assertStatusTransition 校验。
   * @param scriptId 剧本 ID
   * @param status   目标状态
   */
  async updateStatus(scriptId: string, status: ScriptStatus): Promise<Script> {
    const supabase = await createClient();

    const { data: current, error: curErr } = await supabase
      .from('scripts')
      .select('status')
      .eq('id', scriptId)
      .maybeSingle();
    if (curErr) throw new Error(`获取剧本状态失败: ${curErr.message}`);
    if (!current) throw new Error(`剧本 ${scriptId} 不存在`);

    const from = (current as { status: ScriptStatus }).status;
    this.assertStatusTransition(from, status);

    const { data, error } = await supabase
      .from('scripts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', scriptId)
      .select()
      .single();

    if (error) throw new Error(`状态转换失败 (${from} → ${status}): ${error.message}`);
    return this.mapRow(data as unknown as ScriptRow);
  }

  /**
   * 更新字数。
   * @param scriptId 剧本 ID
   * @param count    字数
   */
  async updateWordCount(scriptId: string, count: number): Promise<Script> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('scripts')
      .update({
        word_count: Math.max(0, Math.floor(count)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', scriptId)
      .select()
      .single();

    if (error) throw new Error(`更新字数失败: ${error.message}`);
    return this.mapRow(data as unknown as ScriptRow);
  }

  /** 校验状态转换合法性 */
  private assertStatusTransition(current: ScriptStatus, target: ScriptStatus): void {
    const allowed = ALLOWED_STATUS_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(`非法剧本状态转换: ${current} → ${target}`);
    }
  }

  /** 将数据库行映射为 Script（snake_case → camelCase） */
  private mapRow(row: ScriptRow): Script {
    return {
      id: row.id,
      authorId: row.author_id,
      title: row.title,
      description: row.description,
      genre: row.genre,
      playerCount: row.player_count,
      durationHours: row.duration_hours,
      difficulty: row.difficulty,
      backgroundSetting: row.background_setting,
      coreTheme: row.core_theme,
      status: row.status,
      wordCount: row.word_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
