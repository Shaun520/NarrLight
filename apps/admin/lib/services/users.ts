import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminUserListFilters = {
  q?: string;
  plan?: "all" | "free" | "pro";
  status?: "all" | "active" | "banned";
  selectedUserId?: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  freeQuotaUsed: number;
  freeQuotaLimit: number;
  planType: "free" | "pro";
  createdAt: string;
  updatedAt: string;
  isBanned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  scriptCount: number;
  creditBalance: number | null;
  monthlyGrant: number | null;
};

export type AdminUserListResult = {
  users: AdminUserRow[];
  total: number;
  selectedUser: AdminUserRow | null;
  error?: string;
};

type UserRecord = {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  free_quota_used: number;
  free_quota_limit: number;
  plan_type: "free" | "pro";
  created_at: string;
  updated_at: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
};

type UserCreditRecord = {
  user_id: string;
  balance: number;
  monthly_grant: number;
};

type ScriptRecord = {
  author_id: string;
};

const PAGE_SIZE = 20;

export async function getAdminUsers(filters: AdminUserListFilters): Promise<AdminUserListResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    return {
      users: [],
      total: 0,
      selectedUser: null,
      error: "未配置 Supabase service role，无法读取真实用户数据。",
    };
  }

  let query = supabase
    .from("users")
    .select(
      "id,email,nickname,avatar_url,free_quota_used,free_quota_limit,plan_type,created_at,updated_at,is_banned,banned_at,banned_reason",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  if (filters.plan && filters.plan !== "all") {
    query = query.eq("plan_type", filters.plan);
  }

  if (filters.status === "active") {
    query = query.eq("is_banned", false);
  }

  if (filters.status === "banned") {
    query = query.eq("is_banned", true);
  }

  const keyword = normalizeKeyword(filters.q);
  if (keyword) {
    if (isUuid(keyword)) {
      query = query.eq("id", keyword);
    } else {
      const like = `%${keyword}%`;
      query = query.or(`email.ilike.${like},nickname.ilike.${like}`);
    }
  }

  const { data, error, count } = await query.returns<UserRecord[]>();

  if (error) {
    return {
      users: [],
      total: 0,
      selectedUser: null,
      error: `读取用户列表失败：${error.message}`,
    };
  }

  const rows = data ?? [];
  const ids = rows.map((user) => user.id);
  const [scriptCounts, credits] = await Promise.all([
    getScriptCounts(ids),
    getCreditMap(ids),
  ]);

  const users = rows.map((user) => mapUser(user, scriptCounts, credits));
  const selectedUser = resolveSelectedUser(users, filters.selectedUserId);

  return {
    users,
    total: count ?? users.length,
    selectedUser,
  };
}

async function getScriptCounts(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, number>();
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return new Map<string, number>();
  }

  const { data } = await supabase
    .from("scripts")
    .select("author_id")
    .in("author_id", userIds)
    .returns<ScriptRecord[]>();

  const counts = new Map<string, number>();
  for (const item of data ?? []) {
    counts.set(item.author_id, (counts.get(item.author_id) ?? 0) + 1);
  }

  return counts;
}

async function getCreditMap(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, UserCreditRecord>();
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return new Map<string, UserCreditRecord>();
  }

  const { data } = await supabase
    .from("user_credits")
    .select("user_id,balance,monthly_grant")
    .in("user_id", userIds)
    .returns<UserCreditRecord[]>();

  return new Map((data ?? []).map((credit) => [credit.user_id, credit]));
}

function mapUser(
  user: UserRecord,
  scriptCounts: Map<string, number>,
  credits: Map<string, UserCreditRecord>,
): AdminUserRow {
  const credit = credits.get(user.id);

  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname || "未设置昵称",
    avatarUrl: user.avatar_url,
    freeQuotaUsed: user.free_quota_used,
    freeQuotaLimit: user.free_quota_limit,
    planType: user.plan_type,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    isBanned: user.is_banned,
    bannedAt: user.banned_at,
    bannedReason: user.banned_reason,
    scriptCount: scriptCounts.get(user.id) ?? 0,
    creditBalance: credit?.balance ?? null,
    monthlyGrant: credit?.monthly_grant ?? null,
  };
}

function resolveSelectedUser(users: AdminUserRow[], selectedUserId?: string) {
  if (!selectedUserId) {
    return null;
  }

  return users.find((user) => user.id === selectedUserId) ?? null;
}

function normalizeKeyword(value?: string) {
  return value?.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").slice(0, 120) ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
