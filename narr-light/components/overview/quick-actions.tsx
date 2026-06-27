/**
 * 快捷入口横排
 *
 * 5 个 .quick-action 入口（生成/时间线/逻辑/线索卡/插画）。
 * 整卡 next/link 跳转，沿用原型 .quick-row grid 5 列布局。
 */
import Link from 'next/link';
import {
  Sparkles,
  GitFork,
  FlaskConical,
  CreditCard,
  Image as ImageIcon,
} from 'lucide-react';
import type { OverviewQuickAction, QuickActionIcon } from '@/lib/services/overview-service';

const ICON_MAP: Record<QuickActionIcon, typeof Sparkles> = {
  generate: Sparkles,
  timeline: GitFork,
  logic: FlaskConical,
  clues: CreditCard,
  illust: ImageIcon,
};

interface QuickActionsProps {
  actions: OverviewQuickAction[];
}

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="quick-row">
      {actions.map((a) => {
        const Icon = ICON_MAP[a.icon];
        return (
          <Link key={a.title} href={a.href} className="quick-action">
            <div className="qa-icon">
              <Icon />
            </div>
            <div className="qa-text">
              <div className="qa-title">{a.title}</div>
              <div className="qa-desc">{a.desc}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default QuickActions;
