/**
 * 版本快照存储与回滚服务
 *
 * 负责 version_snapshots 表的写入、查询、回滚与版本对比。
 * 回滚操作会以快照数据覆盖当前剧本关联实体，并生成新的版本记录（标记为 ROLLBACK）。
 *
 * 注意：version_snapshots 表无 operation_type 列，operationType 存储于
 * snapshot_data JSON 内部（key: operationType），读取时由 mapRow 提取。
 */
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import type { OperationType, VersionDiffResult, VersionSnapshot } from '@/types';

interface VersionSnapshotRow {
  id: string;
  script_id: string;
  version_number: number;
  snapshot_data: Json;
  change_summary: string;
  created_by: string | null;
  created_at: string;
}

/** 快照数据内部结构：包含操作类型与剧本关联实体负载 */
interface SnapshotPayload {
  operationType: OperationType;
  script?: Record<string, unknown>;
  characters?: unknown[];
  acts?: unknown[];
  scenes?: unknown[];
  clues?: unknown[];
  character_relations?: unknown[];
  timeline_events?: unknown[];
  [key: string]: unknown;
}

/** scripts 表可写字段（回滚时仅覆盖这些字段，避免破坏 id/author_id/created_at） */
const SCRIPT_WRITABLE_FIELDS = [
  'title',
  'description',
  'genre',
  'player_count',
  'duration_hours',
  'difficulty',
  'background_setting',
  'core_theme',
  'status',
  'word_count',
] as const;

export class VersionService {
  /**
   * 创建版本快照
   * @param scriptId       剧本 ID
   * @param changeSummary  变更摘要
   * @param operationType  操作类型
   * @param snapshotData   剧本关联实体快照数据
   * @returns 新创建的版本快照
   */
  async createSnapshot(
    scriptId: string,
    changeSummary: string,
    operationType: OperationType,
    snapshotData: Record<string, unknown>,
  ): Promise<VersionSnapshot> {
    const supabase = await createClient();

    // version_number 自增：取当前最大版本号 + 1
    const { data: latest, error: maxErr } = await supabase
      .from('version_snapshots')
      .select('version_number')
      .eq('script_id', scriptId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw new Error(`获取版本号失败: ${maxErr.message}`);
    const nextVersion = (latest?.version_number ?? 0) + 1;

    const payload: SnapshotPayload = { operationType, ...snapshotData };
    const { data: authUser } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('version_snapshots')
      .insert({
        script_id: scriptId,
        version_number: nextVersion,
        snapshot_data: payload as unknown as Json,
        change_summary: changeSummary,
        created_by: authUser.user?.id ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`创建版本快照失败: ${error.message}`);
    return this.mapRow(data as unknown as VersionSnapshotRow);
  }

  /**
   * 获取剧本的版本快照列表（按版本号倒序）
   */
  async getSnapshots(scriptId: string): Promise<VersionSnapshot[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('version_snapshots')
      .select('*')
      .eq('script_id', scriptId)
      .order('version_number', { ascending: false });

    if (error) throw new Error(`获取版本列表失败: ${error.message}`);
    return (data ?? []).map((row) => this.mapRow(row as unknown as VersionSnapshotRow));
  }

  /**
   * 获取单个版本快照
   */
  async getSnapshot(snapshotId: string): Promise<VersionSnapshot | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('version_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .maybeSingle();

    if (error) throw new Error(`获取版本快照失败: ${error.message}`);
    return data ? this.mapRow(data as unknown as VersionSnapshotRow) : null;
  }

  /**
   * 回滚到指定版本
   * 1. 获取目标版本快照数据
   * 2. 用快照数据覆盖当前剧本关联实体
   * 3. 创建新版本记录（标记为 ROLLBACK 操作）
   * @returns 新创建的回滚版本快照
   */
  async rollback(scriptId: string, versionNumber: number): Promise<VersionSnapshot> {
    const supabase = await createClient();

    // 1. 获取目标版本快照
    const { data: target, error: targetErr } = await supabase
      .from('version_snapshots')
      .select('*')
      .eq('script_id', scriptId)
      .eq('version_number', versionNumber)
      .maybeSingle();

    if (targetErr) throw new Error(`获取目标版本失败: ${targetErr.message}`);
    if (!target) throw new Error(`版本 ${versionNumber} 不存在`);

    const payload = (target.snapshot_data ?? {}) as SnapshotPayload;

    // 2. 用快照数据覆盖当前剧本关联实体
    await this.applySnapshot(scriptId, payload);

    // 3. 创建新版本记录（标记为回滚操作）
    return this.createSnapshot(
      scriptId,
      `回滚到版本 ${versionNumber}`,
      'ROLLBACK',
      payload as unknown as Record<string, unknown>,
    );
  }

  /**
   * 对比两个版本
   * @returns { added, removed, modified }
   */
  async diff(
    scriptId: string,
    versionA: number,
    versionB: number,
  ): Promise<VersionDiffResult> {
    const supabase = await createClient();

    const [aRes, bRes] = await Promise.all([
      supabase
        .from('version_snapshots')
        .select('*')
        .eq('script_id', scriptId)
        .eq('version_number', versionA)
        .maybeSingle(),
      supabase
        .from('version_snapshots')
        .select('*')
        .eq('script_id', scriptId)
        .eq('version_number', versionB)
        .maybeSingle(),
    ]);

    if (aRes.error) throw new Error(`获取版本 ${versionA} 失败: ${aRes.error.message}`);
    if (bRes.error) throw new Error(`获取版本 ${versionB} 失败: ${bRes.error.message}`);
    if (!aRes.data) throw new Error(`版本 ${versionA} 不存在`);
    if (!bRes.data) throw new Error(`版本 ${versionB} 不存在`);

    return this.computeDiff(
      (aRes.data.snapshot_data ?? {}) as Record<string, unknown>,
      (bRes.data.snapshot_data ?? {}) as Record<string, unknown>,
    );
  }

  /**
   * 将快照数据写回剧本关联实体（先删后插，覆盖式恢复）
   * 顺序：script → characters → acts（级联 scenes）→ scenes → clues → relations → timeline
   */
  private async applySnapshot(scriptId: string, payload: SnapshotPayload): Promise<void> {
    const supabase = await createClient();

    // 1. 覆盖剧本主表（仅更新可写字段）
    if (payload.script && typeof payload.script === 'object') {
      const script = payload.script as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      for (const key of SCRIPT_WRITABLE_FIELDS) {
        if (key in script) update[key] = script[key];
      }
      if (Object.keys(update).length > 0) {
        const { error } = await supabase.from('scripts').update(update).eq('id', scriptId);
        if (error) throw new Error(`覆盖剧本失败: ${error.message}`);
      }
    }

    // 2. 覆盖 characters
    if (Array.isArray(payload.characters)) {
      await supabase.from('characters').delete().eq('script_id', scriptId);
      if (payload.characters.length > 0) {
        const rows = payload.characters.map((c) => ({
          ...(c as Record<string, unknown>),
          script_id: scriptId,
        }));
        const { error } = await supabase.from('characters').insert(rows);
        if (error) throw new Error(`覆盖人物失败: ${error.message}`);
      }
    }

    // 3. 覆盖 acts（ON DELETE CASCADE 会级联删除关联 scenes）
    if (Array.isArray(payload.acts)) {
      await supabase.from('acts').delete().eq('script_id', scriptId);
      if (payload.acts.length > 0) {
        const rows = payload.acts.map((a) => ({
          ...(a as Record<string, unknown>),
          script_id: scriptId,
        }));
        const { error } = await supabase.from('acts').insert(rows);
        if (error) throw new Error(`覆盖幕次失败: ${error.message}`);
      }

      // 4. 覆盖 scenes（依赖 acts 已重新插入，保留原 act_id 引用）
      if (Array.isArray(payload.scenes) && payload.scenes.length > 0) {
        const { error } = await supabase.from('scenes').insert(payload.scenes);
        if (error) throw new Error(`覆盖场景失败: ${error.message}`);
      }
    }

    // 5. 覆盖 clues
    if (Array.isArray(payload.clues)) {
      await supabase.from('clues').delete().eq('script_id', scriptId);
      if (payload.clues.length > 0) {
        const rows = payload.clues.map((c) => ({
          ...(c as Record<string, unknown>),
          script_id: scriptId,
        }));
        const { error } = await supabase.from('clues').insert(rows);
        if (error) throw new Error(`覆盖线索失败: ${error.message}`);
      }
    }

    // 6. 覆盖 character_relations
    if (Array.isArray(payload.character_relations)) {
      await supabase.from('character_relations').delete().eq('script_id', scriptId);
      if (payload.character_relations.length > 0) {
        const rows = payload.character_relations.map((r) => ({
          ...(r as Record<string, unknown>),
          script_id: scriptId,
        }));
        const { error } = await supabase.from('character_relations').insert(rows);
        if (error) throw new Error(`覆盖人物关系失败: ${error.message}`);
      }
    }

    // 7. 覆盖 timeline_events
    if (Array.isArray(payload.timeline_events)) {
      await supabase.from('timeline_events').delete().eq('script_id', scriptId);
      if (payload.timeline_events.length > 0) {
        const rows = payload.timeline_events.map((e) => ({
          ...(e as Record<string, unknown>),
          script_id: scriptId,
        }));
        const { error } = await supabase.from('timeline_events').insert(rows);
        if (error) throw new Error(`覆盖时间线失败: ${error.message}`);
      }
    }
  }

  /** 计算两个快照数据的顶层字段差异 */
  private computeDiff(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): VersionDiffResult {
    const result: VersionDiffResult = { added: [], removed: [], modified: [] };
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

    for (const key of keys) {
      const inA = key in a;
      const inB = key in b;

      if (inA && !inB) {
        result.removed.push(key);
      } else if (!inA && inB) {
        result.added.push(key);
      } else {
        const strA = JSON.stringify(a[key]) ?? '';
        const strB = JSON.stringify(b[key]) ?? '';
        if (strA !== strB) {
          result.modified.push({ field: key, old: strA, new: strB });
        }
      }
    }

    return result;
  }

  /** 将数据库行映射为 VersionSnapshot（从 snapshot_data 提取 operationType） */
  private mapRow(row: VersionSnapshotRow): VersionSnapshot {
    const payload = (row.snapshot_data ?? {}) as Record<string, unknown>;
    const operationType = (payload.operationType as OperationType) ?? 'GENERATE';
    return {
      id: row.id,
      scriptId: row.script_id,
      versionNumber: row.version_number,
      snapshotData: row.snapshot_data,
      changeSummary: row.change_summary,
      operationType,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }
}
