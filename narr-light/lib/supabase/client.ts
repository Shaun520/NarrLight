import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase Client
 * 用于客户端组件中的数据查询、认证状态读取等操作
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
