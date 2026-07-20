import { LoginForm } from "@/components/login-form";
import "../auth.css";

/**
 * 登录页 - 邮箱 + 密码 / 验证码（双模式）
 * 居中卡片布局，古风视觉（纸张背景 + 朱砂红主色）
 */
export default function Page() {
  return (
    <div className="auth-page">
      <LoginForm />
    </div>
  );
}
