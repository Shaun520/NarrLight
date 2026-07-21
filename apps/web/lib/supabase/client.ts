import { createBrowserClient } from "@supabase/ssr";

/**
 * 浏览器端 Supabase Client
 * 用于客户端组件中的数据查询、认证状态读取等操作
 *
 * 环境变量未配置时返回一个不发起网络请求的占位客户端，
 * 避免 auth-js 自动 _emitInitialSession 时对无效 URL 触发 "fetch failed" 噪音。
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url === "your-supabase-project-url") {
    // 占位客户端：所有方法静默失败，不触发网络请求
    const noop = () => Promise.resolve({ data: null, error: new Error("Supabase 环境变量未配置") });
    const noopUser = () =>
      Promise.resolve({ data: { user: null }, error: new Error("Supabase 环境变量未配置") });
    return {
      auth: {
        getSession: noop,
        getUser: noopUser,
        signInWithPassword: noop,
        signInWithOtp: noop,
        verifyOtp: noop,
        signOut: noop,
        updateUser: noop,
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    } as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, anonKey);
}
