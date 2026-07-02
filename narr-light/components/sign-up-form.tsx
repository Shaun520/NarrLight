"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  EMAIL_REGEX,
  EmailInput,
} from "@/components/email-input";
import { PasswordInput, PASSWORD_MIN_LENGTH } from "@/components/password-input";

/**
 * 注册表单 - 邮箱 + 密码 + 昵称
 * 使用 Supabase Auth Email/Password Provider:
 *   - 注册: supabase.auth.signUp({ email, password, options: { data: { nickname } } })
 *   - 成功后在 public.users 表创建用户记录
 * 注册成功后跳转 /dashboard
 */
export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailValid = EMAIL_REGEX.test(email);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!emailValid) {
      setError("请输入正确的邮箱地址");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError("密码至少 6 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (!nickname.trim()) {
      setError("请输入昵称");
      return;
    }
    const supabase = createClient();
    setLoading(true);
    try {
      // 1. 注册并建立会话
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname: nickname.trim() } },
      });
      if (signUpError) throw signUpError;

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
            email: email,
            nickname: nickname.trim(),
          });
        // 23505 = unique_violation，邮箱已存在记录（重复注册）时忽略，保证登录顺畅
        if (insertError && insertError.code !== "23505") {
          throw insertError;
        }
      }
      // signUp 成功后会话已建立，但 cookie 写入是异步的
      // 用完整页面导航确保 cookie 写入后再跳转，避免 middleware 判定未登录
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      setError(mapSignUpError(err));
    } finally {
      setLoading(false);
    }
  };

/**
 * 将 Supabase Auth 常见英文注册错误提示映射为中文
 */
function mapSignUpError(err: unknown): string {
  if (!(err instanceof Error)) return "注册失败，请稍后重试";
  const msg = err.message;
  if (msg.includes("User already registered")) return "该邮箱已注册";
  if (msg.includes("Password should be at least")) return "密码至少 6 位";
  if (msg.includes("Unable to validate")) return "邮箱格式不正确";
  if (msg.includes("Rate limit")) return "操作过于频繁，请稍后再试";
  return msg || "注册失败，请稍后重试";
}

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
          <label htmlFor="su-email" className="auth-label">
            邮箱
          </label>
          <EmailInput
            id="su-email"
            value={email}
            onChange={setEmail}
            disabled={loading}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="su-password" className="auth-label">
            密码
          </label>
          <PasswordInput
            id="su-password"
            value={password}
            onChange={setPassword}
            disabled={loading}
            autoComplete="new-password"
          />
        </div>
        <div className="auth-field">
          <label htmlFor="su-confirm-password" className="auth-label">
            确认密码
          </label>
          <PasswordInput
            id="su-confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={loading}
            placeholder="请再次输入密码"
            autoComplete="new-password"
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
