import { AlertTriangle, CheckCircle2, FileText, RefreshCw, Users } from "lucide-react";

const stats = [
  {
    label: "今日新增用户",
    value: "128",
    trend: "12.6% 较昨日",
    Icon: Users,
  },
  {
    label: "今日生成任务",
    value: "462",
    trend: "成功率 96.4%",
    Icon: CheckCircle2,
  },
  {
    label: "活跃剧本",
    value: "1,284",
    trend: "5.7% 近 7 日",
    Icon: FileText,
  },
  {
    label: "待审核举报",
    value: "8",
    trend: "其中 2 项已超 24 小时",
    Icon: AlertTriangle,
  },
];

const todos = [
  ["待审核剧本", "8 个内容等待处理"],
  ["失败任务", "2 项任务可重试"],
  ["用户申诉", "2 条申诉需要确认"],
];

export default function DashboardPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">工作台</h1>
          <div className="page-sub">上午好，今日平台有 8 项内容待处理。</div>
        </div>
        <button className="admin-btn" type="button">
          <RefreshCw size={14} />
          刷新数据
        </button>
      </header>

      <section className="stat-grid" aria-label="平台概览">
        {stats.map(({ label, value, trend, Icon }) => (
          <article className="stat-card" key={label}>
            <div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
              <div className="stat-trend">{trend}</div>
            </div>
            <div className="stat-icon" aria-hidden="true">
              <Icon size={22} />
            </div>
          </article>
        ))}
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">待办事项</div>
          <div className="admin-card-sub">后续接入真实任务队列与审计操作。</div>
        </div>
        <div className="admin-card-body">
          <div className="placeholder-list">
            {todos.map(([title, meta]) => (
              <div className="placeholder-row" key={title}>
                <span>{title}</span>
                <span className="placeholder-meta">{meta}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
