import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminScriptListFilters = {
  q?: string;
  status?: "all" | ScriptStatus;
  genre?: "all" | ScriptGenre;
  difficulty?: "all" | ScriptDifficulty;
  selectedScriptId?: string;
};

export type ScriptGenre = "hardcore" | "emotion" | "horror" | "funny" | "mechanism";
export type ScriptDifficulty = "beginner" | "intermediate" | "advanced" | "expert";
// 状态值需与 supabase/migrations/025_scripts_status_review.sql 中 scripts_status_check 约束保持一致
export type ScriptStatus =
  | "draft"
  | "generating"
  | "completed"
  | "archived"
  | "reviewing"
  | "approved"
  | "rejected"
  | "taken_down";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AdminScriptAuthor = {
  id: string;
  email: string;
  nickname: string;
  isBanned: boolean;
};

export type AdminScriptRow = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  genre: ScriptGenre;
  playerCount: number;
  durationHours: number;
  difficulty: ScriptDifficulty;
  backgroundSetting: string;
  coreTheme: string;
  status: ScriptStatus;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  author: AdminScriptAuthor | null;
  characterCount: number;
  actCount: number;
  clueCount: number;
  timelineEventCount: number;
  characterScriptCount: number;
  hasStoryBible: boolean;
  storyBibleConfirmed: boolean;
  hasOrganizerManual: boolean;
  hasTruthReview: boolean;
  latestTask: AdminScriptTaskSummary | null;
  runningTaskCount: number;
  failedTaskCount: number;
  latestReport: AdminScriptReportSummary | null;
};

export type AdminScriptTaskSummary = {
  id: string;
  taskType: string;
  status: TaskStatus;
  progressPercent: number;
  errorMessage: string | null;
  createdAt: string;
};

export type AdminScriptReportSummary = {
  id: string;
  reportType: string;
  status: string;
  severe: number;
  warning: number;
  hint: number;
  createdAt: string;
};

export type AdminScriptListResult = {
  scripts: AdminScriptRow[];
  total: number;
  selectedScript: AdminScriptRow | null;
  error?: string;
};

type ScriptRecord = {
  id: string;
  author_id: string;
  title: string;
  description: string | null;
  genre: ScriptGenre;
  player_count: number;
  duration_hours: number;
  difficulty: ScriptDifficulty;
  background_setting: string | null;
  core_theme: string | null;
  status: ScriptStatus;
  word_count: number;
  created_at: string;
  updated_at: string;
};

type UserRecord = {
  id: string;
  email: string | null;
  nickname: string | null;
  is_banned: boolean | null;
};

type CountRecord = {
  script_id: string;
};

type StoryBibleRecord = {
  script_id: string;
  confirmed: boolean;
};

type TaskRecord = {
  id: string;
  script_id: string;
  task_type: string;
  status: TaskStatus;
  progress_percent: number;
  error_message: string | null;
  created_at: string;
};

type ReportRecord = {
  id: string;
  script_id: string;
  report_type: string;
  status: string;
  issue_count_severe: number;
  issue_count_warning: number;
  issue_count_hint: number;
  created_at: string;
};

const PAGE_SIZE = 20;

export async function getAdminScripts(filters: AdminScriptListFilters): Promise<AdminScriptListResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    return {
      scripts: [],
      total: 0,
      selectedScript: null,
      error: "未配置 Supabase service role，无法读取真实剧本数据。",
    };
  }

  const keyword = normalizeKeyword(filters.q);
  const matchingAuthorIds = keyword ? await getMatchingAuthorIds(keyword) : [];

  let query = supabase
    .from("scripts")
    .select(
      "id,author_id,title,description,genre,player_count,duration_hours,difficulty,background_setting,core_theme,status,word_count,created_at,updated_at",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.genre && filters.genre !== "all") {
    query = query.eq("genre", filters.genre);
  }

  if (filters.difficulty && filters.difficulty !== "all") {
    query = query.eq("difficulty", filters.difficulty);
  }

  if (keyword) {
    const clauses = [`title.ilike.%${escapePostgrestValue(keyword)}%`];
    if (isUuid(keyword)) {
      clauses.push(`id.eq.${keyword}`);
    }
    if (matchingAuthorIds.length > 0) {
      clauses.push(`author_id.in.(${matchingAuthorIds.join(",")})`);
    }
    query = query.or(clauses.join(","));
  }

  const { data, error, count } = await query.returns<ScriptRecord[]>();

  if (error) {
    return {
      scripts: [],
      total: 0,
      selectedScript: null,
      error: `读取剧本列表失败：${error.message}`,
    };
  }

  const rows = data ?? [];
  const scripts = await hydrateScripts(rows);
  const selectedScript = resolveSelectedScript(scripts, filters.selectedScriptId);

  return {
    scripts,
    total: count ?? scripts.length,
    selectedScript,
  };
}

async function hydrateScripts(rows: ScriptRecord[]): Promise<AdminScriptRow[]> {
  const ids = rows.map((script) => script.id);
  const authorIds = [...new Set(rows.map((script) => script.author_id))];

  const [
    authors,
    characterCounts,
    actCounts,
    clueCounts,
    timelineCounts,
    characterScriptCounts,
    storyBibles,
    organizerManualCounts,
    truthReviewCounts,
    taskSummary,
    reportSummary,
  ] = await Promise.all([
    getAuthorMap(authorIds),
    getCountMap("characters", ids),
    getCountMap("acts", ids),
    getCountMap("clues", ids),
    getCountMap("timeline_events", ids),
    getCountMap("character_scripts", ids),
    getStoryBibleMap(ids),
    getCountMap("organizer_manuals", ids),
    getCountMap("truth_reviews", ids),
    getTaskSummary(ids),
    getReportSummary(ids),
  ]);

  return rows.map((row) => {
    const task = taskSummary.get(row.id);
    const report = reportSummary.get(row.id);
    const storyBible = storyBibles.get(row.id);

    return {
      id: row.id,
      authorId: row.author_id,
      title: row.title,
      description: row.description ?? "",
      genre: row.genre,
      playerCount: row.player_count,
      durationHours: row.duration_hours,
      difficulty: row.difficulty,
      backgroundSetting: row.background_setting ?? "",
      coreTheme: row.core_theme ?? "",
      status: row.status,
      wordCount: row.word_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: authors.get(row.author_id) ?? null,
      characterCount: characterCounts.get(row.id) ?? 0,
      actCount: actCounts.get(row.id) ?? 0,
      clueCount: clueCounts.get(row.id) ?? 0,
      timelineEventCount: timelineCounts.get(row.id) ?? 0,
      characterScriptCount: characterScriptCounts.get(row.id) ?? 0,
      hasStoryBible: Boolean(storyBible),
      storyBibleConfirmed: storyBible?.confirmed ?? false,
      hasOrganizerManual: (organizerManualCounts.get(row.id) ?? 0) > 0,
      hasTruthReview: (truthReviewCounts.get(row.id) ?? 0) > 0,
      latestTask: task?.latestTask ?? null,
      runningTaskCount: task?.runningCount ?? 0,
      failedTaskCount: task?.failedCount ?? 0,
      latestReport: report ?? null,
    };
  });
}

async function getAuthorMap(authorIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || authorIds.length === 0) {
    return new Map<string, AdminScriptAuthor>();
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

async function getMatchingAuthorIds(keyword: string) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return [];
  }

  if (isUuid(keyword)) {
    return [keyword];
  }

  const like = `%${keyword}%`;
  const { data } = await supabase
    .from("users")
    .select("id")
    .or(`email.ilike.${like},nickname.ilike.${like}`)
    .limit(100)
    .returns<Array<{ id: string }>>();

  return (data ?? []).map((user) => user.id);
}

async function getCountMap(table: string, scriptIds: string[]) {
  const supabase = createAdminSupabaseClient();
  const counts = new Map<string, number>();
  if (!supabase || scriptIds.length === 0) {
    return counts;
  }

  const { data } = await supabase
    .from(table)
    .select("script_id")
    .in("script_id", scriptIds)
    .returns<CountRecord[]>();

  for (const item of data ?? []) {
    counts.set(item.script_id, (counts.get(item.script_id) ?? 0) + 1);
  }

  return counts;
}

async function getStoryBibleMap(scriptIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || scriptIds.length === 0) {
    return new Map<string, StoryBibleRecord>();
  }

  const { data } = await supabase
    .from("story_bibles")
    .select("script_id,confirmed")
    .in("script_id", scriptIds)
    .returns<StoryBibleRecord[]>();

  return new Map((data ?? []).map((item) => [item.script_id, item]));
}

async function getTaskSummary(scriptIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || scriptIds.length === 0) {
    return new Map<string, { latestTask: AdminScriptTaskSummary | null; runningCount: number; failedCount: number }>();
  }

  const { data } = await supabase
    .from("generation_tasks")
    .select("id,script_id,task_type,status,progress_percent,error_message,created_at")
    .in("script_id", scriptIds)
    .order("created_at", { ascending: false })
    .returns<TaskRecord[]>();

  const summary = new Map<string, { latestTask: AdminScriptTaskSummary | null; runningCount: number; failedCount: number }>();

  for (const task of data ?? []) {
    const current = summary.get(task.script_id) ?? {
      latestTask: null,
      runningCount: 0,
      failedCount: 0,
    };

    if (!current.latestTask) {
      current.latestTask = {
        id: task.id,
        taskType: task.task_type,
        status: task.status,
        progressPercent: task.progress_percent,
        errorMessage: task.error_message,
        createdAt: task.created_at,
      };
    }
    if (task.status === "running" || task.status === "pending") current.runningCount += 1;
    if (task.status === "failed") current.failedCount += 1;
    summary.set(task.script_id, current);
  }

  return summary;
}

async function getReportSummary(scriptIds: string[]) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || scriptIds.length === 0) {
    return new Map<string, AdminScriptReportSummary>();
  }

  const { data } = await supabase
    .from("validation_reports")
    .select("id,script_id,report_type,status,issue_count_severe,issue_count_warning,issue_count_hint,created_at")
    .in("script_id", scriptIds)
    .order("created_at", { ascending: false })
    .returns<ReportRecord[]>();

  const reports = new Map<string, AdminScriptReportSummary>();
  for (const report of data ?? []) {
    if (reports.has(report.script_id)) continue;
    reports.set(report.script_id, {
      id: report.id,
      reportType: report.report_type,
      status: report.status,
      severe: report.issue_count_severe,
      warning: report.issue_count_warning,
      hint: report.issue_count_hint,
      createdAt: report.created_at,
    });
  }

  return reports;
}

function resolveSelectedScript(scripts: AdminScriptRow[], selectedScriptId?: string) {
  if (!selectedScriptId) {
    return null;
  }

  return scripts.find((script) => script.id === selectedScriptId) ?? null;
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
