"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 手机号 + 验证码共用输入组件
 * 用于登录/注册表单，对齐项目古风视觉（朱砂红主色、纸张背景）
 * - PhoneInput: +86 前缀 + 11 位中国手机号
 * - VerificationCodeInput: 6 位验证码 + 发送按钮 + 60 秒倒计时
 */

/** 中国大陆手机号正则：1[3-9] 开头，共 11 位 */
export const PHONE_REGEX = /^1[3-9]\d{9}$/;

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}

/**
 * 手机号输入框
 * 固定 +86 前缀，仅允许输入数字，最多 11 位
 */
export function PhoneInput({
  value,
  onChange,
  disabled = false,
  id = "phone",
  placeholder = "请输入手机号",
}: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
    onChange(digits);
  };

  return (
    <div className="phone-input">
      <span className="phone-input__prefix">+86</span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        maxLength={11}
        className="phone-input__field"
      />
    </div>
  );
}

interface VerificationCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** 点击「发送验证码」时触发；返回 true 表示发送成功并开始倒计时，false 表示失败 */
  onSend: () => Promise<boolean>;
  /** 是否禁用发送按钮（例如手机号格式不正确） */
  sendDisabled?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** 倒计时秒数，默认 60 */
  countdownSeconds?: number;
}

/**
 * 验证码输入框
 * 6 位数字 + 「发送验证码」按钮 + 60 秒倒计时
 * 倒计时通过 useEffect + setInterval 实现，组件卸载时清理定时器
 */
export function VerificationCodeInput({
  value,
  onChange,
  onSend,
  sendDisabled = false,
  disabled = false,
  id = "code",
  placeholder = "6 位验证码",
  countdownSeconds = 60,
}: VerificationCodeInputProps) {
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件卸载时清理倒计时定时器，避免内存泄漏
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const startCountdown = () => {
    setCountdown(countdownSeconds);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSend = async () => {
    if (countdown > 0 || sending || sendDisabled) return;
    setSending(true);
    try {
      const ok = await onSend();
      if (ok) startCountdown();
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(digits);
  };

  const buttonDisabled = countdown > 0 || sending || sendDisabled;
  const buttonText =
    countdown > 0 ? `${countdown}s 后重发` : sending ? "发送中…" : "发送验证码";

  return (
    <div className="code-input">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        maxLength={6}
        className="code-input__field"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={buttonDisabled}
        className="code-input__send"
      >
        {buttonText}
      </button>
    </div>
  );
}
