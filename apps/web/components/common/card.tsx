import React from "react";
import { Card as AntCard } from "antd";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  bordered?: boolean;
  hoverable?: boolean;
  className?: string;
  loading?: boolean;
}

/**
 * 叙光统一卡片组件
 */
export function Card({
  title,
  children,
  extra,
  bordered = true,
  hoverable = false,
  className,
  loading = false,
}: CardProps) {
  return (
    <AntCard
      title={title}
      extra={extra}
      bordered={bordered}
      hoverable={hoverable}
      className={className}
      loading={loading}
    >
      {children}
    </AntCard>
  );
}
