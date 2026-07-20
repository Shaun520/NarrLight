/**
 * 内容违规拦截弹窗
 *
 * 当合规预检命中敏感词或分级不合规时，中断生成并弹出此窗，
 * 展示拦截原因与修改建议。基于 common/Modal（antd 封装）。
 */
'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/common/modal';

export interface ContentBlockedModalProps {
  open: boolean;
  onClose: () => void;
  /** 拦截原因 */
  reason: string;
  /** 修改建议 */
  suggestion: string;
}

export function ContentBlockedModal({
  open,
  onClose,
  reason,
  suggestion,
}: ContentBlockedModalProps) {
  return (
    <Modal
      open={open}
      title="内容合规拦截"
      onCancel={onClose}
      onOk={onClose}
      okText="我去修改"
      cancelText="关闭"
      width={520}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <ShieldAlert
          size={28}
          style={{ color: 'var(--blood)', flexShrink: 0, marginTop: 2 }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8,
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlertTriangle size={14} />
            检测到不合规内容，生成已中断
          </div>
          <div style={{ fontSize: 13, color: 'var(--char)', lineHeight: 1.7 }}>
            <div style={{ marginBottom: 6 }}>
              <b>原因：</b>
              {reason}
            </div>
            <div>
              <b>建议：</b>
              {suggestion}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
