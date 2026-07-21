"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  badge?: number;
};

const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "概览",
    items: [{ href: "/dashboard", label: "工作台", Icon: LayoutDashboard }],
  },
  {
    title: "业务管理",
    items: [
      { href: "/users", label: "用户管理", Icon: Users },
      { href: "/scripts", label: "剧本管理", Icon: BookOpen, badge: 8 },
      { href: "/tasks/generation", label: "生成任务", Icon: Activity },
      { href: "/tasks/illustration", label: "插画任务", Icon: FileText },
    ],
  },
  {
    title: "审核运营",
    items: [
      { href: "/moderation", label: "社区审核", Icon: ShieldAlert, badge: 5 },
      { href: "/analytics", label: "数据看板", Icon: BarChart3 },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/system", label: "系统配置", Icon: Settings },
      { href: "/audit", label: "审计日志", Icon: ClipboardList },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = navSections
    .flatMap((section) => section.items)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/dashboard">
          <span className="admin-brand-mark">叙</span>
          <span>
            <span className="admin-brand-name">叙光 Admin</span>
            <span className="admin-brand-sub">OPERATIONS</span>
          </span>
        </Link>

        <nav className="admin-nav" aria-label="后台导航">
          {navSections.map((section) => (
            <div className="admin-nav-section" key={section.title}>
              <div className="admin-nav-title">{section.title}</div>
              {section.items.map(({ href, label, Icon, badge }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    className={`admin-nav-item${active ? " active" : ""}`}
                    href={href}
                    key={href}
                  >
                    <Icon className="admin-nav-icon" aria-hidden="true" />
                    <span>{label}</span>
                    {typeof badge === "number" && (
                      <span className="admin-nav-badge" aria-label={`${label}待处理 ${badge} 项`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <div className="admin-avatar">管</div>
          <div>
            <div className="admin-user-name">超级管理员</div>
            <div className="admin-user-role">super_admin</div>
          </div>
        </div>
      </aside>

      <header className="admin-topbar">
        <div className="admin-breadcrumb">{current?.label ?? "工作台"}</div>
        <div className="admin-topbar-spacer" />
        <input
          className="admin-topbar-search"
          aria-label="全局搜索"
          placeholder="搜索用户、剧本或任务"
        />
      </header>

      <main className="admin-main">{children}</main>
    </div>
  );
}
