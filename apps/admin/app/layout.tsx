import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "叙光 Admin",
  description: "叙光后台管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
