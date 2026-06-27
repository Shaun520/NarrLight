/**
 * 主工作区布局（仪表盘）
 *
 * CSS Grid 三宫格：sidebar (248px) + topbar (56px) + main
 * 布局样式见 ./dashboard.css，配色与 class 命名对齐原型 workbench2.html
 *
 * - 服务端组件：校验登录态、加载用户档案与剧本列表
 * - 未登录跳转 /auth/login
 * - 退出登录通过内联 server action 处理
 * - getUser / users / scripts 查询通过 React `cache()` 共享给子页面，避免
 *   子页面（dashboard/page、settings/quota/page 等）重复调用，详见
 *   `lib/queries/dashboard-queries.ts`。
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Clock,
  CreditCard,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Sparkles,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  getCachedUser,
  getCachedProfile,
  getCachedScripts,
} from '@/lib/queries/dashboard-queries';
import {
  DashboardProvider,
} from '@/lib/contexts/dashboard-context';
import { GlobalSearch } from '@/components/common/global-search';
import { NotificationPanel } from '@/components/common/notification-panel';
import { ScriptSwitcher } from '@/components/common/script-switcher';
import { SettingsMenu } from '@/components/common/settings-menu';
import './dashboard.css';
import './responsive.css';

/** 退出登录 server action */
async function handleLogout() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  // 并行查询用户档案与剧本列表（getCached* 已用 React cache 包装，
  // 子页面相同参数调用会命中缓存，避免重复 DB 往返）
  const [profile, scriptsTyped] = await Promise.all([
    getCachedProfile(user.id),
    getCachedScripts(user.id),
  ]);

  const nickname = profile?.nickname || user.email || '创作者';
  const avatarChar = nickname.charAt(0).toUpperCase();
  const quotaUsed = profile?.free_quota_used ?? 0;
  const quotaLimit = profile?.free_quota_limit ?? 10;
  const currentScript = scriptsTyped[0] ?? null;
  // currentScript 为空时所有编辑器子功能链接指向新建剧本页，避免 /scripts/new/<sub> 404
  const editorBase = currentScript
    ? `/editor/${currentScript.id}`
    : '/scripts/new';
  /** 有 currentScript 时拼子路径；无则统一回退到 editorBase，避免访问不存在的子路由 */
  const navHref = (sub: string) =>
    currentScript ? `${editorBase}/${sub}` : editorBase;

  return (
    <div className="app">
      {/* ============ 侧栏抽屉化状态持有者（仅手机断点生效，见 responsive.css）============ */}
      <input type="checkbox" id="sb-toggle" className="sb-toggle-input" aria-hidden="true" />
      {/* ============ 侧边栏 ============ */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">叙</div>
          <div className="brand-text">
            <span className="brand-name">叙光</span>
            <span className="brand-sub">NARRLIGHT · STUDIO</span>
          </div>
        </div>

        <ScriptSwitcher
          scripts={scriptsTyped}
          currentScriptId={currentScript?.id}
        />

        <nav className="nav-group">
          <div className="nav-section-title">创作</div>
          <Link href="/dashboard" className="nav-item">
            <LayoutDashboard />
            <span>概览</span>
          </Link>
          <Link href="/generate" className="nav-item">
            <Sparkles />
            <span>剧本生成</span>
          </Link>
          <Link href="/editor" className="nav-item">
            <FileText />
            <span>剧本编辑</span>
          </Link>

          <div className="nav-section-title">校验</div>
          <Link href={navHref('timeline')} className="nav-item">
            <Clock />
            <span>时间线校验</span>
          </Link>
          <Link href={navHref('validation')} className="nav-item">
            <FlaskConical />
            <span>逻辑校验</span>
          </Link>

          <div className="nav-section-title">物料</div>
          <Link href={navHref('clues')} className="nav-item">
            <CreditCard />
            <span>线索卡管理</span>
          </Link>
          <Link href={navHref('relations')} className="nav-item">
            <Users />
            <span>人物关系</span>
          </Link>
          <Link href={navHref('illustrations')} className="nav-item">
            <ImageIcon />
            <span>插画生成</span>
          </Link>

          <div className="nav-section-title">社区</div>
          <Link href="/community" className="nav-item">
            <MessageCircle />
            <span>创作社区</span>
          </Link>
        </nav>

        <div className="sidebar-foot">
          <div className="avatar">{avatarChar}</div>
          <div className="user-info">
            <div className="user-name">{nickname}</div>
            <Link
              href="/settings/quota"
              className="user-quota"
              title="额度管理"
              aria-label={`额度管理：剩余 ${Math.max(0, quotaLimit - quotaUsed)} 次`}
            >
              免费额度 <b>{Math.max(0, quotaLimit - quotaUsed)}</b>/{quotaLimit}
            </Link>
          </div>
          <form action={handleLogout}>
            <button type="submit" className="icon-btn" title="退出登录" aria-label="退出登录">
              <LogOut />
            </button>
          </form>
        </div>
      </aside>

      {/* ============ 顶栏 ============ */}
      <header className="topbar">
        <label
          htmlFor="sb-toggle"
          className="sb-toggle-btn"
          title="菜单"
          aria-label="切换侧栏菜单"
        >
          <Menu />
        </label>
        <div className="crumb">
          <span>首页</span>
          <span className="sep">/</span>
          <span className="here">{currentScript?.title ?? '工作台'}</span>
        </div>
        <div className="spacer" />
        <GlobalSearch scripts={scriptsTyped} />
        <div className="top-status">
          <span className="dot ok" />
          系统就绪
        </div>
        <NotificationPanel />
        <SettingsMenu />
      </header>

      {/* ============ 主区 ============ */}
      <main className="main">
        <DashboardProvider
          value={{ user, profile, scripts: scriptsTyped }}
        >
          <div className="view active">{children}</div>
        </DashboardProvider>
      </main>
    </div>
  );
}
