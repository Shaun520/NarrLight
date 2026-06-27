/**
 * Dashboard 共享查询（React `cache()` 包装）
 *
 * 用途：消除 layout 与子页面（dashboard/page、settings/quota/page 等）
 * 在同一服务端渲染流程中对 users / scripts 表以及 `getUser()` 的重复查询。
 *
 * 设计要点：
 * - React `cache()` 仅在同一 server request 内有效，跨请求不共享；
 * - layout 与 page 在同一 render pass 中渲染，首次调用执行查询、后续
 *   相同参数的调用直接命中缓存，避免子页面重复 DB 往返；
 * - `getUser()` 虽为 JWT 本地验证（非 DB 查询），仍统一缓存以保持调用
 *   方式一致，并便于后续若改为 DB 查询时无需改动调用方。
 *
 * 注意：调用方仍需保留 `if (!user) redirect('/auth/login')` 鉴权跳转，
 * cache 只复用结果不改变鉴权语义。
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { DashboardProfile } from '@/lib/contexts/dashboard-context';
import type { Script } from '@/types';

/** scripts 表查询返回的原始 row 形状（与 layout 字段对齐） */
interface ScriptRow {
  id: string;
  title: string;
  genre: Script['genre'];
  player_count: number;
  duration_hours: number;
  difficulty: Script['difficulty'];
  status: Script['status'];
  word_count: number | null;
  updated_at: string | null;
}

/** 缓存 `supabase.auth.getUser()`：JWT 本地验证，layout / 子页面共享结果 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * 缓存 users 表查询：layout 已查过的子页面命中缓存，避免重复查询。
 * 返回字段与 DashboardProfile 对齐，便于直接复用。
 */
export const getCachedProfile = cache(
  async (userId: string): Promise<DashboardProfile | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('users')
      .select(
        'id, nickname, phone, avatar_url, plan_type, free_quota_used, free_quota_limit',
      )
      .eq('id', userId)
      .maybeSingle();
    return data as DashboardProfile | null;
  },
);

/**
 * 缓存 scripts 表查询并映射为 camelCase Script[]：
 * layout 已查过的子页面命中缓存，避免重复查询 scripts 表。
 * 映射逻辑与原 layout 中的 scriptsTyped 一致，便于直接传入
 * overviewService.getOverviewData(userId, scripts) 复用。
 */
export const getCachedScripts = cache(
  async (userId: string): Promise<Script[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('scripts')
      .select(
        'id, title, genre, player_count, duration_hours, difficulty, status, word_count, updated_at',
      )
      .eq('author_id', userId)
      .order('updated_at', { ascending: false });
    if (!data) return [];
    return (data as ScriptRow[]).map((row) => ({
      id: row.id,
      authorId: userId,
      title: row.title,
      description: '',
      genre: row.genre,
      playerCount: row.player_count,
      durationHours: row.duration_hours,
      difficulty: row.difficulty,
      backgroundSetting: '',
      coreTheme: '',
      status: row.status,
      wordCount: row.word_count ?? 0,
      createdAt: '',
      updatedAt: row.updated_at ?? '',
    }));
  },
);
