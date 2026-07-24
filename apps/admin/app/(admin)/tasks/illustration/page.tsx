import Link from "next/link";
import { AdminFilterForm } from "@/components/admin-filter-form";
import {
  AdminIllustrationTaskCancelButton,
  AdminIllustrationTaskRetryButton,
} from "@/components/admin-task-actions";
import { DetailModal, DetailPreview, PageHeader, Pagination, RefreshButton, StatGrid, Tag, UserCell } from "@/components/admin-static";
import { JsonPreview } from "@/components/json-preview";
import {
  getAdminIllustrationTasks,
  type AdminIllustrationTaskRow,
  type IllustrationQualityStatus,
  type IllustrationTaskStatus,
  type IllustrationTaskType,
} from "@/lib/services/illustration-tasks";

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
  quality?: string;
  model?: string;
  taskId?: string;
  page?: string;
};

export default async function IllustrationTasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const result = await getAdminIllustrationTasks(filters);

  return (
    <div className="page-stack">
      <PageHeader
        title="插画任务监控"
        description="查看插画生成任务、质检状态、模型配置与失败原因。"
        actions={<RefreshButton />}
      />

      <StatGrid
        items={[
          { label: "运行中", value: String(result.stats.running), trend: "当前筛选范围内等待或运行任务", tone: "info" },
          { label: "已完成", value: String(result.stats.completed), trend: "当前筛选范围内完成任务", tone: "success" },
          { label: "待质检", value: String(result.stats.unchecked), trend: "quality_status = unchecked", tone: "warning" },
          { label: "失败", value: String(result.stats.failed), trend: "需要查看错误信息或重试", tone: "error" },
        ]}
      />

      <section className="admin-card">
          <AdminFilterForm action="/tasks/illustration">
            <div className="toolbar-left">
              <input
                className="input input-wide"
                name="q"
                placeholder="搜索任务、剧本、作者或模型"
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
                <option value="all">全部类型</option>
                <option value="cover">封面</option>
                <option value="scene">场景</option>
                <option value="clue">线索卡</option>
                <option value="public">公共图</option>
                <option value="char">角色</option>
                <option value="poster">海报</option>
              </select>
              <select className="select" name="quality" defaultValue={filters.quality}>
                <option value="all">全部质检</option>
                <option value="unchecked">未检查</option>
                <option value="passed">通过</option>
                <option value="warning">警告</option>
              </select>
              <input
                className="input"
                name="model"
                placeholder="模型名"
                defaultValue={filters.model === "all" ? "" : filters.model}
              />
              <button className="admin-btn primary" type="submit">
                查询
              </button>
              <Link className="admin-btn" href="/tasks/illustration">
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
                  <th>任务 / 剧本</th>
                  <th>作者</th>
                  <th>类型</th>
                  <th>模型</th>
                  <th>比例</th>
                  <th>状态</th>
                  <th>质检</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.tasks.map((task) => (
                  <tr
                    className={task.id === result.selectedTask?.id ? "table-row-selected" : ""}
                    key={task.id}
                  >
                    <td>
                      <div>
                        <b>{task.title}</b>
                        <div className="placeholder-meta">
                          {task.script?.title ?? "剧本不存在"} / {shortId(task.id)}
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
                    <td>{task.selectedModel}</td>
                    <td>
                      {task.selectedRatio} / {task.selectedCount} 张
                    </td>
                    <td>{statusTag(task.status, task.progressPercent)}</td>
                    <td>{qualityTag(task.qualityStatus)}</td>
                    <td>{formatDateTime(task.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="link-btn" href={buildTaskHref(filters, task.id)}>
                          详情
                        </Link>
                        {task.status === "failed" && (
                          <AdminIllustrationTaskRetryButton
                            returnTo={buildIllustrationReturnHref(filters)}
                            taskId={task.id}
                          />
                        )}
                        {(task.status === "pending" || task.status === "running") && (
                          <AdminIllustrationTaskCancelButton
                            returnTo={buildIllustrationReturnHref(filters)}
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
                      </div>
                    </td>
                  </tr>
                ))}
                {result.tasks.length === 0 && (
                  <tr>
                    <td className="table-empty" colSpan={9}>
                      暂无匹配插画任务
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <Pagination
              baseHref={buildIllustrationBaseHref(filters)}
              page={filters.page ?? 1}
              pageSize={PAGE_SIZE}
              total={result.total}
            />
          </div>
      </section>

      {result.selectedTask && (
        <DetailModal closeHref={buildIllustrationReturnHrefWithoutTask(filters)} title="任务详情">
          <TaskDetail task={result.selectedTask} />
        </DetailModal>
      )}
    </div>
  );
}

function TaskDetail({ task }: { task: AdminIllustrationTaskRow }) {
  return (
    <DetailPreview
      title="任务详情"
      rows={[
        ["任务", task.title],
        ["剧本", task.script?.title ?? "剧本不存在"],
        ["作者", task.author ? `${task.author.nickname} / ${task.author.email || shortId(task.author.id)}` : "作者不存在"],
        ["作者状态", task.author?.isBanned ? <Tag tone="error" key="banned">已封禁</Tag> : <Tag tone="success" key="active">正常</Tag>],
        ["任务类型", taskTypeTag(task.taskType)],
        ["来源", `${task.sourceType || "task"} / ${task.sourceId || task.taskKey}`],
        ["模型", task.selectedModel],
        ["比例 / 数量", `${task.selectedRatio} / ${task.selectedCount} 张`],
        ["生成状态", statusTag(task.status, task.progressPercent)],
        ["质检状态", qualityTag(task.qualityStatus)],
        ["质检说明", task.qualityMessage || "无"],
        ["资产", task.asset ? `${task.asset.title} / ${task.asset.status} / ${task.asset.progress}%` : "未关联资产"],
        ["错误信息", task.errorMessage || "无"],
        ["提示词", task.prompt ? <JsonPreview key="prompt" value={task.prompt} /> : "无"],
        ["开始时间", task.startedAt ? formatDateTime(task.startedAt) : "未开始"],
        ["完成时间", task.completedAt ? formatDateTime(task.completedAt) : "未完成"],
        ["更新时间", formatDateTime(task.updatedAt)],
      ]}
    />
  );
}

function normalizeFilters(params: SearchParams) {
  const model = params.model?.trim() || "all";
  const page = params.page ? Math.max(1, Math.floor(Number(params.page) || 1)) : 1;

  return {
    q: params.q?.trim() ?? "",
    status: isTaskStatus(params.status) ? params.status : "all",
    taskType: isTaskType(params.type) ? params.type : "all",
    quality: isQualityStatus(params.quality) ? params.quality : "all",
    model,
    selectedTaskId: params.taskId,
    page,
  } as const;
}

/** 构造分页基础链接：保留筛选参数，但排除 page（由 Pagination 组件追加） */
function buildIllustrationBaseHref(filters: ReturnType<typeof normalizeFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.quality !== "all") params.set("quality", filters.quality);
  if (filters.model !== "all") params.set("model", filters.model);
  if (filters.selectedTaskId) params.set("taskId", filters.selectedTaskId);
  const query = params.toString();
  return query ? `/tasks/illustration?${query}` : "/tasks/illustration";
}

/** 构造操作后跳转链接：保留筛选参数与当前选中任务，与 buildIllustrationBaseHref 一致 */
function buildIllustrationReturnHref(filters: ReturnType<typeof normalizeFilters>): string {
  return buildIllustrationBaseHref(filters);
}

function buildIllustrationReturnHrefWithoutTask(filters: ReturnType<typeof normalizeFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.quality !== "all") params.set("quality", filters.quality);
  if (filters.model !== "all") params.set("model", filters.model);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/tasks/illustration?${query}` : "/tasks/illustration";
}

function buildTaskHref(filters: ReturnType<typeof normalizeFilters>, taskId: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.taskType !== "all") params.set("type", filters.taskType);
  if (filters.quality !== "all") params.set("quality", filters.quality);
  if (filters.model !== "all") params.set("model", filters.model);
  params.set("taskId", taskId);

  return `/tasks/illustration?${params.toString()}`;
}

function taskTypeTag(type: IllustrationTaskType) {
  const meta: Record<IllustrationTaskType, { label: string; tone: "default" | "success" | "warning" | "error" | "info" | "purple" }> = {
    cover: { label: "封面", tone: "purple" },
    scene: { label: "场景", tone: "info" },
    clue: { label: "线索卡", tone: "success" },
    public: { label: "公共图", tone: "default" },
    char: { label: "角色", tone: "warning" },
    poster: { label: "海报", tone: "error" },
  };
  const item = meta[type];
  return <Tag tone={item.tone}>{item.label}</Tag>;
}

function statusTag(status: IllustrationTaskStatus, progress: number) {
  if (status === "completed") return <Tag tone="success">已完成</Tag>;
  if (status === "failed") return <Tag tone="error">失败</Tag>;
  if (status === "cancelled") return <Tag>已取消</Tag>;
  if (status === "running") return <Tag tone="info">运行中 {progress}%</Tag>;
  return <Tag tone="warning">等待中</Tag>;
}

function qualityTag(status: IllustrationQualityStatus) {
  if (status === "passed") return <Tag tone="success">通过</Tag>;
  if (status === "warning") return <Tag tone="warning">警告</Tag>;
  return <Tag>未检查</Tag>;
}

function avatarText(task: AdminIllustrationTaskRow) {
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

function isTaskStatus(value?: string): value is IllustrationTaskStatus {
  return value === "pending" || value === "running" || value === "completed" || value === "failed" || value === "cancelled";
}

function isTaskType(value?: string): value is IllustrationTaskType {
  return value === "cover" || value === "scene" || value === "clue" || value === "public" || value === "char" || value === "poster";
}

function isQualityStatus(value?: string): value is IllustrationQualityStatus {
  return value === "unchecked" || value === "passed" || value === "warning";
}
