/**
 * 带禁用提示的侧栏导航项
 *
 * 无剧本时点击「时间线校验」「逻辑校验」「线索卡管理」等入口，
 * 提示用户先创建剧本，并跳转到传入的引导地址。
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { App } from 'antd';

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  disabledMessage?: string;
}

export function NavItem({
  href,
  icon,
  label,
  disabled = false,
  disabledMessage = '请先创建或选择一个剧本',
}: NavItemProps) {
  const { message } = App.useApp();
  const router = useRouter();

  if (disabled) {
    return (
      <button
        type="button"
        className="nav-item"
        data-tooltip={label}
        aria-label={label}
        title={label}
        onClick={() => {
          message.info(disabledMessage);
          if (href) router.push(href);
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <Link href={href} className="nav-item" data-tooltip={label} aria-label={label} title={label}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
