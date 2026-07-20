"use client";

import { App as AntdApp } from "antd";

/**
 * Ant Design App Provider - Client Component
 *
 * AntdApp 内部使用 Date.now()，必须在客户端渲染。
 * 从 RootLayout（Server Component）中提取出来以避免预渲染错误。
 */
export function AntdProvider({ children }: { children: React.ReactNode }) {
  return <AntdApp>{children}</AntdApp>;
}
