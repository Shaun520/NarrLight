/**
 * 时间轴窗口计算工具（客户端安全，无服务端依赖）
 *
 * 从 extractor.ts 抽离，供 TimelineChart（客户端组件）与 page.tsx 共享。
 * 不依赖 next/headers / supabase，可安全进入客户端 bundle。
 */
import type { TimelineEvent } from './extractor';

/**
 * 根据事件数据自动计算时间轴窗口。
 * - 窗口 = [min(startMinutes), max(endMinutes)]
 * - 前后各留白 30 分钟
 * - 最小窗口 2 小时（120 分钟），不足时向两侧扩展
 * - 事件为空时返回默认窗口 18:00–次日 01:00
 */
export function computeTimeWindow(events: TimelineEvent[]): { start: number; end: number } {
  if (events.length === 0) {
    return { start: 18 * 60, end: 25 * 60 };
  }
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const e of events) {
    if (e.startMinutes < minStart) minStart = e.startMinutes;
    if (e.endMinutes > maxEnd) maxEnd = e.endMinutes;
  }
  let start = minStart - 30;
  let end = maxEnd + 30;
  if (end - start < 120) {
    const mid = (start + end) / 2;
    start = mid - 60;
    end = mid + 60;
  }
  return { start, end };
}
