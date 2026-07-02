"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { EMAIL_REGEX, EmailInput } from "@/components/email-input";
import { VerificationCodeInput } from "@/components/phone-input";
import { PasswordInput } from "@/components/password-input";

/**
 * 登录表单 - 邮箱 + 密码 / 验证码（双模式）
 * 使用 Supabase Auth:
 *   - 密码登录: supabase.auth.signInWithPassword({ email, password })
 *   - 验证码登录: supabase.auth.signInWithOtp({ email }) + verifyOtp
 * 登录成功后跳转 /dashboard
 */
export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "code">("password");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailValid = EMAIL_REGEX.test(email);

  const handleSendCode = async (): Promise<boolean> => {
    setError(null);
    if (!emailValid) {
      setError("请输入正确的邮箱地址");
      return false;
    }
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
    });
    if (sendError) {
      setError(sendError.message);
      return false;
    }
    return true;
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailValid) {
      setError("请输入正确的邮箱地址");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    const supabase = createClient();
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailValid) {
      setError("请输入正确的邮箱地址");
      return;
    }
    if (code.length !== 8) {
      setError("请输入 8 位验证码");
      return;
    }
    const supabase = createClient();
    setLoading(true);
    try {
      const { data: sessionData, error: verifyError } =
        await supabase.auth.verifyOtp({
          email,
          token: code,
          type: "email",
        });
      if (verifyError) throw verifyError;
      if (!sessionData.session) {
        setError("登录失败，未获取到会话");
        return;
      }
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

/**
 * 将 Supabase Auth 常见英文错误提示映射为中文
 */
function mapAuthError(err: unknown): string {
  if (!(err instanceof Error)) return "登录失败，请稍后重试";
  const msg = err.message;
  if (msg.includes("Invalid login credentials")) return "邮箱或密码错误";
  if (msg.includes("Email not confirmed")) return "邮箱尚未确认，请检查邮件";
  if (msg.includes("Rate limit")) return "操作过于频繁，请稍后再试";
  return msg || "登录失败，请稍后重试";
}

  return (
    <div className={cn("auth-card", className)} {...props}>
      <div className="auth-card__head">
        <h1 className="auth-card__title">登录叙光</h1>
        <p className="auth-card__subtitle">
          输入邮箱与密码，开启剧本创作之旅
        </p>
      </div>
      <form
        onSubmit={mode === "password" ? handlePasswordLogin : handleLogin}
        className="auth-form"
      >
        <div className="auth-tabs">
          <button
            type="button"
            className={cn("auth-tab", mode === "password" && "auth-tab--active")}
            onClick={() => {
              setMode("password");
              setError(null);
            }}
          >
            密码登录
          </button>
          <button
            type="button"
            className={cn("auth-tab", mode === "code" && "auth-tab--active")}
            onClick={() => {
              setMode("code");
              setError(null);
            }}
          >
            验证码登录
          </button>
        </div>
        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">
            邮箱
          </label>
          <EmailInput
            id="login-email"
            value={email}
            onChange={setEmail}
            disabled={loading}
          />
        </div>
        {mode === "password" ? (
          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">
              密码
            </label>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={setPassword}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
        ) : (
          <div className="auth-field">
            <label htmlFor="login-code" className="auth-label">
              验证码
            </label>
            <VerificationCodeInput
              id="login-code"
              value={code}
              onChange={setCode}
              onSend={handleSendCode}
              sendDisabled={!emailValid}
              disabled={loading}
            />
          </div>
        )}
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
