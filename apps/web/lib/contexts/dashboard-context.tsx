// Dashboard 数据 Context：提供 user/profile/scripts 给子页面，避免子页面重复查询 DB
'use client';
import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Script } from '@/types';

/** Dashboard 用户档案（与 layout users 表查询字段对齐） */
export interface DashboardProfile {
  id: string;
  nickname: string | null;
  phone: string | null;
  avatar_url: string | null;
  plan_type: string;
  free_quota_used: number;
  free_quota_limit: number;
}

/** Dashboard Context 值：layout 注入，子页面通过 useDashboard() 消费 */
interface DashboardContextValue {
  user: User;
  profile: DashboardProfile | null;
  scripts: Script[];
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: React.ReactNode;
}) {
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
