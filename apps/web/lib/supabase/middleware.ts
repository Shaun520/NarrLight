import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase Auth 代理（原 middleware）
 * 保护需要认证的路由，刷新过期的会话 Token
 * Next.js 16 起 middleware 约定已更名为 proxy，此函数被 proxy.ts 调用
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 刷新会话以保持活跃状态。
  // 网络异常（如代理证书错误）时降级为未登录，避免级联导致 React 内部错误。
  let user: null | { id: string } = null;
  try {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u as { id: string } | null;
  } catch {
    user = null;
  }

  // 路由守卫逻辑：
  // 1. 公开路由：/、/auth/login、/auth/sign-up、/auth/forgot-password 等
  // 2. 受保护路由：/dashboard、/generate、/editor、/scripts、/community、/settings
  // 3. 未登录访问受保护路由 → redirect /auth/login
  // 4. 已登录访问 / → redirect /dashboard（推广页对已登录用户无意义）
  // 5. 已登录访问 /auth/login、/auth/sign-up → redirect /dashboard
  // (dashboard) 为路由组不进 URL，实际路径为 /dashboard、/generate、/community、/editor、/scripts、/settings
  const protectedPaths = ["/dashboard", "/editor", "/scripts", "/generate", "/community", "/settings"];
  const isIllustrationMarketPath = /^\/editor\/[^/]+\/illustrations\/market$/.test(
    request.nextUrl.pathname,
  );
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + "/")
  ) && !isIllustrationMarketPath;

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // 已登录用户访问推广页 / 时重定向到工作台概览
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // 已登录用户访问认证页面时重定向到工作台概览
  if (user && request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
