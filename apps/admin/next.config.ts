import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["antd", "lucide-react", "@ant-design/icons"],
  },
};

export default nextConfig;
