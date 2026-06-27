"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  PHONE_REGEX,
  PhoneInput,
  VerificationCodeInput,
} from "@/components/phone-input";

/**
 * 登录表单 - 手机号 + 短信验证码
 * 使用 Supabase Auth Phone Provider:
 *   - 发送验证码: supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } })
 *   - 验证码登录: supabase.auth.verifyOtp({ phone, token, type: 'sms' })
 * 登录成功后跳转 /
 */
export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Supabase Phone Provider 需要 E.164 格式：+86 + 11 位手机号
  const fullPhone = `+86${phone}`;
  const phoneValid = PHONE_REGEX.test(phone);

  const handleSendCode = async (): Promise<boolean> => {
    setError(null);
    if (!phoneValid) {
      setError("请输入正确的 11 位手机号");
      return false;
    }
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      phone: fullPhone,
      options: { channel: "sms" },
    });
    if (sendError) {
      setError(sendError.message);
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phoneValid) {
      setError("请输入正确的 11 位手机号");
      return;
    }
    if (code.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }
    const supabase = createClient();
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: code,
        type: "sms",
      });
      if (verifyError) throw verifyError;
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("auth-card", className)} {...props}>
      <div className="auth-card__head">
        <h1 className="auth-card__title">登录叙光</h1>
        <p className="auth-card__subtitle">
          输入手机号与验证码，开启剧本创作之旅
        </p>
      </div>
      <form onSubmit={handleLogin} className="auth-form">
        <div className="auth-field">
          <label htmlFor="login-phone" className="auth-label">
            手机号
          </label>
          <PhoneInput
            id="login-phone"
            value={phone}
            onChange={setPhone}
            disabled={loading}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="login-code" className="auth-label">
            验证码
          </label>
          <VerificationCodeInput
            id="login-code"
            value={code}
            onChange={setCode}
            onSend={handleSendCode}
            sendDisabled={!phoneValid}
            disabled={loading}
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="auth-btn-primary"
        >
          {loading ? "登录中…" : "登录"}
        </button>
        <div className="auth-footer">
          还没有账号？{" "}
          <Link href="/auth/sign-up" className="auth-link">
            立即注册
          </Link>
        </div>
      </form>
    </div>
  );
}
