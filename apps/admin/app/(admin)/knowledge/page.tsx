import Link from "next/link";
import { AdminFilterForm } from "@/components/admin-filter-form";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_MODULE_TYPES,
  KNOWLEDGE_STAGES,
  type KnowledgeCategory,
  type KnowledgeStage,
} from "@narrlight/shared";
import { PageHeader, Tag } from "@/components/admin-static";
import { getKnowledgeItem, getKnowledgeItems, getKnowledgeUsageSnapshot } from "@/lib/services/knowledge";
import {
  deleteKnowledgeItem,
  saveKnowledgeItem,
  toggleKnowledgeItem,
} from "./actions";
import { AdminClearKnowledgeRecordsButton } from "@/components/admin-clear-knowledge-records-button";

type SearchParams = {
  q?: string;
  category?: string;
  stage?: string;
  enabled?: string;
  itemId?: string;
  mode?: string;
  saved?: string;
  recordsCleared?: string;
};

const GENRES = ["hardcore", "emotion", "horror", "funny", "mechanism"] as const;
const DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"] as const;

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [{ items, error }, selectedItem, usageSnapshot] = await Promise.all([
    getKnowledgeItems(params),
    params.itemId ? getKnowledgeItem(params.itemId) : Promise.resolve(null),
    getKnowledgeUsageSnapshot(),
  ]);
  const modalOpen = params.mode === "new" || Boolean(selectedItem);
  const hasUsageRecords = usageSnapshot.usages.length > 0 || usageSnapshot.reports.length > 0;

  return (
    <div className="page-stack">
      <PageHeader
        title="创作知识库"
        description="管理规则、模式、反例和质检标准，供生成阶段按需引用。"
      />

      {params.saved === "1" && <div className="admin-inline-alert">知识条目已保存。</div>}
      {params.recordsCleared === "1" && <div className="admin-inline-alert">引用和质检记录已清空。</div>}
      {error && <div className="admin-inline-alert" role="alert">{error}</div>}
      {usageSnapshot.error && <div className="admin-inline-alert" role="alert">{usageSnapshot.error}</div>}

      <section className="admin-card">
        <AdminFilterForm action="/knowledge">
          <div className="toolbar-left">
            <input className="input input-wide" name="q" placeholder="搜索标题或内容" defaultValue={params.q ?? ""} />
            <select className="select" name="category" defaultValue={params.category ?? "all"}>
              <option value="all">全部类型</option>
              {KNOWLEDGE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{categoryLabel(category)}</option>
              ))}
            </select>
            <select className="select" name="stage" defaultValue={params.stage ?? "all"}>
              <option value="all">全部阶段</option>
              {KNOWLEDGE_STAGES.map((stage) => (
                <option key={stage} value={stage}>{stageLabel(stage)}</option>
              ))}
            </select>
            <select className="select" name="enabled" defaultValue={params.enabled ?? "all"}>
              <option value="all">全部状态</option>
              <option value="true">已启用</option>
              <option value="false">已停用</option>
            </select>
            <button className="admin-btn primary" type="submit">查询</button>
            <Link className="admin-btn" href="/knowledge">重置</Link>
          </div>
          <div className="toolbar-right">
            <Link className="admin-btn primary" href={buildNewHref(params)}>新增</Link>
          </div>
        </AdminFilterForm>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>知识</th>
                <th>类型</th>
                <th>阶段</th>
                <th>题材</th>
                <th>权重</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className={item.id === selectedItem?.id ? "table-row-selected" : ""} key={item.id}>
                  <td>
                    <b>{item.title}</b>
                    <div className="placeholder-meta">{item.content.slice(0, 60)}</div>
                  </td>
                  <td>{categoryLabel(item.category)}</td>
                  <td>{stageLabel(item.stage)}</td>
                  <td>{item.genre ?? "通用"}</td>
                  <td>{item.weight}</td>
                  <td>{item.enabled ? <Tag tone="success">启用</Tag> : <Tag>停用</Tag>}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="link-btn" href={buildItemHref(params, item.id)}>编辑</Link>
                      <form action={toggleKnowledgeItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="enabled" value={item.enabled ? "false" : "true"} />
                        <button className="link-btn" type="submit">{item.enabled ? "停用" : "启用"}</button>
                      </form>
                      <form action={deleteKnowledgeItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="link-btn danger" type="submit">删除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="table-empty" colSpan={7}>暂无知识条目</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-form-title">
            <div className="modal-head">
              <div>
                <div className="modal-title" id="knowledge-form-title">
                  {selectedItem ? "编辑知识条目" : "新增知识条目"}
                </div>
                <div className="admin-card-sub">一期优先录入高质量规则，不录入完整剧本文本。</div>
              </div>
              <Link className="link-btn" href={buildCloseHref(params)}>关闭</Link>
            </div>
            <div className="modal-body">
              <KnowledgeForm item={selectedItem} />
            </div>
          </div>
        </div>
      )}

      <section className="admin-card">
        <div className="admin-card-head knowledge-usage-head">
          <div>
            <div className="admin-card-title">最近引用和质检</div>
            <div className="admin-card-sub">确认生成阶段实际使用了哪些规则。</div>
          </div>
          <AdminClearKnowledgeRecordsButton disabled={!hasUsageRecords} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>创作者</th>
                <th>剧本</th>
                <th>任务</th>
                <th>阶段</th>
                <th>模块</th>
                <th>内容 / 质检</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {usageSnapshot.usages.map((usage) => (
                <tr key={`usage-${usage.id}`}>
                  <td><Tag tone="info">引用</Tag></td>
                  <td>
                    <b>{usage.creatorName}</b>
                    {usage.creatorEmail && <div className="placeholder-meta">{usage.creatorEmail}</div>}
                  </td>
                  <td>{usage.scriptId ? <Link className="link-btn" href={`/scripts?scriptId=${usage.scriptId}`}>{usage.scriptTitle}</Link> : usage.scriptTitle}</td>
                  <td>{usage.generationTaskId ? <Link className="link-btn" href={`/tasks/generation?taskId=${usage.generationTaskId}`}>{usage.taskType ?? "生成任务"}</Link> : "未记录"}</td>
                  <td>{stageLabel(usage.stage)}</td>
                  <td>{moduleTypeLabel(usage.moduleType)}</td>
                  <td>{usage.knowledgeTitle} / {usage.usageReason || "阶段规则引用"}</td>
                  <td>{formatDateTime(usage.createdAt)}</td>
                </tr>
              ))}
              {usageSnapshot.reports.map((report) => (
                <tr key={`report-${report.id}`}>
                  <td><Tag tone={report.rewriteRequired ? "warning" : "success"}>质检</Tag></td>
                  <td>
                    <b>{report.creatorName}</b>
                    {report.creatorEmail && <div className="placeholder-meta">{report.creatorEmail}</div>}
                  </td>
                  <td>{report.scriptId ? <Link className="link-btn" href={`/scripts?scriptId=${report.scriptId}`}>{report.scriptTitle}</Link> : report.scriptTitle}</td>
                  <td>{report.generationTaskId ? <Link className="link-btn" href={`/tasks/generation?taskId=${report.generationTaskId}`}>{report.taskType ?? "生成任务"}</Link> : "未记录"}</td>
                  <td>{stageLabel(report.stage)}</td>
                  <td>{moduleTypeLabel(report.moduleType)}</td>
                  <td>
                    <div className="quality-summary">
                      {riskTag(report.riskLevel)}
                      <span>分数 {report.score}</span>
                      <span>{report.rewriteRequired ? "建议重写" : "无需重写"}</span>
                    </div>
                    <div className="placeholder-meta">{issueSummary(report.issues)}</div>
                  </td>
                  <td>{formatDateTime(report.createdAt)}</td>
                </tr>
              ))}
              {!hasUsageRecords && (
                <tr>
                  <td className="table-empty" colSpan={8}>暂无引用或质检记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KnowledgeForm({ item }: { item: Awaited<ReturnType<typeof getKnowledgeItem>> }) {
  return (
    <form className="knowledge-form" action={saveKnowledgeItem}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="knowledge-field knowledge-field-full">
        <span>标题</span>
        <input className="input" name="title" required placeholder="例如：角色本信息释放规则" defaultValue={item?.title ?? ""} />
      </label>
      <label className="knowledge-field knowledge-field-full">
        <span>内容</span>
        <textarea
          className="textarea knowledge-content-input"
          name="content"
          required
          placeholder="只录入规则、模式、反例或质检标准，不录入完整剧本文本。"
          defaultValue={item?.content ?? ""}
        />
      </label>
      <div className="knowledge-grid-3">
        <label className="knowledge-field">
          <span>类型</span>
          <select className="select" name="category" defaultValue={item?.category ?? "structure_rule"}>
            {KNOWLEDGE_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
          </select>
        </label>
        <label className="knowledge-field">
          <span>阶段</span>
          <select className="select" name="stage" defaultValue={item?.stage ?? "case_core"}>
            {KNOWLEDGE_STAGES.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
          </select>
        </label>
        <label className="knowledge-field">
          <span>模块</span>
          <select className="select" name="moduleType" defaultValue={item?.moduleType ?? "case_core"}>
            {KNOWLEDGE_MODULE_TYPES.map((moduleType) => (
              <option key={moduleType} value={moduleType}>{moduleTypeLabel(moduleType)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="knowledge-grid-2">
        <label className="knowledge-field"><span>题材</span><select className="select" name="genre" defaultValue={item?.genre ?? ""}><option value="">通用</option>{GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select></label>
        <label className="knowledge-field"><span>难度</span><select className="select" name="difficulty" defaultValue={item?.difficulty ?? ""}><option value="">通用</option>{DIFFICULTIES.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}</select></label>
      </div>
      <div className="knowledge-grid-3">
        <label className="knowledge-field"><span>最少人数</span><input className="input" min={1} max={12} name="playerCountMin" type="number" defaultValue={item?.playerCountMin ?? ""} /></label>
        <label className="knowledge-field"><span>最多人数</span><input className="input" min={1} max={12} name="playerCountMax" type="number" defaultValue={item?.playerCountMax ?? ""} /></label>
        <label className="knowledge-field"><span>权重</span><input className="input" min={0} max={1000} name="weight" type="number" defaultValue={item?.weight ?? 100} /></label>
      </div>
      <div className="knowledge-form-actions">
        <label className="checkbox-row"><input name="enabled" type="checkbox" defaultChecked={item?.enabled ?? true} /><span>启用</span></label>
        <button className="admin-btn primary" type="submit">保存</button>
      </div>
    </form>
  );
}

function buildNewHref(params: SearchParams) {
  const next = buildListParams(params);
  next.set("mode", "new");
  return `/knowledge?${next.toString()}`;
}

function buildItemHref(params: SearchParams, itemId: string) {
  const next = buildListParams(params);
  next.set("itemId", itemId);
  return `/knowledge?${next.toString()}`;
}

function buildCloseHref(params: SearchParams) {
  const next = buildListParams(params);
  const query = next.toString();
  return query ? `/knowledge?${query}` : "/knowledge";
}

function buildListParams(params: SearchParams) {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (params.category) next.set("category", params.category);
  if (params.stage) next.set("stage", params.stage);
  if (params.enabled) next.set("enabled", params.enabled);
  return next;
}

function categoryLabel(category: KnowledgeCategory | string) {
  const labels: Record<string, string> = {
    structure_rule: "结构规则",
    character_pattern: "角色模式",
    clue_pattern: "线索模式",
    timeline_pattern: "时间线模式",
    dm_flow_rule: "DM 流程",
    anti_novelization_rule: "反小说化",
    quality_metric: "质检标准",
    anti_pattern: "反例",
  };
  return labels[category] ?? category;
}

function stageLabel(stage: KnowledgeStage | string) {
  const labels: Record<string, string> = {
    brief: "立项",
    case_core: "案件骨架",
    characters: "角色",
    clues: "线索",
    acts: "分幕",
    player_script: "玩家本",
    dm_manual: "DM 手册",
    review: "质检",
  };
  return labels[stage] ?? stage;
}

function moduleTypeLabel(moduleType: string) {
  const labels: Record<string, string> = {
    case_core: "案件骨架",
    characters: "角色设定",
    clues: "线索卡",
    acts: "分幕结构",
    player_script: "玩家本",
    dm_manual: "DM 手册",
    truth_review: "真相复盘",
    quality_check: "质检规则",
  };
  return labels[moduleType] ?? moduleType;
}

function riskTag(riskLevel: string) {
  const labels: Record<string, string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险",
  };
  const tone = riskLevel === "high" ? "error" : riskLevel === "medium" ? "warning" : "success";
  return <Tag tone={tone}>{labels[riskLevel] ?? riskLevel}</Tag>;
}

function issueSummary(issues: unknown) {
  if (!Array.isArray(issues) || issues.length === 0) return "未发现明显小说化问题";
  return issues
    .map((issue) => {
      if (!issue || typeof issue !== "object") return "";
      const message = "message" in issue ? issue.message : "";
      return typeof message === "string" ? message : "";
    })
    .filter(Boolean)
    .join("；") || "存在风险项，请查看原始质检数据";
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
