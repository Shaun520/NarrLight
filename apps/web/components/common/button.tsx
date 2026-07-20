import React from "react";
import { Button as AntButton } from "antd";

interface ButtonProps {
  children: React.ReactNode;
  type?: "primary" | "default" | "dashed" | "link" | "text";
  size?: "small" | "middle" | "large";
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  danger?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 叙光统一按钮组件
 * 封装 Ant Design Button，保持全局样式一致性
 */
export function Button({
  children,
  type = "default",
  size = "middle",
  loading = false,
  disabled = false,
  block = false,
  danger = false,
  onClick,
  className,
}: ButtonProps) {
  return (
    <AntButton
      type={type}
      size={size}
      loading={loading}
      disabled={disabled}
      block={block}
      danger={danger}
      onClick={onClick}
      className={className}
    >
      {children}
    </AntButton>
  );
}
