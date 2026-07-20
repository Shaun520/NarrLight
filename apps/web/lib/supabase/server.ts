import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 服务端 Supabase Client
 * 用于 Server Components、Server Actions、Route Handlers 中的数据操作
 * 每次调用必须创建新实例，禁止缓存为全局变量（Fluid compute 兼容）
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 中调用 setAll 时可忽略此异常
            // 用户会话刷新由中间件代理处理
          }
        },
      },
    },
  );
}
