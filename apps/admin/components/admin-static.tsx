import type { ReactNode } from "react";
import { Download, Filter, RefreshCw, Save } from "lucide-react";
import Link from "next/link";

type TagTone = "default" | "success" | "warning" | "error" | "info" | "purple";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <div className="page-sub">{description}</div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Toolbar({
  search,
  filters = [],
  actions,
}: {
  search: string;
  filters?: string[];
  actions?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <input className="input" placeholder={search} />
        {filters.map((filter) => (
          <select className="select" key={filter} defaultValue={filter}>
            <option>{filter}</option>
          </select>
        ))}
        <button className="admin-btn primary" type="button">
          查询
        </button>
        <button className="admin-btn" type="button">
          重置
        </button>
      </div>
      {actions && <div className="toolbar-right">{actions}</div>}
    </div>
  );
}

export function AdminTable({
  headers,
  rows,
  total,
}: {
  headers: string[];
  rows: ReactNode[][];
  total: string;
}) {
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span className="page-total">{total}</span>
      </div>
    </>
  );
}

export function Tag({ tone = "default", children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function RowActions({ actions }: { actions: Array<{ label: string; danger?: boolean }> }) {
  return (
    <div className="row-actions">
      {actions.map((action) => (
        <button className={`link-btn${action.danger ? " danger" : ""}`} key={action.label} type="button">
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function UserCell({
  avatar,
  name,
  sub,
}: {
  avatar: string;
  name: string;
  sub?: string;
}) {
  return (
    <div className="user-cell">
      <span className="avatar-sm">{avatar}</span>
      <span>
        <b>{name}</b>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

export function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string; trend: string; tone?: TagTone }>;
}) {
  return (
    <section className="stat-grid">
      {items.map((item) => (
        <article className="stat-card" key={item.label}>
          <div>
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
            <div className="stat-trend">{item.trend}</div>
          </div>
          <span className={`stat-dot stat-dot-${item.tone ?? "info"}`} />
        </article>
      ))}
    </section>
  );
}

export function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div className="admin-card-title">{title}</div>
        {sub && <div className="admin-card-sub">{sub}</div>}
      </div>
      <div className="admin-card-body">{children}</div>
    </section>
  );
}

export function DetailPreview({
  title,
  sub = "详情信息",
  rows,
}: {
  title: string;
  sub?: string;
  rows: Array<[string, ReactNode]>;
}) {
  return (
    <section className="detail-section">
      <div className="detail-section-head">
        <div className="admin-card-title">{title}</div>
        {sub && <div className="admin-card-sub">{sub}</div>}
      </div>
      <dl className="desc-list">
        {rows.map(([label, value]) => (
          <div className="desc-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DetailModal({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop detail-modal-backdrop" role="presentation">
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
        <div className="modal-head">
          <div className="modal-title" id="detail-modal-title">
            {title}
          </div>
          <Link className="admin-btn" href={closeHref}>
            关闭
          </Link>
        </div>
        <div className="modal-body detail-modal-body">{children}</div>
      </section>
    </div>
  );
}

export function ConfigCard({
  logo,
  name,
  desc,
  enabled = true,
  fields,
}: {
  logo: string;
  name: string;
  desc: string;
  enabled?: boolean;
  fields: Array<[string, string]>;
}) {
  return (
    <section className="admin-card config-card">
      <div className="config-head">
        <div className="provider">
          <span className="provider-logo">{logo}</span>
          <span>
            <b>{name}</b>
            <small>{desc}</small>
          </span>
        </div>
        <span className={`switch${enabled ? " on" : ""}`} />
      </div>
      {fields.map(([label, value]) => (
        <label className="config-field" key={label}>
          <span>{label}</span>
          <input className="input" value={value} readOnly />
        </label>
      ))}
    </section>
  );
}

export function Bars({
  items,
}: {
  items: Array<{ label: string; value: string; height: number; tone: TagTone }>;
}) {
  return (
    <div className="bar-chart" aria-label="静态柱状图">
      {items.map((item) => (
        <div className="bar-group" key={item.label}>
          <div className={`bar bar-${item.tone}`} style={{ height: `${item.height}%` }}>
            <span className="bar-value">{item.value}</span>
          </div>
          <span className="bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ExportButton() {
  return (
    <button className="admin-btn" type="button">
      <Download size={14} />
      导出
    </button>
  );
}

export function FilterButton({ children = "审核队列" }: { children?: ReactNode }) {
  return (
    <button className="admin-btn primary" type="button">
      <Filter size={14} />
      {children}
    </button>
  );
}

export function RefreshButton() {
  return (
    <button className="admin-btn" type="button">
      <RefreshCw size={14} />
      刷新
    </button>
  );
}

export function SaveButton() {
  return (
    <button className="admin-btn primary" type="button">
      <Save size={14} />
      保存变更
    </button>
  );
}

/**
 * 分页组件。
 * 基于 searchParams 生成页码链接，保留其他筛选参数；Server Component 友好。
 * baseHref: 不含 page 参数的查询字符串前缀，如 "/tasks/generation?q=foo&status=failed"
 * total: 总条数；page: 当前页（1-based）；pageSize: 每页条数
 */
export function Pagination({
  baseHref,
  total,
  page,
  pageSize,
}: {
  baseHref: string;
  total: number;
  page: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  if (total === 0) return null;

  const pageHref = (p: number) => {
    const separator = baseHref.includes("?") ? "&" : "?";
    return `${baseHref}${separator}page=${p}`;
  };

  // 生成页码：始终显示首页、末页、当前页前后 2 页，省略号用 … 占位
  const pageNumbers: Array<number | "ellipsis"> = [];
  const add = (p: number | "ellipsis") => pageNumbers.push(p);
  add(1);
  if (currentPage - 2 > 2) add("ellipsis");
  for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
    add(p);
  }
  if (currentPage + 2 < totalPages - 1) add("ellipsis");
  if (totalPages > 1) add(totalPages);

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="pagination">
      <span className="page-total">
        共 {total.toLocaleString("zh-CN")} 条，当前显示 {from.toLocaleString("zh-CN")}-
        {to.toLocaleString("zh-CN")} 条
      </span>
      <div className="page-btns">
        {currentPage > 1 && (
          <a className="page-btn" href={pageHref(currentPage - 1)} aria-label="上一页">
            ‹
          </a>
        )}
        {pageNumbers.map((p, index) =>
          p === "ellipsis" ? (
            <span className="page-ellipsis" key={`ellipsis-${index}`}>
              …
            </span>
          ) : (
            <a
              aria-current={p === currentPage ? "page" : undefined}
              className={`page-btn${p === currentPage ? " active" : ""}`}
              href={pageHref(p)}
              key={p}
            >
              {p}
            </a>
          ),
        )}
        {currentPage < totalPages && (
          <a className="page-btn" href={pageHref(currentPage + 1)} aria-label="下一页">
            ›
          </a>
        )}
      </div>
    </div>
  );
}
