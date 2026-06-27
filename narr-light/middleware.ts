import { middleware as supabaseMiddleware } from "@/lib/supabase/middleware";
import { hasEnvVars } from "@/lib/utils";
import { NextResponse, type NextRequest } from "next/server";

// 环境变量未配置时跳过 Supabase 中间件逻辑
export async function middleware(request: NextRequest) {
  if (!hasEnvVars) {
    return NextResponse.next({ request });
  }
  return supabaseMiddleware(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
