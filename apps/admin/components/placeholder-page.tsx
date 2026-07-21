export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <div className="page-sub">{description}</div>
        </div>
      </header>

      <section className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">模块骨架已就绪</div>
          <div className="admin-card-sub">下一阶段会按原型补齐筛选区、表格、抽屉与操作弹窗。</div>
        </div>
        <div className="admin-card-body">
          <div className="placeholder-row">
            <span>实现状态</span>
            <span className="placeholder-meta">待接入真实数据</span>
          </div>
        </div>
      </section>
    </>
  );
}
