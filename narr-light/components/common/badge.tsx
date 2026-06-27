import React from "react";
import { Badge as AntBadge } from "antd";

interface BadgeProps {
  count?: number;
  children?: React.ReactNode;
  status?: "success" | "processing" | "default" | "error" | "warning";
  text?: string;
  color?: string;
}

/**
 * 叙光统一徽标组件
 */
export function Badge({ count, children, status, text, color }: BadgeProps) {
  return (
    <AntBadge count={count} showZero status={status} text={text} color={color}>
      {children}
    </AntBadge>
  );
}
