// 营销页面布局（无侧栏顶栏，极简）
// 仅渲染 children，用于推广页等营销页面
// 注意：(marketing) 为路由组，不进入 URL；此布局仅对 (marketing) 组内页面生效

import type { ReactNode } from "react";

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
