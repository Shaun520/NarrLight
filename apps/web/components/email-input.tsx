"use client";

/**
 * 邮箱输入组件
 * 用于登录/注册表单，配合 Supabase Auth Email OTP 实现邮箱验证码登录/注册
 * 复用 .auth-input 样式类，与昵称输入框视觉一致
 */

/** 邮箱格式正则：local@domain.tld，禁止空白与连续 @/. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}

/**
 * 邮箱输入框
 * 使用原生 type="email" + inputMode="email" + autoComplete="email"
 * 不做客户端强校验，格式判断交由调用方结合 EMAIL_REGEX 完成
 */
export function EmailInput({
  value,
  onChange,
  disabled = false,
  id = "email",
  placeholder = "请输入邮箱地址",
}: EmailInputProps) {
  return (
    <input
      id={id}
      type="email"
      inputMode="email"
      autoComplete="email"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="auth-input"
    />
  );
}
