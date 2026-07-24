import Link from "next/link";
import { AdminFilterForm } from "@/components/admin-filter-form";
import { AdminUserBanAction } from "@/components/admin-user-ban-action";
import { AdminUserCreditAction } from "@/components/admin-user-credit-action";
import { DetailModal, DetailPreview, PageHeader, Tag, UserCell } from "@/components/admin-static";
import { getAdminUsers, type AdminUserRow } from "@/lib/services/users";

type SearchParams = {
  q?: string;
  plan?: string;
  status?: string;
  userId?: string;
  mode?: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const result = await getAdminUsers(filters);
  const returnTo = buildCurrentHref(filters);

  return (
    <div className="page-stack">
      <PageHeader title="用户管理" description="平台全部注册用户" />
      <section className="admin-card">
          <AdminFilterForm action="/users">
            <div className="toolbar-left">
              <input
                className="input input-wide"
                name="q"
                placeholder="搜索邮箱 / 昵称"
                defaultValue={filters.q}
              />
              <select className="select" name="plan" defaultValue={filters.plan}>
                <option value="all">全部套餐</option>
                <option value="free">免费版</option>
                <option value="pro">Pro</option>
              </select>
              <select className="select" name="status" defaultValue={filters.status}>
                <option value="all">全部状态</option>
                <option value="active">正常</option>
                <option value="banned">已封禁</option>
              </select>
              <button className="admin-btn primary" type="submit">
                查询
              </button>
              <Link className="admin-btn" href="/users">
                重置
              </Link>
            </div>
          </AdminFilterForm>

          {result.error && (
            <div className="admin-inline-alert" role="alert">
              {result.error}
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>邮箱</th>
                  <th>套餐</th>
                  <th>配额使用</th>
                  <th>创作点</th>
                  <th>剧本数</th>
                  <th>注册时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.users.map((user) => (
                  <tr className={user.id === result.selectedUser?.id ? "table-row-selected" : ""} key={user.id}>
                    <td>
                      <UserCell avatar={avatarText(user)} name={user.nickname} sub={user.planType === "pro" ? "付费用户" : "普通用户"} />
                    </td>
                    <td>{user.email}</td>
                    <td>{planTag(user.planType)}</td>
                    <td>{quotaText(user)}</td>
                    <td>{creditText(user)}</td>
                    <td>{user.scriptCount}</td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>
                      {user.isBanned ? <Tag tone="error">已封禁</Tag> : <Tag tone="success">正常</Tag>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="link-btn" href={buildUserHref(filters, user.id, "detail")}>
                          详情
                        </Link>
                        <Link className="link-btn" href={buildUserHref(filters, user.id, "credits")}>
                          创作点
                        </Link>
                        <AdminUserBanAction
                          isBanned={user.isBanned}
                          returnTo={returnTo}
                          userId={user.id}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {result.users.length === 0 && (
                  <tr>
                    <td className="table-empty" colSpan={9}>
                      暂无匹配用户
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="page-total">
              共 {result.total.toLocaleString("zh-CN")} 条，当前显示 {result.users.length} 条
            </span>
          </div>
      </section>

      {result.selectedUser && filters.modalMode === "detail" && (
        <DetailModal closeHref={returnTo} title="用户详情">
          <UserDetail returnTo={returnTo} user={result.selectedUser} />
        </DetailModal>
      )}

      {result.selectedUser && filters.modalMode === "credits" && (
        <DetailModal closeHref={returnTo} title="创作点调整">
          <UserCreditDetail returnTo={buildUserHref(filters, result.selectedUser.id, "credits")} user={result.selectedUser} />
        </DetailModal>
      )}
    </div>
  );
}

function UserDetail({ user, returnTo }: { user: AdminUserRow; returnTo: string }) {
  return (
    <DetailPreview
      title="用户详情"
      rows={[
        ["昵称", user.nickname],
        ["邮箱", user.email],
        ["套餐", planTag(user.planType)],
        ["免费配额", quotaText(user)],
        ["创作点余额", creditText(user)],
        ["月度赠送", user.monthlyGrant === null ? "未初始化" : `${user.monthlyGrant} 点`],
        ["剧本数量", `${user.scriptCount} 个`],
        ["状态", user.isBanned ? <Tag tone="error" key="status">已封禁</Tag> : <Tag tone="success" key="status">正常</Tag>],
        ["封禁时间", user.bannedAt ? formatDateTime(user.bannedAt) : "—"],
        ["封禁原因", user.bannedReason ?? "—"],
        ["注册时间", formatDateTime(user.createdAt)],
        ["最近更新", formatDateTime(user.updatedAt)],
        [
          "操作",
          <AdminUserBanAction
            isBanned={user.isBanned}
            key="ban-action"
            returnTo={returnTo}
            userId={user.id}
          />,
        ],
      ]}
    />
  );
}

function UserCreditDetail({ user, returnTo }: { user: AdminUserRow; returnTo: string }) {
  return (
    <DetailPreview
      title="创作点"
      sub="调整用户创作点余额"
      rows={[
        ["用户", user.nickname],
        ["邮箱", user.email],
        ["套餐", planTag(user.planType)],
        ["当前余额", creditText(user)],
        ["月度赠送", user.monthlyGrant === null ? "未初始化" : `${user.monthlyGrant} 点`],
        [
          "调整",
          <AdminUserCreditAction
            currentBalance={user.creditBalance}
            key="credit-action"
            returnTo={returnTo}
            userId={user.id}
          />,
        ],
      ]}
    />
  );
}

function normalizeFilters(params: SearchParams) {
  return {
    q: params.q?.trim() ?? "",
    plan: params.plan === "free" || params.plan === "pro" ? params.plan : "all",
    status: params.status === "active" || params.status === "banned" ? params.status : "all",
    selectedUserId: params.userId,
    modalMode: params.mode === "credits" ? "credits" : params.userId ? "detail" : null,
  } as const;
}

function buildUserHref(filters: ReturnType<typeof normalizeFilters>, userId: string, mode: "detail" | "credits") {
  const params = buildFilterSearchParams(filters);
  params.set("userId", userId);
  params.set("mode", mode);

  return `/users?${params.toString()}`;
}

function buildCurrentHref(filters: ReturnType<typeof normalizeFilters>) {
  const params = buildFilterSearchParams(filters);

  return params.size > 0 ? `/users?${params.toString()}` : "/users";
}

function buildFilterSearchParams(filters: ReturnType<typeof normalizeFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.plan !== "all") params.set("plan", filters.plan);
  if (filters.status !== "all") params.set("status", filters.status);

  return params;
}

function planTag(planType: AdminUserRow["planType"]) {
  return planType === "pro" ? <Tag tone="purple">Pro</Tag> : <Tag>免费版</Tag>;
}

function quotaText(user: AdminUserRow) {
  return user.planType === "pro" ? "不限 / Pro" : `${user.freeQuotaUsed} / ${user.freeQuotaLimit}`;
}

function creditText(user: AdminUserRow) {
  return user.creditBalance === null ? "未初始化" : `${user.creditBalance} 点`;
}

function avatarText(user: AdminUserRow) {
  return (user.nickname || user.email || "用").slice(0, 1).toUpperCase();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
