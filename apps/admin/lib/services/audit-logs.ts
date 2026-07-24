import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminAuditFilters = {
  q?: string;
  action?: string;
  range?: "7d" | "30d" | "all";
  selectedLogId?: string;
};

export type AdminAuditLogRow = {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: unknown;
  reason: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AdminAuditLogResult = {
  logs: AdminAuditLogRow[];
  total: number;
  selectedLog: AdminAuditLogRow | null;
  actionOptions: string[];
  error?: string;
};

type AuditLogRecord = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: unknown;
  reason: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

const PAGE_SIZE = 20;

export async function getAdminAuditLogs(filters: AdminAuditFilters): Promise<AdminAuditLogResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    return {
      logs: [],
      total: 0,
      selectedLog: null,
      actionOptions: [],
      error: "未配置 Supabase service role，无法读取真实审计日志。",
    };
  }

  let query = supabase
    .from("admin_audit_logs")
    .select("id,admin_id,action,target_type,target_id,payload,reason,ip,user_agent,created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  const since = resolveSince(filters.range);
  if (since) {
    query = query.gte("created_at", since.toISOString());
  }

  if (filters.action && filters.action !== "all") {
    query = query.eq("action", filters.action);
  }

  const keyword = normalizeKeyword(filters.q);
  if (keyword) {
    const like = `%${keyword}%`;
    query = query.or(
      `admin_id.ilike.${like},action.ilike.${like},target_type.ilike.${like},target_id.ilike.${like},reason.ilike.${like}`,
    );
  }

  const [{ data, error, count }, actionOptions] = await Promise.all([
    query.returns<AuditLogRecord[]>(),
    getActionOptions(),
  ]);

  if (error) {
    return {
      logs: [],
      total: 0,
      selectedLog: null,
      actionOptions,
      error: `读取审计日志失败：${error.message}`,
    };
  }

  const logs = (data ?? []).map(mapAuditLog);

  return {
    logs,
    total: count ?? logs.length,
    selectedLog: resolveSelectedLog(logs, filters.selectedLogId),
    actionOptions,
  };
}

async function getActionOptions() {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("action")
    .order("action", { ascending: true })
    .limit(200);

  if (error || !data) return [];

  return Array.from(new Set(data.map((row) => String(row.action)).filter(Boolean)));
}

function mapAuditLog(row: AuditLogRecord): AdminAuditLogRow {
  return {
    id: row.id,
    adminId: row.admin_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    payload: row.payload ?? {},
    reason: row.reason ?? "",
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

function resolveSelectedLog(logs: AdminAuditLogRow[], selectedLogId?: string) {
  if (!selectedLogId) return null;
  return logs.find((log) => log.id === selectedLogId) ?? null;
}

function resolveSince(range: AdminAuditFilters["range"]) {
  if (range === "all") return null;

  const days = range === "30d" ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since;
}

function normalizeKeyword(value?: string) {
  return value?.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").slice(0, 120) ?? "";
}
