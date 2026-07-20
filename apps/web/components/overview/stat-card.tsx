/**
 * 行动型统计卡
 *
 * 左侧色块图标（.stat-icon si-*）+ 中间数值/标签/趋势 + 右侧 › 箭头。
 * 整卡可点击跳转（next/link），点击语义与原型 data-goto 一致。
 */
import Link from 'next/link';
import { AlertTriangle, CheckSquare, TrendingUp, CalendarCheck } from 'lucide-react';
import type { OverviewStatCard, StatIconKind } from '@/lib/services/overview-service';

const ICON_MAP: Record<StatIconKind, typeof AlertTriangle> = {
  err: AlertTriangle,
  warn: CheckSquare,
  ok: CalendarCheck,
  info: TrendingUp,
};

interface StatCardListProps {
  cards: OverviewStatCard[];
}

export function StatCardList({ cards }: StatCardListProps) {
  return (
    <div className="stat-grid">
      {cards.map((card) => {
        const Icon = ICON_MAP[card.icon];
        return (
          <Link key={card.label} href={card.href} className="stat-card stat-action">
            <div className={`stat-icon si-${card.icon}`}>
              <Icon />
            </div>
            <div className="stat-main">
              <div className="stat-label">{card.label}</div>
              <div className="stat-value">
                {card.value}
                {card.unit ? <small> {card.unit}</small> : null}
              </div>
              <div className={`stat-trend${card.trendDown ? ' down' : ''}`}>{card.trend}</div>
            </div>
            <div className="stat-arrow">›</div>
          </Link>
        );
      })}
    </div>
  );
}

export default StatCardList;
