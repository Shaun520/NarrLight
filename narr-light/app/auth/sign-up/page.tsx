import { SignUpForm } from "@/components/sign-up-form";
import "../auth.css";

/**
 * 注册页 - 邮箱 + 密码 + 昵称
 * 居中卡片布局，古风视觉（纸张背景 + 朱砂红主色）
 */
export default function Page() {
  return (
    <div className="auth-page">
      <SignUpForm />
    </div>
  );
}
