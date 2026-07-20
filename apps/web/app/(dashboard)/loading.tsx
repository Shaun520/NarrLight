/**
 * (dashboard) 布局级加载骨架 (T402)
 * 覆盖所有 (dashboard) 下未提供独立 loading.tsx 的子路由跳转反馈。
 */
import { DashboardSkeleton } from '@/components/common/loading-skeleton';

export default function Loading() {
  return <DashboardSkeleton />;
}
