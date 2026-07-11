/**
 * 编辑器重定向页 - /editor 自动跳转到最近剧本或生成页
 *
 * 路由：/editor
 *
 * 服务端组件：解决侧栏「剧本编辑」链接 /editor 的 404 问题。
 *   - 未登录跳转 /auth/login
 *   - 查询用户最近编辑的剧本（按 updated_at 倒序），命中则跳转 /editor/[scriptId]
 *   - 无剧本则跳转 /generate 引导用户创建
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function EditorRedirectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // 查询用户最近编辑的剧本
  const { data: scripts } = await supabase
    .from('scripts')
    .select('id')
    .eq('author_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (scripts && scripts.length > 0) {
    redirect(`/editor/${scripts[0].id}`);
  } else {
    // 无剧本时引导用户去生成页创建
    redirect('/generate');
  }
}
