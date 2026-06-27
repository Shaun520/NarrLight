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
 * 注册表单 - 手机号 + 短信验证码 + 昵称
 * 流程:
 *   1. 发送验证码: supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } })
 *   2. 验证码校验: supabase.auth.verifyOtp({ phone, token, type: 'sms' })
 *      （校验通过后会建立会话，auth.uid() 即可用）
 *   3. 在 public.users 表创建用户记录（写入 id / phone / nickname）
 * 注册成功后跳转 /
 */
export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
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

  const handleSignUp = async (e: React.FormEvent) => {
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
    if (!nickname.trim()) {
      setError("请输入昵称");
      return;
    }
    const supabase = createClient();
    setLoading(true);
    try {
      // 1. 校验验证码并建立会话
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: code,
        type: "sms",
      });
      if (verifyError) throw verifyError;

      // 2. 在 public.users 表创建用户记录
      //    id 必须等于 auth.uid()，以便后续 RLS 的 SELECT/UPDATE 策略放行
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: insertError } = await supabase
          .from("users")
          .insert({
            id: user.id,
            phone: fullPhone,
            nickname: nickname.trim(),
          });
        // 23505 = unique_violation，手机号已存在记录（重复注册）时忽略，保证登录顺畅
        if (insertError && insertError.code !== "23505") {
          throw insertError;
        }
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("auth-card", className)} {...props}>
      <div className="auth-card__head">
        <h1 className="auth-card__title">注册叙光</h1>
        <p className="auth-card__subtitle">
          创建账号，开启 AI 剧本杀创作之旅
        </p>
      </div>
      <form onSubmit={handleSignUp} className="auth-form">
        <div className="auth-field">
          <label htmlFor="su-phone" className="auth-label">
            手机号
          </label>
          <PhoneInput
            id="su-phone"
            value={phone}
            onChange={setPhone}
            disabled={loading}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="su-code" className="auth-label">
            验证码
          </label>
          <VerificationCodeInput
            id="su-code"
            value={code}
            onChange={setCode}
            onSend={handleSendCode}
            sendDisabled={!phoneValid}
            disabled={loading}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="su-nickname" className="auth-label">
            昵称
          </label>
          <input
            id="su-nickname"
            type="text"
            placeholder="请输入昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={loading}
            maxLength={50}
            className="auth-input"
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="auth-btn-primary"
        >
          {loading ? "注册中…" : "注册"}
        </button>
        <div className="auth-footer">
          已有账号？{" "}
          <Link href="/auth/login" className="auth-link">
            立即登录
          </Link>
        </div>
      </form>
    </div>
  );
}
