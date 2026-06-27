import React from "react";
import { Modal as AntModal } from "antd";

interface ModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onOk?: () => void;
  onCancel?: () => void;
  okText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  width?: number | string;
}

/**
 * 叙光统一弹窗组件
 */
export function Modal({
  open,
  title,
  children,
  onOk,
  onCancel,
  okText = "确认",
  cancelText = "取消",
  confirmLoading = false,
  width = 520,
}: ModalProps) {
  return (
    <AntModal
      title={title}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText={okText}
      cancelText={cancelText}
      confirmLoading={confirmLoading}
      width={width}
    >
      {children}
    </AntModal>
  );
}
