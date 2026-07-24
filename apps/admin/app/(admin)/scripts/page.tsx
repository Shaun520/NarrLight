import Link from "next/link";
import { AdminFilterForm } from "@/components/admin-filter-form";
import {
  AdminScriptDeleteButton,
  AdminScriptDeleteForm,
  AdminScriptSelectAllCheckbox,
} from "@/components/admin-script-delete-form";
import { AdminScriptStatusForm } from "@/components/admin-script-status-action";
import { DetailModal, DetailPreview, PageHeader, Tag, UserCell } from "@/components/admin-static";
import {
  getAdminScripts,
  type AdminScriptRow,
  type ScriptDifficulty,
  type ScriptGenre,
  type ScriptStatus,
} from "@/lib/services/scripts";

const DELETE_FORM_ID = "admin-script-delete-form";

type SearchParams = {
  q?: string;
  status?: string;
  genre?: string;
  difficulty?: string;
  scriptId?: string;
};

export default async function ScriptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const result = await getAdminScripts(filters);

  return (
    <div className="page-stack">
      <PageHeader
        title="剧本管理"
        description="查看平台剧本、作者归属、生成进度与内容完整度。"
      />

      <section className="admin-card">
          <AdminFilterForm action="/scripts">
            <div className="toolbar-left">
              <input
                className="input input-wide"
                name="q"
                placeholder="搜索剧本标题 / 作者 / ID"
                defaultValue={filters.q}
              />
              <select className="select" name="status" defaultValue={filters.status}>
                <option value="all">全部状态</option>
                <option value="draft">草稿</option>
                <option value="generating">生成中</option>
                <option value="completed">已完成</option>
                <option value="archived">已归档</option>
                <option value="reviewing">审核中</option>
                <option value="approved">已通过</option>
                <option value="rejected">已驳回</option>
                <option value="taken_down">已下架</option>
              </select>
              <select className="select" name="genre" defaultValue={filters.genre}>
                <option value="all">全部题材</option>
                <option value="hardcore">硬核</option>
                <option value="emotion">情感</option>
                <option value="horror">惊悚</option>
                <option value="funny">欢乐</option>
                <option value="mechanism">机制</option>
              </select>
              <select className="select" name="difficulty" defaultValue={filters.difficulty}>
                <option value="all">全部难度</option>
                <option value="beginner">新手</option>
                <option value="intermediate">进阶</option>
                <option value="advanced">烧脑</option>
                <option value="expert">专家</option>
              </select>
              <button className="admin-btn primary" type="submit">
                查询
              </button>
              <Link className="admin-btn" href="/scripts">
                重置
              </Link>
            </div>
          </AdminFilterForm>

          {result.error && (
            <div className="admin-inline-alert" role="alert">
              {result.error}
            </div>
          )}

          <AdminScriptDeleteForm returnTo={buildScriptsReturnHref(filters)} />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-checkbox-cell">
                    <AdminScriptSelectAllCheckbox />
                  </th>
                  <th>剧本标题</th>
                  <th>作者</th>
                  <th>题材 / 难度</th>
                  <th>规格</th>
                  <th>内容量</th>
                  <th>生成状态</th>
                  <th>校验</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.scripts.map((script) => (
                  <tr
                    className={script.id === result.selectedScript?.id ? "table-row-selected" : ""}
                    key={script.id}
                  >
                    <td className="table-checkbox-cell">
                      <input
                        aria-label={`选择剧本 ${script.title}`}
                        className="table-checkbox"
                        form={DELETE_FORM_ID}
                        name="scriptIds"
                        type="checkbox"
                        value={script.id}
                      />
                    </td>
                    <td>
                      <div>
                        <b>{script.title}</b>
                        <div className="placeholder-meta">{shortId(script.id)}</div>
                      </div>
                    </td>
                    <td>
                      {script.author ? (
                        <UserCell
                          avatar={avatarText(script)}
                          name={script.author.nickname}
                          sub={script.author.email || shortId(script.author.id)}
                        />
                      ) : (
                        <span className="placeholder-meta">作者不存在</span>
                      )}
                    </td>
                    <td>
                      {genreTag(script.genre)} {difficultyTag(script.difficulty)}
                    </td>
                    <td>
                      {script.playerCount} 人 / {script.durationHours} 小时
                    </td>
                    <td>{script.wordCount.toLocaleString("zh-CN")} 字</td>
                    <td>{statusTag(script.status, script.latestTask?.progressPercent)}</td>
                    <td>{reportTag(script)}</td>
                    <td>{formatDateTime(script.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="link-btn" href={buildScriptHref(filters, script.id)}>
                          详情
                        </Link>
                        <Link className="link-btn" href={`/tasks/generation?scriptId=${script.id}`}>
                          任务
                        </Link>
                        {script.author && (
                          <Link className="link-btn" href={`/users?userId=${script.author.id}`}>
                            作者
                          </Link>
                        )}
                        <AdminScriptDeleteButton scriptId={script.id} />
                      </div>
                    </td>
                  </tr>
                ))}
                {result.scripts.length === 0 && (
                  <tr>
                    <td className="table-empty" colSpan={10}>
                      暂无匹配剧本
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="page-total">
              共 {result.total.toLocaleString("zh-CN")} 条，当前显示 {result.scripts.length} 条
            </span>
          </div>
      </section>

      {result.selectedScript && (
        <DetailModal closeHref={buildScriptsReturnHref(filters)} title="剧本详情">
          <ScriptDetail returnTo={buildScriptsReturnHref(filters)} script={result.selectedScript} />
        </DetailModal>
      )}
    </div>
  );
}

function ScriptDetail({ script, returnTo }: { script: AdminScriptRow; returnTo: string }) {
  const latestTask = script.latestTask;
  const latestReport = script.latestReport;

  return (
    <>
      <DetailPreview
        title="剧本详情"
        rows={[
          ["剧本", script.title],
          ["作者", script.author ? `${script.author.nickname} / ${script.author.email || shortId(script.author.id)}` : "作者不存在"],
          ["作者状态", script.author?.isBanned ? <Tag tone="error" key="banned">已封禁</Tag> : <Tag tone="success" key="active">正常</Tag>],
          ["题材 / 难度", <span key="meta">{genreTag(script.genre)} {difficultyTag(script.difficulty)}</span>],
          ["玩家 / 时长", `${script.playerCount} 人 / ${script.durationHours} 小时`],
          ["剧本状态", statusTag(script.status, latestTask?.progressPercent)],
          ["字数", `${script.wordCount.toLocaleString("zh-CN")} 字`],
          ["内容完整度", stageSummary(script)],
          ["结构统计", `角色 ${script.characterCount} / 幕 ${script.actCount} / 线索 ${script.clueCount} / 时间线 ${script.timelineEventCount}`],
          ["最新任务", latestTask ? `${latestTask.taskType} / ${taskStatusLabel(latestTask.status)} / ${latestTask.progressPercent}%` : "暂无任务"],
          ["任务异常", `运行中 ${script.runningTaskCount} / 失败 ${script.failedTaskCount}`],
          ["最新校验", latestReport ? `${latestReport.reportType}：严重 ${latestReport.severe} / 警告 ${latestReport.warning} / 提示 ${latestReport.hint}` : "暂无校验报告"],
          ["背景设定", script.backgroundSetting || "未填写"],
          ["核心立意", script.coreTheme || script.description || "未填写"],
          ["创建时间", formatDateTime(script.createdAt)],
          ["更新时间", formatDateTime(script.updatedAt)],
        ]}
      />
      <section className="admin-card script-status-card">
        <div className="admin-card-head">
          <div className="admin-card-title">审核状态变更</div>
        </div>
        <div className="admin-card-body">
          <AdminScriptStatusForm
            currentStatus={script.status}
            returnTo={returnTo}
            scriptId={script.id}
          />
        </div>
      </section>
    </>
  );
}

function normalizeFilters(params: SearchParams) {
  return {
    q: params.q?.trim() ?? "",
    status: isScriptStatus(params.status) ? params.status : "all",
    genre: isScriptGenre(params.genre) ? params.genre : "all",
    difficulty: isScriptDifficulty(params.difficulty) ? params.difficulty : "all",
    selectedScriptId: params.scriptId,
  } as const;
}

function buildScriptHref(filters: ReturnType<typeof normalizeFilters>, scriptId: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.genre !== "all") params.set("genre", filters.genre);
  if (filters.difficulty !== "all") params.set("difficulty", filters.difficulty);
  params.set("scriptId", scriptId);

  return `/scripts?${params.toString()}`;
}

function buildScriptsReturnHref(filters: ReturnType<typeof normalizeFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.genre !== "all") params.set("genre", filters.genre);
  if (filters.difficulty !== "all") params.set("difficulty", filters.difficulty);
  const query = params.toString();

  return query ? `/scripts?${query}` : "/scripts";
}

function statusTag(status: ScriptStatus, progress?: number) {
  if (status === "completed") return <Tag tone="success">已完成</Tag>;
  if (status === "archived") return <Tag>已归档</Tag>;
  if (status === "generating") return <Tag tone="info">生成中{typeof progress === "number" ? ` ${progress}%` : ""}</Tag>;
  if (status === "reviewing") return <Tag tone="info">审核中</Tag>;
  if (status === "approved") return <Tag tone="success">已通过</Tag>;
  if (status === "rejected") return <Tag tone="warning">已驳回</Tag>;
  if (status === "taken_down") return <Tag tone="error">已下架</Tag>;
  return <Tag tone="warning">草稿</Tag>;
}

function genreTag(genre: ScriptGenre) {
  const meta: Record<ScriptGenre, { label: string; tone: "default" | "success" | "warning" | "error" | "info" | "purple" }> = {
    hardcore: { label: "硬核", tone: "error" },
    emotion: { label: "情感", tone: "info" },
    horror: { label: "惊悚", tone: "purple" },
    funny: { label: "欢乐", tone: "success" },
    mechanism: { label: "机制", tone: "success" },
  };
  const item = meta[genre];
  return <Tag tone={item.tone}>{item.label}</Tag>;
}

function difficultyTag(difficulty: ScriptDifficulty) {
  const meta: Record<ScriptDifficulty, { label: string; tone: "default" | "warning" | "error" }> = {
    beginner: { label: "新手", tone: "default" },
    intermediate: { label: "进阶", tone: "default" },
    advanced: { label: "烧脑", tone: "warning" },
    expert: { label: "专家", tone: "error" },
  };
  const item = meta[difficulty];
  return <Tag tone={item.tone}>{item.label}</Tag>;
}

function reportTag(script: AdminScriptRow) {
  const report = script.latestReport;
  if (!report) return <Tag>未校验</Tag>;
  if (report.severe > 0) return <Tag tone="error">严重 {report.severe}</Tag>;
  if (report.warning > 0) return <Tag tone="warning">警告 {report.warning}</Tag>;
  return <Tag tone="success">通过</Tag>;
}

function stageSummary(script: AdminScriptRow) {
  const items = [
    script.hasStoryBible ? (script.storyBibleConfirmed ? "设定本已确认" : "设定本待确认") : "无设定本",
    `${script.characterCount} 角色`,
    `${script.characterScriptCount} 角色剧本`,
    script.hasOrganizerManual ? "有主持手册" : "无主持手册",
    script.hasTruthReview ? "有真相复盘" : "无真相复盘",
  ];

  return items.join(" / ");
}

function taskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "等待中",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[status] ?? status;
}

function avatarText(script: AdminScriptRow) {
  return (script.author?.nickname || script.author?.email || "作").slice(0, 1).toUpperCase();
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

function isScriptStatus(value?: string): value is ScriptStatus {
  return (
    value === "draft" ||
    value === "generating" ||
    value === "completed" ||
    value === "archived" ||
    value === "reviewing" ||
    value === "approved" ||
    value === "rejected" ||
    value === "taken_down"
  );
}

function isScriptGenre(value?: string): value is ScriptGenre {
  return value === "hardcore" || value === "emotion" || value === "horror" || value === "funny" || value === "mechanism";
}

function isScriptDifficulty(value?: string): value is ScriptDifficulty {
  return value === "beginner" || value === "intermediate" || value === "advanced" || value === "expert";
}
