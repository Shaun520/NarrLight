import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type GenerationTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type GenerationTaskQualityStatus = "unchecked" | "passed" | "failed" | "disputed" | "refunded";

export type AdminGenerationTaskFilters = {
  q?: string;
  status?: "all" | GenerationTaskStatus;
  taskType?: "all" | string;
  selectedTaskId?: string;
  selectedScriptId?: string;
  page?: number;
};

export type AdminGenerationTaskScript = {
  id: string;
  title: string;
  authorId: string;
};

export type AdminGenerationTaskAuthor = {
  id: string;
  email: string;
  nickname: string;
  isBanned: boolean;
};

export type AdminGenerationTaskRow = {
  id: string;
  scriptId: string;
  taskType: string;
  status: GenerationTaskStatus;
  params: unknown;
  progressPercent: number;
  resultData: unknown;
  errorMessage: string | null;
  qualityStatus: GenerationTaskQualityStatus;
  retryOfTaskId: string | null;
  retryCount: number;
  maxRetries: number;
  chargedCredits: number;
  refundCredits: number;
  failureReason: string | null;
  userFeedback: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  script: AdminGenerationTaskScript | null;
  author: AdminGenerationTaskAuthor | null;
};

export type AdminGenerationTaskListResult = {
  tasks: AdminGenerationTaskRow[];
  total: number;
  selectedTask: AdminGenerationTaskRow | null;
  stats: {
    running: number;
    completed: number;
    failed: number;
    chargedCredits: number;
  };
  taskTypes: string[];
  error?: string;
};

type TaskRecord = {
  id: string;
  script_id: string;
  task_type: string;
  status: GenerationTaskStatus;
  params: unknown;
  progress_percent: number;
  result_data: unknown;
  error_message: string | null;
  quality_status: GenerationTaskQualityStatus | null;
  retry_of_task_id: string | null;
  retry_count: number | null;
  max_retries: number | null;
  charged_credits: number | null;
  refund_credits: number | null;
  failure_reason: string | null;
  user_feedback: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type GenerationTaskStatsRpc = {
  running: number | null;
  completed: number | null;
  failed: number | null;
  charged_credits: number | null;
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

const PAGE_SIZE = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getAdminGenerationTasks(
  filters: AdminGenerationTaskFilters,
): Promise<AdminGenerationTaskListResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    return {
      tasks: [],
      total: 0,
      selectedTask: null,
      stats: { running: 0, completed: 0, failed: 0, chargedCredits: 0 },
      taskTypes: [],
      error: "未配置 Supabase service role，无法读取真实生成任务数据。",
    };
  }

  const keyword = normalizeKeyword(filters.q);
  const matchedScriptIds = keyword ? await getMatchingScriptIds(keyword) : [];
  const matchedAuthorScriptIds = keyword ? await getMatchingAuthorScriptIds(keyword) : [];
  const matchedIds = [...new Set([...matchedScriptIds, ...matchedAuthorScriptIds])];
  const page = Math.max(1, filters.page ?? 1);
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let query = supabase
    .from("generation_tasks")
    .select(
      "id,script_id,task_type,status,params,progress_percent,result_data,error_message,quality_status,retry_of_task_id,retry_count,max_retries,charged_credits,refund_credits,failure_reason,user_feedback,started_at,completed_at,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  query = applyFilters(query, filters, keyword, matchedIds);

  const { data, error, count } = await query.returns<TaskRecord[]>();

  if (error) {
    return {
      tasks: [],
      total: 0,
      selectedTask: null,
      stats: { running: 0, completed: 0, failed: 0, chargedCredits: 0 },
      taskTypes: [],
      error: `读取生成任务列表失败：${error.message}`,
    };
  }

  const taskTypes = await getTaskTypes();
  const tasks = await hydrateTasks(data ?? []);
  const selectedTask = await resolveSelectedTask(tasks, filters.selectedTaskId);
  const stats = await buildStats(filters, keyword, matchedIds);

  return {
    tasks,
    total: count ?? tasks.length,
    selectedTask,
    stats,
    taskTypes,
  };
}

type FilterableQuery<T> = {
  eq: (column: string, value: string | number | boolean) => T;
  in: (column: string, values: string[]) => T;
  or: (filters: string) => T;
};

function applyFilters<T extends FilterableQuery<T>>(
  query: T,
  filters: AdminGenerationTaskFilters,
  keyword: string,
  matchedScriptIds: string[],
): T {
  let next = query;
  if (filters.status && filters.status !== "all") {
    next = next.eq("status", filters.status);
  }
  if (filters.taskType && filters.taskType !== "all") {
    next = next.eq("task_type", filters.taskType);
  }
  if (filters.selectedScriptId) {
    next = next.eq("script_id", filters.selectedScriptId);
  }
  if (keyword) {
    const clauses = [`task_type.ilike.%${escapePostgrestValue(keyword)}%`];
    if (isUuid(keyword)) {
      clauses.push(`id.eq.${keyword}`, `script_id.eq.${keyword}`);
    }
    if (matchedScriptIds.length > 0) {
      clauses.push(`script_id.in.(${matchedScriptIds.join(",")})`);
    }
    next = next.or(clauses.join(","));
  }
  return next;
}

async function hydrateTasks(rows: TaskRecord[]): Promise<AdminGenerationTaskRow[]> {
  const scriptIds = [...new Set(rows.map((row) => row.script_id))];
  const scripts = await getScriptMap(scriptIds);
  const authors = await getAuthorMap([...new Set([...scripts.values()].map((script) => script.authorId))]);

  return rows.map((row) => {
    const script = scripts.get(row.script_id) ?? null;
    return {
      id: row.id,
      scriptId: row.script_id,
      taskType: row.task_type,
      status: row.status,
      params: row.params,
      progressPercent: row.progress_percent,
      resultData: row.result_data,
      errorMessage: row.error_message,
      qualityStatus: row.quality_status ?? "unchecked",
      retryOfTaskId: row.retry_of_task_id,
      retryCount: row.retry_count ?? 0,
      maxRetries: row.max_retries ?? 0,
      chargedCredits: row.charged_credits ?? 0,
      refundCredits: row.refund_credits ?? 0,
      failureReason: row.failure_reason,
      userFeedback: row.user_feedback,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      script,
      author: script ? authors.get(script.authorId) ?? null : null,
    };
  });
}

async function resolveSelectedTask(
  tasks: AdminGenerationTaskRow[],
  selectedTaskId?: string,
): Promise<AdminGenerationTaskRow | null> {
  if (!selectedTaskId) return null;
  const existing = tasks.find((task) => task.id === selectedTaskId);
  if (existing) return existing;
  if (!isUuid(selectedTaskId)) return null;

  const supabase = createAdminSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("generation_tasks")
    .select(
      "id,script_id,task_type,status,params,progress_percent,result_data,error_message,quality_status,retry_of_task_id,retry_count,max_retries,charged_credits,refund_credits,failure_reason,user_feedback,started_at,completed_at,created_at",
    )
    .eq("id", selectedTaskId)
    .maybeSingle()
    .returns<TaskRecord | null>();

  if (!data) return null;
  const hydrated = await hydrateTasks([data]);
  return hydrated[0] ?? null;
}

async function buildStats(
  filters: AdminGenerationTaskFilters,
  keyword: string,
  matchedScriptIds: string[],
) {
  // 优先调用 RPC admin_get_generation_task_stats 一次 SQL 聚合返回 4 个指标，
  // 替代原来 3 次 count + 1 次 select+reduce 的 4 次查询方案。
  // RPC 缺失（migration 024 未应用）时回退到原方案，保证向前兼容。
  const supabase = createAdminSupabaseClient();
  if (!supabase) return { running: 0, completed: 0, failed: 0, chargedCredits: 0 };

  const rpcParams = {
    p_task_type: filters.taskType && filters.taskType !== "all" ? filters.taskType : null,
    p_script_id: filters.selectedScriptId ?? null,
    p_q: keyword || null,
    p_matched_script_ids: matchedScriptIds.length > 0 ? matchedScriptIds : null,
  };

  const { data: rpcData, error: rpcError } = await supabase
    .rpc("admin_get_generation_task_stats", rpcParams)
    .maybeSingle();

  if (!rpcError && rpcData) {
    const stats = rpcData as unknown as GenerationTaskStatsRpc;
    return {
      running: Number(stats.running ?? 0),
      completed: Number(stats.completed ?? 0),
      failed: Number(stats.failed ?? 0),
      chargedCredits: Number(stats.charged_credits ?? 0),
    };
  }

  // 回退方案：migration 024 未应用时使用原 4 次查询
  if (rpcError) {
    console.warn(
      `[generation-tasks] RPC admin_get_generation_task_stats 失败，回退到 4 次查询方案：${rpcError.message}。请应用 supabase/migrations/024_admin_task_stats_rpc.sql。`,
    );
  }

  const [running, completed, failed, chargedCredits] = await Promise.all([
    countRows({ ...filters, status: "running" }, keyword, matchedScriptIds),
    countRows({ ...filters, status: "completed" }, keyword, matchedScriptIds),
    countRows({ ...filters, status: "failed" }, keyword, matchedScriptIds),
    sumChargedCredits(filters, keyword, matchedScriptIds),
  ]);

  return { running, completed, failed, chargedCredits };
}

async function countRows(
  filters: AdminGenerationTaskFilters,
  keyword: string,
  matchedScriptIds: string[],
) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return 0;
  let query = supabase
    .from("generation_tasks")
    .select("id", { count: "exact", head: true });
  query = applyFilters(query, filters, keyword, matchedScriptIds);
  const { count } = await query;
  return count ?? 0;
}

async function sumChargedCredits(
  filters: AdminGenerationTaskFilters,
  keyword: string,
  matchedScriptIds: string[],
) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return 0;
  let query = supabase.from("generation_tasks").select("charged_credits");
  query = applyFilters(query, filters, keyword, matchedScriptIds);
  const { data, error } = await query;
  if (error || !data) return 0;
  return data.reduce((total, row) => {
    const value = row.charged_credits;
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

async function getTaskTypes() {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("generation_tasks")
    .select("task_type")
    .order("task_type", { ascending: true })
    .limit(1000);
  if (error || !data) return [];
  return [...new Set(data.map((row) => String(row.task_type)).filter(Boolean))];
}

async function getScriptMap(scriptIds: string[]) {
  const supabase = createAdminSupabaseClient();
  const map = new Map<string, AdminGenerationTaskScript>();
  if (!supabase || scriptIds.length === 0) return map;

  const { data, error } = await supabase
    .from("scripts")
    .select("id,title,author_id")
    .in("id", scriptIds)
    .returns<ScriptRecord[]>();
  if (error || !data) return map;

  for (const row of data) {
    map.set(row.id, {
      id: row.id,
      title: row.title,
      authorId: row.author_id,
    });
  }
  return map;
}

async function getAuthorMap(authorIds: string[]) {
  const supabase = createAdminSupabaseClient();
  const map = new Map<string, AdminGenerationTaskAuthor>();
  if (!supabase || authorIds.length === 0) return map;

  const { data, error } = await supabase
    .from("users")
    .select("id,email,nickname,is_banned")
    .in("id", authorIds)
    .returns<UserRecord[]>();
  if (error || !data) return map;

  for (const row of data) {
    map.set(row.id, {
      id: row.id,
      email: row.email ?? "",
      nickname: row.nickname || row.email || "未命名用户",
      isBanned: row.is_banned === true,
    });
  }
  return map;
}

async function getMatchingScriptIds(keyword: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return [];

  const clauses = [`title.ilike.%${escapePostgrestValue(keyword)}%`];
  if (isUuid(keyword)) clauses.push(`id.eq.${keyword}`);

  const { data, error } = await supabase
    .from("scripts")
    .select("id")
    .or(clauses.join(","))
    .limit(100);
  if (error || !data) return [];
  return data.map((row) => row.id as string);
}

async function getMatchingAuthorScriptIds(keyword: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return [];

  const userClauses = [
    `email.ilike.%${escapePostgrestValue(keyword)}%`,
    `nickname.ilike.%${escapePostgrestValue(keyword)}%`,
  ];
  if (isUuid(keyword)) userClauses.push(`id.eq.${keyword}`);

  const { data: users } = await supabase
    .from("users")
    .select("id")
    .or(userClauses.join(","))
    .limit(100);
  const authorIds = (users ?? []).map((row) => row.id as string);
  if (authorIds.length === 0) return [];

  const { data, error } = await supabase
    .from("scripts")
    .select("id")
    .in("author_id", authorIds)
    .limit(100);
  if (error || !data) return [];
  return data.map((row) => row.id as string);
}

function normalizeKeyword(value?: string) {
  return value?.trim() ?? "";
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function escapePostgrestValue(value: string) {
  return value.replace(/[%*,()]/g, "");
}
