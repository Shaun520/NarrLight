import type { Metadata } from "next";
import {
  Noto_Serif_SC,
  Courier_Prime,
  ZCOOL_XiaoWei,
  Ma_Shan_Zheng,
  Special_Elite,
} from "next/font/google";
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

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const zcoolXiaowei = ZCOOL_XiaoWei({
  variable: "--font-zcool-xiaowei",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const maShanZheng = Ma_Shan_Zheng({
  variable: "--font-ma-shan-zheng",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  display: "swap",
  subsets: ["latin"],
  weight: "400",
});

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
      <body
        className={`${notoSerifSC.variable} ${courierPrime.variable} ${zcoolXiaowei.variable} ${maShanZheng.variable} ${specialElite.variable} antialiased`}
      >
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
