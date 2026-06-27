/**
 * 认证相关 Server Actions
 *
 * signOut：清除 Supabase 会话后跳转到首页。
 * 供客户端组件（如设置菜单）通过 form action 调用。
 */
'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** 退出登录：销毁会话并跳转 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
