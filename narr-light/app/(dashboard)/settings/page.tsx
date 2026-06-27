/**
 * 账号设置页 - 显示用户基本信息并提供昵称编辑（开发期 Mock 保存）
 *
 * 路由：/settings
 *
 * 服务端组件：
 *   - 获取 user + profile（users 表 nickname / avatar_url）
 *   - 展示头像、昵称、手机号、邮箱
 *   - 顶部标签导航：账号设置（当前）/ 额度管理（/settings/quota）
 *   - 昵称编辑表单：内联 server action 写回 users 表后重定向回本页
 *
 * 视觉对齐项目古风系统：朱砂红 + 纸张色 + 印章质感（与 quota 页一致）。
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreditCard, Mail, Phone, User, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import './settings.css';

/** 昵称编辑 server action（开发期：直接写回 users 表） */
async function saveProfile(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const nickname = String(formData.get('nickname') ?? '').trim();
  if (!nickname) redirect('/settings?saved=0');

  await supabase
    .from('users')
    .update({ nickname })
    .eq('id', user.id);

  redirect('/settings?saved=1');
}

/** users 表行投影 */
interface ProfileRow {
  nickname: string | null;
  avatar_url: string | null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = (await supabase
    .from('users')
    .select('nickname, avatar_url')
    .eq('id', user.id)
    .maybeSingle()) as { data: ProfileRow | null };

  const params = await searchParams;
  const saved = params.saved;
  const nickname = profile?.nickname || user.email || '创作者';
  const avatarChar = nickname.charAt(0).toUpperCase();
  const avatarUrl = profile?.avatar_url ?? null;
  const phone = user.phone ?? null;
  const email = user.email ?? null;
  const showSavedBanner = saved === '1';

  return (
    <section className="view settings-page">
      {/* ============ 页头 ============ */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <UserCog size={22} />
            账号设置 <span className="seal">ACCOUNT</span>
          </h1>
          <div className="page-desc">管理你的账号信息与个人资料</div>
        </div>
        <div className="page-actions">
          <Link href="/dashboard" className="btn btn-ghost">
            返回概览
          </Link>
        </div>
      </div>

      {/* ============ 设置标签导航 ============ */}
      <nav className="settings-tabs" aria-label="设置导航">
        <Link href="/settings" className="settings-tab active">
          <UserCog size={14} />
          账号设置
        </Link>
        <Link href="/settings/quota" className="settings-tab">
          <CreditCard size={14} />
          额度管理
        </Link>
      </nav>

      {showSavedBanner ? (
        <div className="settings-saved-banner" role="status">
          昵称已保存
        </div>
      ) : null}

      {/* ============ 账号信息卡 ============ */}
      <div className="settings-card">
        <div className="card-head">
          <h3>
            <User size={16} />
            基本信息
          </h3>
        </div>
        <div className="settings-profile">
          <div className="settings-avatar-wrap">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={nickname}
                className="settings-avatar-img"
              />
            ) : (
              <div className="settings-avatar-fallback" aria-hidden="true">
                {avatarChar}
              </div>
            )}
          </div>
          <dl className="settings-info-list">
            <div className="settings-info-row">
              <dt>
                <User size={14} />
                昵称
              </dt>
              <dd className="settings-info-value">{nickname}</dd>
            </div>
            <div className="settings-info-row">
              <dt>
                <Mail size={14} />
                邮箱
              </dt>
              <dd className="settings-info-value">
                {email ?? '—'}
              </dd>
            </div>
            <div className="settings-info-row">
              <dt>
                <Phone size={14} />
                手机号
              </dt>
              <dd className="settings-info-value">
                {phone ?? <span className="settings-muted">未绑定</span>}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ============ 昵称编辑表单 ============ */}
      <div className="settings-card">
        <div className="card-head">
          <h3>
            <UserCog size={16} />
            编辑昵称
          </h3>
          <span className="settings-mock-tag">开发期 mock</span>
        </div>
        <form action={saveProfile} className="settings-form">
          <label className="settings-field">
            <span className="settings-label">昵称</span>
            <input
              type="text"
              name="nickname"
              defaultValue={profile?.nickname ?? ''}
              maxLength={20}
              placeholder="请输入昵称"
              className="settings-input"
              required
            />
          </label>
          <div className="settings-form-actions">
            <button type="submit" className="btn btn-primary">
              保存修改
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
