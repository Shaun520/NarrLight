"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * 密码输入组件
 * 用于登录/注册表单，配合 Supabase Auth 密码登录/注册
 * 支持显示/隐藏密码切换，复用 .auth-input 样式与古风视觉一致
 */

/** 密码最小长度（Supabase Auth 默认要求 6 位） */
export const PASSWORD_MIN_LENGTH = 6;

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** autoComplete 值，注册场景默认 new-password，登录场景传 current-password */
  autoComplete?: string;
}

/**
 * 密码输入框
 * type 在 password / text 间切换，右侧眼睛图标控制显示状态
 */
export function PasswordInput({
  value,
  onChange,
  disabled = false,
  id = "password",
  placeholder = "请输入密码",
  autoComplete = "new-password",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="auth-input password-input__field"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="password-input__toggle"
        tabIndex={-1}
        aria-label={visible ? "隐藏密码" : "显示密码"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
