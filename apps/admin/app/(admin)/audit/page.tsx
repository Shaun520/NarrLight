import Link from "next/link";
import { Download } from "lucide-react";
import { AdminFilterForm } from "@/components/admin-filter-form";
import { AdminClearAuditLogsButton } from "@/components/admin-clear-audit-logs-button";
import { DetailModal, DetailPreview, PageHeader, Tag } from "@/components/admin-static";
import { getAdminAuditLogs, type AdminAuditLogRow } from "@/lib/services/audit-logs";

type SearchParams = {
  q?: string;
  action?: string;
  range?: string;
  logId?: string;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const result = await getAdminAuditLogs(filters);

  return (
    <div className="page-stack">
      <PageHeader
        title="审计日志"
        description="追踪管理员的敏感操作与配置变更，日志不可修改。"
        actions={
          <>
            <button className="admin-btn" type="button" disabled title="导出功能后续接入">
              <Download size={14} />
              导出
            </button>
            <AdminClearAuditLogsButton />
          </>
        }
      />
      <section className="admin-card">
          <AdminFilterForm action="/audit">
            <div className="toolbar-left">
              <input
                className="input input-wide"
                defaultValue={filters.q}
                name="q"
                placeholder="搜索目标、管理员或操作"
              />
              <select className="select" defaultValue={filters.action} name="action">
                <option value="all">全部操作</option>
                {result.actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabel(action)}
                  </option>
                ))}
              </select>
              <select className="select" defaultValue={filters.range} name="range">
                <option value="7d">最近 7 天</option>
                <option value="30d">最近 30 天</option>
                <option value="all">全部时间</option>
              </select>
              <button className="admin-btn primary" type="submit">
                查询
              </button>
              <Link className="admin-btn" href="/audit">
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
                  <th>时间</th>
                  <th>管理员</th>
                  <th>操作</th>
                  <th>目标</th>
                  <th>原因</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {result.logs.map((log) => (
                  <tr className={log.id === result.selectedLog?.id ? "table-row-selected" : ""} key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.adminId}</td>
                    <td>{actionTag(log.action)}</td>
                    <td>{targetText(log)}</td>
                    <td className="audit-reason-cell">{log.reason || "—"}</td>
                    <td>
                      <Link className="link-btn" href={buildAuditHref(filters, log.id)}>
                        查看详情
                      </Link>
                    </td>
                  </tr>
                ))}
                {result.logs.length === 0 && (
                  <tr>
                    <td className="table-empty" colSpan={6}>
                      暂无审计日志
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="page-total">
              共 {result.total.toLocaleString("zh-CN")} 条，当前显示 {result.logs.length} 条
            </span>
          </div>
      </section>

      {result.selectedLog && (
        <DetailModal closeHref={buildAuditReturnHref(filters)} title="审计详情">
          <AuditDetail log={result.selectedLog} />
        </DetailModal>
      )}
    </div>
  );
}

function AuditDetail({ log }: { log: AdminAuditLogRow }) {
  return (
    <DetailPreview
      title="审计详情"
      rows={[
        ["管理员", log.adminId],
        ["操作", actionTag(log.action)],
        ["目标类型", targetTypeLabel(log.targetType)],
        ["目标", log.targetId ?? "—"],
        ["原因", log.reason || "—"],
        ["IP", log.ip ?? "—"],
        ["User Agent", log.userAgent ?? "—"],
        ["时间", formatDateTime(log.createdAt)],
        ["变更快照", <pre className="audit-payload" key="payload">{formatPayload(log.payload)}</pre>],
      ]}
    />
  );
}

function normalizeFilters(params: SearchParams) {
  return {
    q: params.q?.trim() ?? "",
    action: params.action?.trim() || "all",
    range: params.range === "30d" || params.range === "all" ? params.range : "7d",
    selectedLogId: params.logId,
  } as const;
}

function buildAuditHref(filters: ReturnType<typeof normalizeFilters>, logId: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.action !== "all") params.set("action", filters.action);
  if (filters.range !== "7d") params.set("range", filters.range);
  params.set("logId", logId);
  return `/audit?${params.toString()}`;
}

function buildAuditReturnHref(filters: ReturnType<typeof normalizeFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.action !== "all") params.set("action", filters.action);
  if (filters.range !== "7d") params.set("range", filters.range);
  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

function actionTag(action: string) {
  const tone = action.includes("ban") || action.includes("delete") || action.includes("takedown")
    ? "error"
    : action.includes("config")
      ? "purple"
      : "info";

  return <Tag tone={tone}>{actionLabel(action)}</Tag>;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "system.config.update": "配置变更",
    "user.ban": "用户封禁",
    "user.unban": "用户启用",
  };

  return labels[action] ?? action;
}

function targetText(log: AdminAuditLogRow) {
  const type = targetTypeLabel(log.targetType);
  return log.targetId ? `${type} ${log.targetId}` : type;
}

function targetTypeLabel(targetType: string) {
  const labels: Record<string, string> = {
    user: "用户",
    script: "剧本",
    system_config: "系统配置",
    generation_task: "生成任务",
    illustration_task: "插画任务",
  };

  return labels[targetType] ?? targetType;
}

function formatPayload(payload: unknown) {
  try {
    return JSON.stringify(payload ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
