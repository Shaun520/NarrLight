/**
 * 插画资产管理服务
 *
 * 管理剧本插画资产生命周期：查询、筛选、状态更新、定稿保护、版本历史、批量导出。
 * 服务端使用，通过动态导入 @/lib/supabase/server 获取带会话的客户端，
 * 避免 next/headers 被打包进客户端 bundle。
 *
 * 依赖数据库表：
 *   - illustration_assets（id / script_id / type / title / sub / status / thumb /
 *     progress / locked / sort_order / current_version_id / created_at / updated_at）
 *   - illustration_versions（id / asset_id / image_url / model / seed / params /
 *     created_at）
 *
 * 注：上述表结构尚未在 lib/supabase/types.ts 中声明，本服务以行接口显式定义，
 *     待迁移脚本 003 创建表后再同步至 supabase/types.ts。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/response";
import type { Json } from "@/lib/supabase/types";

/** 插画资产类型（对齐 components/illust/asset-list.tsx AssetType） */
export type IllustrationAssetType =
  | "cover"
  | "scene"
  | "clue"
  | "public"
  | "char"
  | "poster";

/** 资产生成状态（对齐 AssetStatus） */
export type IllustrationAssetStatus = "done" | "active" | "pending";

/** illustration_assets 表行结构 */
interface IllustrationAssetRow {
  id: string;
  script_id: string;
  type: IllustrationAssetType;
  title: string;
  sub: string;
  status: IllustrationAssetStatus;
  thumb: string;
  progress: number | null;
  locked: boolean;
  sort_order: number;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/** illustration_versions 表行结构 */
interface IllustrationVersionRow {
  id: string;
  asset_id: string;
  image_url: string;
  model: string;
  seed: number;
  params: Json;
  created_at: string;
}

/** 服务层返回的插画资产结构（蛇形转驼峰） */
export interface IllustrationAssetDTO {
  id: string;
  scriptId: string;
  type: IllustrationAssetType;
  title: string;
  sub: string;
  status: IllustrationAssetStatus;
  thumb: string;
  progress: number;
  locked: boolean;
  sortOrder: number;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 版本历史条目 */
export interface IllustrationVersion {
  id: string;
  assetId: string;
  imageUrl: string;
  model: string;
  seed: number;
  params: Json;
  createdAt: string;
}

/** 批量导出结果 */
export interface BatchExportResult {
  /** 剧本 ID */
  scriptId: string;
  /** 资产类型筛选（未筛选时为 null） */
  type: IllustrationAssetType | null;
  /** 已包含的资产数量 */
  count: number;
  /** 导出清单下载 URL（Storage 路径） */
  manifestUrl: string;
  /** 已导出的资产摘要 */
  items: Array<{ id: string; title: string; type: IllustrationAssetType; imageUrl: string }>;
}

/**
 * 插画资产管理服务
 *
 * 通过 IllustrationService 单例方法操作插画资产表与版本表。
 * 所有方法均为服务端方法，依赖带会话的 Supabase 客户端。
 */
export class IllustrationService {
  /**
   * 获取剧本的全部插画资产，按 sort_order 升序返回。
   * @param scriptId 剧本 ID
   * @throws {ApiError} DB_QUERY_ERROR 当查询失败时抛出 (500)
   */
  async getAssets(scriptId: string): Promise<IllustrationAssetDTO[]> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from("illustration_assets")
      .select("*")
      .eq("script_id", scriptId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new ApiError("DB_QUERY_ERROR", `获取插画资产失败: ${error.message}`, 500);
    }
    return (data ?? []).map((row) => this.mapAssetRow(row as unknown as IllustrationAssetRow));
  }

  /**
   * 按类型筛选剧本插画资产。
   * @param scriptId 剧本 ID
   * @param type    资产类型
   * @throws {ApiError} DB_QUERY_ERROR 当查询失败时抛出 (500)
   */
  async getAssetsByType(
    scriptId: string,
    type: IllustrationAssetType,
  ): Promise<IllustrationAssetDTO[]> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from("illustration_assets")
      .select("*")
      .eq("script_id", scriptId)
      .eq("type", type)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new ApiError("DB_QUERY_ERROR", `按类型筛选插画资产失败: ${error.message}`, 500);
    }
    return (data ?? []).map((row) => this.mapAssetRow(row as unknown as IllustrationAssetRow));
  }

  /**
   * 更新资产生成状态。
   * - 当目标状态为 done 时，自动将 progress 置为 100；
   * - 当目标状态为 pending 时，自动将 progress 置为 0；
   * - 已定稿（locked=true）的资产禁止状态变更，抛出 ASSET_LOCKED (409)。
   * @param assetId 资产 ID
   * @param status  目标状态
   * @throws {ApiError} ASSET_LOCKED 当资产已定稿时抛出 (409)
   * @throws {ApiError} NOT_FOUND 当资产不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当更新失败时抛出 (500)
   */
  async updateAssetStatus(
    assetId: string,
    status: IllustrationAssetStatus,
  ): Promise<IllustrationAssetDTO> {
    const supabase = await this.getServerClient();

    const { data: current, error: curErr } = await supabase
      .from("illustration_assets")
      .select("id, locked")
      .eq("id", assetId)
      .maybeSingle();

    if (curErr) {
      throw new ApiError("DB_QUERY_ERROR", `获取资产状态失败: ${curErr.message}`, 500);
    }
    if (!current) {
      throw new ApiError("NOT_FOUND", `插画资产 ${assetId} 不存在`, 404);
    }
    if ((current as { locked: boolean }).locked) {
      throw new ApiError(
        "ASSET_LOCKED",
        "资产已定稿保护，禁止状态变更",
        409,
      );
    }

    const patch: Partial<IllustrationAssetRow> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "done") patch.progress = 100;
    if (status === "pending") patch.progress = 0;

    const { data, error } = await supabase
      .from("illustration_assets")
      .update(patch as never)
      .eq("id", assetId)
      .select("*")
      .single();

    if (error) {
      throw new ApiError("DB_UPDATE_ERROR", `更新资产状态失败: ${error.message}`, 500);
    }
    return this.mapAssetRow(data as unknown as IllustrationAssetRow);
  }

  /**
   * 锁定资产（定稿保护）。
   * 锁定后该资产 status 强制为 done、progress=100、locked=true，
   * 后续 updateAssetStatus 将拒绝变更。
   * @param assetId 资产 ID
   * @throws {ApiError} NOT_FOUND 当资产不存在时抛出 (404)
   * @throws {ApiError} DB_UPDATE_ERROR 当锁定失败时抛出 (500)
   */
  async lockAsset(assetId: string): Promise<IllustrationAssetDTO> {
    const supabase = await this.getServerClient();

    const { data: existing, error: existErr } = await supabase
      .from("illustration_assets")
      .select("id")
      .eq("id", assetId)
      .maybeSingle();

    if (existErr) {
      throw new ApiError("DB_QUERY_ERROR", `校验资产存在性失败: ${existErr.message}`, 500);
    }
    if (!existing) {
      throw new ApiError("NOT_FOUND", `插画资产 ${assetId} 不存在`, 404);
    }

    const { data, error } = await supabase
      .from("illustration_assets")
      .update({
        locked: true,
        status: "done",
        progress: 100,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", assetId)
      .select("*")
      .single();

    if (error) {
      throw new ApiError("DB_UPDATE_ERROR", `定稿保护失败: ${error.message}`, 500);
    }
    return this.mapAssetRow(data as unknown as IllustrationAssetRow);
  }

  /**
   * 获取资产版本历史（按创建时间倒序）。
   * 每次重新生成都会在 illustration_versions 表插入一条记录，
   * 用于版本回溯与对比。
   * @param assetId 资产 ID
   * @throws {ApiError} DB_QUERY_ERROR 当查询失败时抛出 (500)
   */
  async getAssetVersions(assetId: string): Promise<IllustrationVersion[]> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from("illustration_versions")
      .select("*")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ApiError("DB_QUERY_ERROR", `获取版本历史失败: ${error.message}`, 500);
    }
    return (data ?? []).map((row) =>
      this.mapVersionRow(row as unknown as IllustrationVersionRow),
    );
  }

  /**
   * 批量导出已完成的插画资产。
   * 仅导出 status='done' 的资产，生成 JSON 清单并上传至 Storage，
   * 返回清单下载 URL 与资产摘要列表。
   * @param scriptId 剧本 ID
   * @param type     可选类型筛选，未指定时导出全部已完成资产
   * @throws {ApiError} DB_QUERY_ERROR 当查询失败时抛出 (500)
   * @throws {ApiError} EXPORT_EMPTY 当无可导出资产时抛出 (409)
   */
  async batchExport(
    scriptId: string,
    type?: IllustrationAssetType,
  ): Promise<BatchExportResult> {
    const supabase = await this.getServerClient();

    let query = supabase
      .from("illustration_assets")
      .select(
        "id, type, title, current_version_id, illustration_versions(image_url)",
      )
      .eq("script_id", scriptId)
      .eq("status", "done");
    if (type) query = query.eq("type", type);

    const { data: assets, error } = await query.order("sort_order", { ascending: true });

    if (error) {
      throw new ApiError("DB_QUERY_ERROR", `批量导出查询失败: ${error.message}`, 500);
    }
    if (!assets || assets.length === 0) {
      throw new ApiError(
        "EXPORT_EMPTY",
        "无可导出的已完成插画资产",
        409,
      );
    }

    // 组装导出清单条目（关联 current_version 的 image_url）
    type ExportRow = {
      id: string;
      type: IllustrationAssetType;
      title: string;
      current_version_id: string | null;
      illustration_versions: Array<{ image_url: string }> | null;
    };
    const items: BatchExportResult["items"] = (assets as unknown as ExportRow[])
      .map((row) => {
        const version = row.illustration_versions?.[0];
        return {
          id: row.id,
          title: row.title,
          type: row.type,
          imageUrl: version?.image_url ?? "",
        };
      })
      .filter((item) => item.imageUrl);

    const manifest = {
      scriptId,
      type: type ?? null,
      exportedAt: new Date().toISOString(),
      count: items.length,
      items,
    };

    // 上传清单至 Storage（illustration-exports 桶）
    const manifestPath = `exports/${scriptId}/${Date.now()}-manifest.json`;
    const { error: uploadErr } = await supabase.storage
      .from("illustration-exports")
      .upload(manifestPath, JSON.stringify(manifest, null, 2), {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadErr) {
      throw new ApiError(
        "DB_UPDATE_ERROR",
        `上传导出清单失败: ${uploadErr.message}`,
        500,
      );
    }

    const { data: urlData } = supabase.storage
      .from("illustration-exports")
      .getPublicUrl(manifestPath);

    return {
      scriptId,
      type: type ?? null,
      count: items.length,
      manifestUrl: urlData.publicUrl,
      items,
    };
  }

  // ===== 内部工具方法 =====

  /** 动态导入服务端 Supabase Client（避免 next/headers 进入客户端 bundle） */
  private async getServerClient(): Promise<SupabaseClient> {
    const { createClient } = await import("@/lib/supabase/server");
    return createClient();
  }

  /** 将 illustration_assets 行映射为 DTO */
  private mapAssetRow(row: IllustrationAssetRow): IllustrationAssetDTO {
    return {
      id: row.id,
      scriptId: row.script_id,
      type: row.type,
      title: row.title,
      sub: row.sub,
      status: row.status,
      thumb: row.thumb,
      progress: row.progress ?? 0,
      locked: row.locked,
      sortOrder: row.sort_order,
      currentVersionId: row.current_version_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 将 illustration_versions 行映射为 DTO */
  private mapVersionRow(row: IllustrationVersionRow): IllustrationVersion {
    return {
      id: row.id,
      assetId: row.asset_id,
      imageUrl: row.image_url,
      model: row.model,
      seed: row.seed,
      params: row.params,
      createdAt: row.created_at,
    };
  }
}

/** 服务单例（无状态，可直接复用） */
export const illustrationService = new IllustrationService();
