import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type IllustrationTaskType = "cover" | "scene" | "clue" | "public" | "char" | "poster";
export type IllustrationTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type IllustrationQualityStatus = "unchecked" | "passed" | "warning";

export type AdminIllustrationTaskFilters = {
  q?: string;
  status?: "all" | IllustrationTaskStatus;
  taskType?: "all" | IllustrationTaskType;
  quality?: "all" | IllustrationQualityStatus;
  model?: string;
  selectedTaskId?: string;
  page?: number;
};

export type AdminIllustrationTaskRow = {
  id: string;
  scriptId: string;
  assetId: string | null;
  marketItemId: string | null;
  taskKey: string;
  taskType: IllustrationTaskType;
  sourceType: string;
  sourceId: string;
  title: string;
  subtitle: string;
  prompt: string;
  status: IllustrationTaskStatus;
  progressPercent: number;
  sortOrder: number;
  selectedModel: string;
  selectedRatio: string;
  selectedCount: number;
  resultImageUrl: string;
  errorMessage: string;
  qualityStatus: IllustrationQualityStatus;
  qualityMessage: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  script: {
    id: string;
    title: string;
    authorId: string;
  } | null;
  author: {
    id: string;
    email: string;
    nickname: string;
    isBanned: boolean;
  } | null;
  asset: {
    id: string;
    title: string;
    status: string;
    thumb: string;
    progress: number;
  } | null;
};

export type AdminIllustrationTaskStats = {
  running: number;
  completed: number;
  unchecked: number;
  failed: number;
};

export type AdminIllustrationTaskResult = {
  tasks: AdminIllustrationTaskRow[];
  total: number;
  selectedTask: AdminIllustrationTaskRow | null;
  stats: AdminIllustrationTaskStats;
  error?: string;
};

type TaskRecord = {
  id: string;
  script_id: string;
  asset_id: string | null;
  market_item_id: string | null;
  task_key: string;
  task_type: IllustrationTaskType;
  source_type: string;
  source_id: string;
  title: string;
  subtitle: string;
  prompt: string;
  status: IllustrationTaskStatus;
  progress_percent: number;
  sort_order: number;
  selected_model: string;
  selected_ratio: string;
  selected_count: number;
  result_image_url: string;
  error_message: string;
  quality_status?: IllustrationQualityStatus;
  quality_message?: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ScriptRecord = {
  id: string;
  title: string;
  author_id: string;
};

type UserRecord = {
  id: string;
  email: string | null;
  nickname: string | null;
  is_banned: boolean | null;
};

type AssetRecord = {
  id: string;
  title: string;
  status: string;
  thumb: string;
  progress: number | null;
};

type IllustrationTaskStatsRpc = {
  running: number | null;
  completed: number | null;
  unchecked: number | null;
  failed: number | null;
};

const PAGE_SIZE = 20;
const TASK_SELECT_WITH_QUALITY =
  "id,script_id,asset_id,market_item_id,task_key,task_type,source_type,source_id,title,subtitle,prompt,status,progress_percent,sort_order,selected_model,selected_ratio,selected_count,result_image_url,error_message,quality_status,quality_message,started_at,completed_at,created_at,updated_at";
const TASK_SELECT_BASE =
  "id,script_id,asset_id,market_item_id,task_key,task_type,source_type,source_id,title,subtitle,prompt,status,progress_percent,sort_order,selected_model,selected_ratio,selected_count,result_image_url,error_message,started_at,completed_at,created_at,updated_at";

export async function getAdminIllustrationTasks(
  filters: AdminIllustrationTaskFilters,
): Promise<AdminIllustrationTaskResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    return {
      tasks: [],
      total: 0,
      selectedTask: null,
      stats: emptyStats(),
      error: "未配置 Supabase service role，无法读取真实插画任务数据。",
    };
  }

  const keyword = normalizeKeyword(filters.q);
  const matchingScriptIds = keyword ? await getMatchingScriptIds(keyword) : [];

  let { data, error, count, hasQualityColumns } = await queryTasks(
    filters,
    keyword,
    matchingScriptIds,
    true,
  );

  if (error && isMissingQualityColumnError(error.message)) {
    if (filters.quality && filters.quality !== "all") {
      return {
        tasks: [],
        total: 0,
        selectedTask: null,
        stats: emptyStats(),
        error: "当前数据库未应用插画质检迁移，无法按质检状态筛选。请应用 supabase/migrations/013_illustration_quality_and_templates.sql。",
      };
    }

    const fallback = await queryTasks(filters, keyword, matchingScriptIds, false);
    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
    hasQualityColumns = fallback.hasQualityColumns;
  }

  if (error) {
    return {
      tasks: [],
      total: 0,
      selectedTask: null,
      stats: emptyStats(),
      error: `读取插画任务失败：${error.message}`,
    };
  }

  const rows = data ?? [];
  const tasks = await hydrateTasks(rows);
  const stats = await buildStats(filters, keyword, matchingScriptIds, tasks);

  return {
    tasks,
    total: count ?? tasks.length,
    selectedTask: resolveSelectedTask(tasks, filters.selectedTaskId),
    stats,
    error: hasQualityColumns
      ? undefined
      : "当前数据库未应用插画质检迁移，质检状态已临时按“未检查”展示。",
  };
}

async function queryTasks(
  filters: AdminIllustrationTaskFilters,
  keyword: string,
  matchingScriptIds: string[],
  includeQualityColumns: boolean,
) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return {
      data: null,
      error: { message: "未配置 Supabase service role。" },
      count: 0,
      hasQualityColumns: includeQualityColumns,
    };
  }

  const page = Math.max(1, filters.page ?? 1);
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let query = supabase
    .from("illustration_tasks")
    .select(includeQualityColumns ? TASK_SELECT_WITH_QUALITY : TASK_SELECT_BASE, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.taskType && filters.taskType !== "all") {
    query = query.eq("task_type", filters.taskType);
  }

  if (includeQualityColumns && filters.quality && filters.quality !== "all") {
    query = query.eq("quality_status", filters.quality);
  }

  if (filters.model && filters.model !== "all") {
    query = query.eq("selected_model", filters.model);
  }

  if (keyword) {
    const clauses = [
      `title.ilike.%${escapePostgrestValue(keyword)}%`,
      `task_key.ilike.%${escapePostgrestValue(keyword)}%`,
      `selected_model.ilike.%${escapePostgrestValue(keyword)}%`,
    ];
    if (isUuid(keyword)) {
      clauses.push(`id.eq.${keyword}`, `asset_id.eq.${keyword}`);
    }
    if (matchingScriptIds.length > 0) {
      clauses.push(`script_id.in.(${matchingScriptIds.join(",")})`);
    }
    query = query.or(clauses.join(","));
  }

  const { data, error, count } = await query.returns<TaskRecord[]>();

  return {
    data,
    error,
    count,
    hasQualityColumns: includeQualityColumns,
  };
}

async function hydrateTasks(rows: TaskRecord[]): Promise<AdminIllustrationTaskRow[]> {
  const scriptIds = [...new Set(rows.map((task) => task.script_id))];
  const assetIds = rows.map((task) => task.asset_id).filter((id): id is string => Boolean(id));
  const [scripts, assets] = await Promise.all([getScriptMap(scriptIds), getAssetMap(assetIds)]);
  const authorIds = [...new Set([...scripts.values()].map((script) => script.author_id))];
  const authors = await getAuthorMap(authorIds);

  return rows.map((row) => {
    const script = scripts.get(row.script_id) ?? null;
    const author = script ? authors.get(script.author_id) ?? null : null;
    const asset = row.asset_id ? assets.get(row.asset_id) ?? null : null;

    return {
      id: row.id,
      scriptId: row.script_id,
      assetId: row.asset_id,
      marketItemId: row.market_item_id,
      taskKey: row.task_key,
      taskType: row.task_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      subtitle: row.subtitle,
      prompt: row.prompt,
      status: row.status,
      progressPercent: row.progress_percent,
      sortOrder: row.sort_order,
      selectedModel: row.selected_model,
      selectedRatio: row.selected_ratio,
      selectedCount: row.selected_count,
      resultImageUrl: row.result_image_url,
      errorMessage: row.error_message,
      qualityStatus: row.quality_status ?? "unchecked",
      qualityMessage: row.quality_message ?? "",
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      script: script
        ? {
            id: script.id,
            title: script.title,
            authorId: script.author_id,
          }
        : null,
      author,
      asset: asset
        ? {
            id: asset.id,
            title: asset.title,
            status: asset.status,
            thumb: asset.thumb,
            progress: asset.progress ?? 0,
          }
        : null,
    };
  });
}

async function getScriptMap(scriptIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || scriptIds.length === 0) {
    return new Map<string, ScriptRecord>();
  }

  const { data } = await supabase
    .from("scripts")
    .select("id,title,author_id")
    .in("id", scriptIds)
    .returns<ScriptRecord[]>();

  return new Map((data ?? []).map((script) => [script.id, script]));
}

async function getAuthorMap(authorIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || authorIds.length === 0) {
    return new Map<string, AdminIllustrationTaskRow["author"]>();
  }

  const { data } = await supabase
    .from("users")
    .select("id,email,nickname,is_banned")
    .in("id", authorIds)
    .returns<UserRecord[]>();

  return new Map(
    (data ?? []).map((user) => [
      user.id,
      {
        id: user.id,
        email: user.email ?? "",
        nickname: user.nickname || "未设置昵称",
        isBanned: user.is_banned ?? false,
      },
    ]),
  );
}

async function getAssetMap(assetIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || assetIds.length === 0) {
    return new Map<string, AssetRecord>();
  }

  const { data } = await supabase
    .from("illustration_assets")
    .select("id,title,status,thumb,progress")
    .in("id", assetIds)
    .returns<AssetRecord[]>();

  return new Map((data ?? []).map((asset) => [asset.id, asset]));
}

async function getMatchingScriptIds(keyword: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return [];
  }

  if (isUuid(keyword)) {
    return [keyword];
  }

  const like = `%${keyword}%`;
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .or(`email.ilike.${like},nickname.ilike.${like}`)
    .limit(100)
    .returns<Array<{ id: string }>>();

  let query = supabase.from("scripts").select("id").ilike("title", like).limit(100);
  const authorIds = (users ?? []).map((user) => user.id);
  if (authorIds.length > 0) {
    query = supabase
      .from("scripts")
      .select("id")
      .or(`title.ilike.${like},author_id.in.(${authorIds.join(",")})`)
      .limit(100);
  }

  const { data: scripts } = await query.returns<Array<{ id: string }>>();
  return (scripts ?? []).map((script) => script.id);
}

function resolveSelectedTask(tasks: AdminIllustrationTaskRow[], selectedTaskId?: string) {
  if (!selectedTaskId) {
    return null;
  }

  return tasks.find((task) => task.id === selectedTaskId) ?? null;
}

async function buildStats(
  filters: AdminIllustrationTaskFilters,
  keyword: string,
  matchingScriptIds: string[],
  currentPageTasks: AdminIllustrationTaskRow[],
): Promise<AdminIllustrationTaskStats> {
  // 优先调用 RPC admin_get_illustration_task_stats 一次 SQL 聚合返回 4 个指标，
  // 替代原来 composeStats 基于当前页 20 条 reduce 的方案（统计值不准确）。
  // RPC 缺失（migration 024 未应用）时回退到当前页 reduce，保证向前兼容。
  const supabase = createAdminSupabaseClient();
  if (!supabase) return composeStats(currentPageTasks);

  const rpcParams = {
    p_task_type: filters.taskType && filters.taskType !== "all" ? filters.taskType : null,
    p_quality_status: filters.quality && filters.quality !== "all" ? filters.quality : null,
    p_selected_model: filters.model && filters.model !== "all" ? filters.model : null,
    p_q: keyword || null,
    p_matched_script_ids: matchingScriptIds.length > 0 ? matchingScriptIds : null,
  };

  const { data: rpcData, error: rpcError } = await supabase
    .rpc("admin_get_illustration_task_stats", rpcParams)
    .maybeSingle();

  if (!rpcError && rpcData) {
    const stats = rpcData as unknown as IllustrationTaskStatsRpc;
    return {
      running: Number(stats.running ?? 0),
      completed: Number(stats.completed ?? 0),
      unchecked: Number(stats.unchecked ?? 0),
      failed: Number(stats.failed ?? 0),
    };
  }

  if (rpcError) {
    console.warn(
      `[illustration-tasks] RPC admin_get_illustration_task_stats 失败，回退到当前页 reduce：${rpcError.message}。请应用 supabase/migrations/024_admin_task_stats_rpc.sql。`,
    );
  }

  return composeStats(currentPageTasks);
}

function composeStats(tasks: AdminIllustrationTaskRow[]): AdminIllustrationTaskStats {
  return tasks.reduce(
    (stats, task) => {
      if (task.status === "running" || task.status === "pending") stats.running += 1;
      if (task.status === "completed") stats.completed += 1;
      if (task.qualityStatus === "unchecked") stats.unchecked += 1;
      if (task.status === "failed") stats.failed += 1;
      return stats;
    },
    emptyStats(),
  );
}

function emptyStats(): AdminIllustrationTaskStats {
  return {
    running: 0,
    completed: 0,
    unchecked: 0,
    failed: 0,
  };
}

function normalizeKeyword(value?: string) {
  return value?.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").slice(0, 120) ?? "";
}

function escapePostgrestValue(value: string) {
  return value.replace(/[%_*]/g, "\\$&");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingQualityColumnError(message: string) {
  return message.includes("illustration_tasks.quality_status") || message.includes("illustration_tasks.quality_message");
}
