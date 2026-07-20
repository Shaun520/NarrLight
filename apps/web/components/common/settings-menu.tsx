/**
 * 设置菜单组件（T312）
 *
 * 顶栏设置按钮 + 下拉菜单：
 *   - 「额度管理」→ /settings/quota
 *   - 「账号设置」→ /settings
 *   - 「退出登录」→ 调用 signOut server action，跳转 /
 *   - 点击外部或 ESC 收起
 *
 * 客户端组件：useRef + useEffect 监听 mousedown / keydown。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CreditCard, LogOut, Settings, UserCog } from 'lucide-react';
import { signOut } from '@/lib/actions/auth';

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        title="设置"
        aria-label="设置"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="设置菜单"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 180,
            background: 'var(--paper-lighter)',
            border: '1px solid rgba(138, 28, 28, 0.22)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            overflow: 'hidden',
            padding: '4px 0',
          }}
        >
          <MenuLink href="/settings/quota" icon={<CreditCard size={15} />} label="额度管理" onClick={() => setOpen(false)} />
          <MenuLink href="/settings" icon={<UserCog size={15} />} label="账号设置" onClick={() => setOpen(false)} />
          <div
            style={{
              height: 1,
              background: 'rgba(138, 28, 28, 0.15)',
              margin: '4px 0',
            }}
          />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: '"Noto Serif SC", serif',
                fontSize: 13,
                color: 'var(--blood)',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(138, 28, 28, 0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <LogOut size={15} />
              <span>退出登录</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface MenuLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function MenuLink({ href, icon, label, onClick }: MenuLinkProps) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        color: 'var(--char)',
        textDecoration: 'none',
        fontFamily: '"Noto Serif SC", serif',
        fontSize: 13,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(138, 28, 28, 0.08)';
        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--blood)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--char)';
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
