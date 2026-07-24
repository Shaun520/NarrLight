import Link from "next/link";
import { AdminFilterForm } from "@/components/admin-filter-form";
import {
  AdminGenerationTaskCancelButton,
  AdminGenerationTaskRetryButton,
} from "@/components/admin-task-actions";
import {
  AdminGenerationTaskDeleteButton,
  AdminGenerationTaskDeleteForm,
  AdminGenerationTaskSelectAllCheckbox,
} from "@/components/admin-generation-task-delete-form";
import { DetailModal, DetailPreview, PageHeader, Pagination, RefreshButton, StatGrid, Tag, UserCell } from "@/components/admin-static";
import { JsonPreview } from "@/components/json-preview";
import {
  getAdminGenerationTasks,
  type AdminGenerationTaskFilters,
  type AdminGenerationTaskRow,
  type GenerationTaskQualityStatus,
  type GenerationTaskStatus,
} from "@/lib/services/generation-tasks";

const DELETE_FORM_ID = "admin-generation-task-delete-form";

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
  taskId?: string;
  scriptId?: string;
  page?: string;
};

type NormalizedFilters = AdminGenerationTaskFilters & {
  q: string;
  status: "all" | GenerationTaskStatus;
  taskType: "all" | string;
};

export default async function GenerationTasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const result = await getAdminGenerationTasks(filters);

  return (
    <div className="page-stack">
      <PageHeader
        title="生成任务监控"
        description="查看剧本分阶段生成任务、扣费、失败原因与关联剧本。"
        actions={<RefreshButton />}
      />

      <StatGrid
        items={[
          { label: "运行中", value: String(result.stats.running), trend: "当前筛选范围内运行任务", tone: "info" },
          { label: "已完成", value: String(result.stats.completed), trend: "当前筛选范围内完成任务", tone: "success" },
          { label: "失败", value: String(result.stats.failed), trend: "需要查看错误信息或重试", tone: "error" },
          { label: "已扣创作点", value: String(result.stats.chargedCredits), trend: "当前筛选范围内 charged_credits 合计", tone: "warning" },
        ]}
      />

      <section className="admin-card">
          <AdminFilterForm action="/tasks/generation">
            <div className="toolbar-left">
              <input
                className="input input-wide"
                name="q"
                placeholder="搜索任务 ID、剧本、作者或任务类型"
                defaultValue={filters.q}
              />
              <select className="select" name="status" defaultValue={filters.status}>
                <option value="all">全部状态</option>
                <option value="pending">等待中</option>
                <option value="running">运行中</option>
                <option value="completed">已完成</option>
                <option value="failed">失败</option>
                <option value="cancelled">已取消</option>
              </select>
              <select className="select" name="type" defaultValue={filters.taskType}>
                <option value="all">全部阶段</option>
                {result.taskTypes.map((taskType) => (
                  <option key={taskType} value={taskType}>
                    {taskTypeLabel(taskType)}
                  </option>
                ))}
              </select>
              {filters.selectedScriptId && (
                <input name="scriptId" type="hidden" value={filters.selectedScriptId} />
              )}
              <button className="admin-btn primary" type="submit">
                查询
              </button>
              <Link className="admin-btn" href="/tasks/generation">
                重置
              </Link>
            </div>
          </AdminFilterForm>

          {filters.selectedScriptId && (
            <div className="admin-inline-alert" role="status">
              当前仅查看剧本 {shortId(filters.selectedScriptId)} 的生成任务。
            </div>
          )}

          {result.error && (
            <div className="admin-inline-alert" role="alert">
              {result.error}
            </div>
          )}

          <AdminGenerationTaskDeleteForm returnTo={buildGenerationReturnHref(filters)} />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-checkbox-cell">
                    <AdminGenerationTaskSelectAllCheckbox />
                  </th>
                  <th>任务 / 剧本</th>
                  <th>作者</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>扣费</th>
                  <th>质量</th>
                  <th>开始时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.tasks.map((task) => (
                  <tr
                    className={task.id === result.selectedTask?.id ? "table-row-selected" : ""}
                    key={task.id}
                  >
                    <td className="table-checkbox-cell">
                      <input
                        aria-label={`选择生成任务 ${shortId(task.id)}`}
                        className="table-checkbox"
                        form={DELETE_FORM_ID}
                        name="taskIds"
                        type="checkbox"
                        value={task.id}
                      />
                    </td>
                    <td>
                      <div>
                        <b>{shortId(task.id)}</b>
                        <div className="placeholder-meta">
                          {task.script?.title ?? "剧本不存在"} / {shortId(task.scriptId)}
                        </div>
                      </div>
                    </td>
                    <td>
                      {task.author ? (
                        <UserCell
                          avatar={avatarText(task)}
                          name={task.author.nickname}
                          sub={task.author.email || shortId(task.author.id)}
                        />
                      ) : (
                        <span className="placeholder-meta">作者不存在</span>
                      )}
                    </td>
                    <td>{taskTypeTag(task.taskType)}</td>
                    <td>{statusTag(task.status)}</td>
                    <td>{task.progressPercent}%</td>
                    <td>
                      {task.chargedCredits}
                      {task.refundCredits > 0 ? ` / 退 ${task.refundCredits}` : ""}
                    </td>
                    <td>{qualityTag(task.qualityStatus)}</td>
                    <td>{task.startedAt ? formatDateTime(task.startedAt) : "未开始"}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="link-btn" href={buildTaskHref(filters, task.id)}>
                          详情
                        </Link>
                        {task.status === "failed" && (
                          <AdminGenerationTaskRetryButton
                            returnTo={buildGenerationReturnHref(filters)}
                            taskId={task.id}
                          />
                        )}
                        {(task.status === "pending" || task.status === "running") && (
                          <AdminGenerationTaskCancelButton
                            returnTo={buildGenerationReturnHref(filters)}
                            taskId={task.id}
                          />
                        )}
                        {task.script && (
                          <Link className="link-btn" href={`/scripts?scriptId=${task.script.id}`}>
                            剧本
                          </Link>
                        )}
                        {task.author && (
                          <Link className="link-btn" href={`/users?userId=${task.author.id}`}>
                            作者
                          </Link>
                        )}
                        <AdminGenerationTaskDeleteButton taskId={task.id} />
                      </div>
                    </td>
                  </tr>
                ))}
                {result.tasks.length === 0 && (
                  <tr>
                    <td className="table-empty" colSpan={10}>
                      暂无匹配生成任务
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <Pagination
              baseHref={buildGenerationBaseHref(filters)}
              page={filters.page ?? 1}
              pageSize={PAGE_SIZE}
              total={result.total}
            />
          </div>
      </section>

      {result.selectedTask && (
        <DetailModal closeHref={buildGenerationReturnHrefWithoutTask(filters)} title="任务详情">
          <TaskDetail task={result.selectedTask} />
        </DetailModal>
      )}
    </div>
  );
}

function TaskDetail({ task }: { task: AdminGenerationTaskRow }) {
  return (
    <DetailPreview
      title="任务详情"
      rows={[
        ["任务 ID", task.id],
        ["剧本", task.script?.title ?? "剧本不存在"],
        ["作者", task.author ? `${task.author.nickname} / ${task.author.email || shortId(task.author.id)}` : "作者不存在"],
        ["作者状态", task.author?.isBanned ? <Tag tone="error" key="banned">已封禁</Tag> : <Tag tone="success" key="active">正常</Tag>],
        ["任务类型", taskTypeTag(task.taskType)],
        ["生成状态", <span key="status">{statusTag(task.status)} {task.progressPercent}%</span>],
        ["质量状态", qualityTag(task.qualityStatus)],
        ["扣费 / 退款", `${task.chargedCredits} / ${task.refundCredits}`],
        ["重试", `${task.retryCount} / ${task.maxRetries}${task.retryOfTaskId ? `，源任务 ${shortId(task.retryOfTaskId)}` : ""}`],
        ["失败原因", task.failureReason || task.errorMessage || "无"],
        ["用户反馈", task.userFeedback || "无"],
        ["参数", <JsonPreview key="params" value={task.params} />],
        ["结果", <JsonPreview key="result" value={task.resultData} />],
        ["开始时间", task.startedAt ? formatDateTime(task.startedAt) : "未开始"],
        ["完成时间", task.completedAt ? formatDateTime(task.completedAt) : "未完成"],
        ["创建时间", formatDateTime(task.createdAt)],
      ]}
    />
  );
}

function normalizeFilters(params: SearchParams): NormalizedFilters {
  const page = params.page ? Math.max(1, Math.floor(Number(params.page) || 1)) : 1;
  return {
    q: params.q?.trim() ?? "",
    status: isTaskStatus(params.status) ? params.status : "all",
    taskType: params.type?.trim() || "all",
    selectedTaskId: params.taskId,
    selectedScriptId: isUuid(params.scriptId) ? params.scriptId : undefined,
    page,
  };
}

/** 构造分页基础链接：保留筛选参数，但排除 page（由 Pagination 组件追加） */
function buildGenerationBaseHref(filters: ReturnType<typeof normalizeFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.selectedScriptId) params.set("scriptId", filters.selectedScriptId);
  if (filters.selectedTaskId) params.set("taskId", filters.selectedTaskId);
  const query = params.toString();
  return query ? `/tasks/generation?${query}` : "/tasks/generation";
}

function buildTaskHref(filters: ReturnType<typeof normalizeFilters>, taskId: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.selectedScriptId) params.set("scriptId", filters.selectedScriptId);
  params.set("taskId", taskId);

  return `/tasks/generation?${params.toString()}`;
}

function taskTypeTag(type: string) {
  const tone = typeTone(type);
  return <Tag tone={tone}>{taskTypeLabel(type)}</Tag>;
}

function taskTypeLabel(type: string) {
  const labels: Record<string, string> = {
    FULL_SCRIPT: "完整剧本",
    CHARACTER_ADJUST: "角色调整",
    CLUE_MODIFY: "线索修改",
    TRICK_REPLACE: "诡计替换",
    STYLE_CHANGE: "风格调整",
    COMPRESS: "压缩改写",
    COMPLIANCE: "合规处理",
    ILLUSTRATION: "插画生成",
    STORY_BIBLE: "设定本",
    CHARACTER_PROFILES: "人物设定",
    ACT_STRUCTURE: "分幕结构",
    CHARACTER_SCRIPT: "角色剧本",
    CLUES: "线索卡",
    ORGANIZER_MANUAL: "组织者手册",
    TRUTH_REVIEW: "真相复盘",
    TIMELINE_STRUCTURE: "时间线结构化",
  };

  return labels[type] ?? type;
}

function buildGenerationReturnHref(filters: ReturnType<typeof normalizeFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.selectedScriptId) params.set("scriptId", filters.selectedScriptId);
  if (filters.selectedTaskId) params.set("taskId", filters.selectedTaskId);
  const query = params.toString();

  return query ? `/tasks/generation?${query}` : "/tasks/generation";
}

function buildGenerationReturnHrefWithoutTask(filters: ReturnType<typeof normalizeFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.selectedScriptId) params.set("scriptId", filters.selectedScriptId);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();

  return query ? `/tasks/generation?${query}` : "/tasks/generation";
}

function typeTone(type: string): "default" | "success" | "warning" | "error" | "info" | "purple" {
  if (type === "STORY_BIBLE") return "success";
  if (type === "CHARACTER_SCRIPT") return "info";
  if (type === "TIMELINE_STRUCTURE") return "purple";
  if (type === "TRUTH_REVIEW") return "warning";
  if (type === "FULL_SCRIPT") return "error";
  return "default";
}

function statusTag(status: GenerationTaskStatus) {
  if (status === "completed") return <Tag tone="success">已完成</Tag>;
  if (status === "failed") return <Tag tone="error">失败</Tag>;
  if (status === "cancelled") return <Tag>已取消</Tag>;
  if (status === "running") return <Tag tone="info">运行中</Tag>;
  return <Tag tone="warning">等待中</Tag>;
}

function qualityTag(status: GenerationTaskQualityStatus) {
  if (status === "passed") return <Tag tone="success">通过</Tag>;
  if (status === "failed") return <Tag tone="error">失败</Tag>;
  if (status === "disputed") return <Tag tone="warning">争议</Tag>;
  if (status === "refunded") return <Tag tone="purple">已退款</Tag>;
  return <Tag>未检查</Tag>;
}

function avatarText(task: AdminGenerationTaskRow) {
  return (task.author?.nickname || task.author?.email || "作").slice(0, 1).toUpperCase();
}

function shortId(id: string) {
  return id.slice(0, 8);
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

function isTaskStatus(value?: string): value is GenerationTaskStatus {
  return value === "pending" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}

function isUuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
