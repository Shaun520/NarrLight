import React from "react";
import { Spin } from "antd";

interface LoadingProps {
  tip?: string;
  size?: "small" | "default" | "large";
  fullscreen?: boolean;
}

/**
 * 叙光统一加载状态组件
 */
export function Loading({ tip = "加载中...", size = "default", fullscreen = false }: LoadingProps) {
  if (fullscreen) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spin size={size} tip={tip} />
      </div>
    );
  }

  return <Spin size={size} tip={tip} />;
}
