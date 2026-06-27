import React from "react";
import { Empty as AntEmpty } from "antd";

interface EmptyProps {
  description?: string;
  imageStyle?: React.CSSProperties;
}

/**
 * 叙光统一空状态组件
 */
export function Empty({ description = "暂无数据", imageStyle }: EmptyProps) {
  return <AntEmpty description={description} imageStyle={imageStyle} />;
}
