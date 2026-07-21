import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">叙光 Admin</h1>
        <p>使用管理员邮箱与密码登录。账号需在后台白名单中启用。</p>

        <form>
          <div className="form-field">
            <label htmlFor="admin-email">邮箱</label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="admin@narrlight.com"
            />
          </div>

          <div className="form-field">
            <label htmlFor="admin-password">密码</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
            />
          </div>

          <div className="login-actions">
            <Link className="admin-btn primary" href="/dashboard">
              登录
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
