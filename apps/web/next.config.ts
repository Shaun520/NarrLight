import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents 与 next/headers 在被客户端组件间接引用时存在严格边界检查，
  // 暂时关闭以让构建通过；服务端页面读取 cookies 时仍会被自动标记为动态渲染。
  // cacheComponents: true,
  experimental: {
    optimizePackageImports: [
      'antd',
      'lucide-react',
      '@ant-design/icons',
      '@antv/g6',
    ],
  },
};

export default nextConfig;
