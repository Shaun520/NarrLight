import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Suspense } from "react";
import { AntdProvider } from "@/components/common/antd-provider";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "叙光 - AI 驱动剧本杀创作平台",
  description:
    "用 AI 解决剧本杀行业「创作门槛高、生产周期长、美术成本高、逻辑校验难」四大痛点",
};


/** Ant Design 主题配置 - 与原型朱砂红配色对齐 */
const antdTheme = {
  token: {
    colorPrimary: "#8a1c1c",
    borderRadius: 4,
    fontFamily: 'var(--font-noto-serif-sc), "Noto Serif SC", serif',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-vars antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConfigProvider locale={zhCN} theme={antdTheme}>
            <Suspense fallback={null}>
              <AntdProvider>{children}</AntdProvider>
            </Suspense>
          </ConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
