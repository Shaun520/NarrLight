import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Check,
  Crown,
  History,
  Layers,
  QrCode,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  getCachedProfile,
  getCachedUser,
} from '@/lib/queries/dashboard-queries';
import {
  QuotaService,
  type CreditInfo,
  type CreditTransaction,
  type QuotaInfo,
} from '@/lib/services/quota-service';
import {
  MANUAL_PAYMENT_PRODUCTS,
  ManualPaymentService,
  type ManualPaymentChannel,
  type ManualPaymentOrder,
  type ManualPaymentProductCode,
} from '@/lib/services/manual-payment-service';
import './quota.css';
import './manual-payment.css';

const PLAN_LABEL: Record<QuotaInfo['planType'], string> = {
  free: '免费版',
  pro: '专业版',
};

interface PricingPlan {
  id: 'starter' | 'pro' | 'studio';
  name: string;
  price: string;
  audience: string;
  credits: string;
  output: string;
  features: string[];
  highlighted?: boolean;
  actionLabel: string;
  disabled?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: '入门版',
    price: '￥49 / 月',
    audience: '轻量使用',
    credits: '300 创作点',
    output: '适合低频内容生成',
    features: ['基础逻辑校验', '少量素材生成', '失败自动返还'],
    actionLabel: '暂未开放',
    disabled: true,
  },
  {
    id: 'pro',
    name: '专业版',
    price: '￥129 / 月',
    audience: '稳定创作',
    credits: '1000 创作点',
    output: '适合持续生产内容',
    features: ['完整逻辑校验', '版本历史', '高清导出'],
    highlighted: true,
    actionLabel: '升级专业版',
  },
  {
    id: 'studio',
    name: '工作室版',
    price: '￥399 / 月',
    audience: '小团队协作',
    credits: '4000 创作点',
    output: '适合团队生产',
    features: ['团队协作', '批量导出', '优先队列'],
    actionLabel: '暂未开放',
    disabled: true,
  },
];

const TRANSACTION_TYPE_LABEL: Record<CreditTransaction['type'], string> = {
  grant: '发放',
  consume: '消耗',
  refund: '返还',
  adjustment: '调整',
};

async function upgradeToPro() {
  'use server';

  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  const service = new ManualPaymentService();
  const order = await service.createOrder({
    userId: user.id,
    productCode: 'pro_month',
    paymentChannel: 'wechat',
  });

  redirect(`/settings/quota/pay/${order.id}`);
}

async function createManualPaymentOrder(formData: FormData) {
  'use server';

  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  const productCode = String(
    formData.get('productCode') ?? 'pro_month',
  ) as ManualPaymentProductCode;
  const paymentChannel = String(
    formData.get('paymentChannel') ?? 'wechat',
  ) as ManualPaymentChannel;

  const service = new ManualPaymentService();
  const order = await service.createOrder({
    userId: user.id,
    productCode,
    paymentChannel,
  });

  redirect(`/settings/quota/pay/${order.id}`);
}

function formatTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function buildQuotaFromProfile(
  profile: {
    free_quota_used: number;
    free_quota_limit: number;
    plan_type: string;
  } | null,
): { info: QuotaInfo; error: string | null } {
  if (!profile) {
    return {
      info: { used: 0, limit: 10, remaining: 10, planType: 'free' },
      error: '未能读取额度信息，已展示默认值。',
    };
  }

  const used = profile.free_quota_used;
  const limit = profile.free_quota_limit;

  return {
    info: {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      planType: profile.plan_type === 'pro' ? 'pro' : 'free',
    },
    error: null,
  };
}

function buildCreditFallback(quotaInfo: QuotaInfo): CreditInfo {
  const balance = quotaInfo.planType === 'pro' ? 1000 : quotaInfo.remaining * 3;
  return {
    balance,
    monthlyGrant: quotaInfo.planType === 'pro' ? 1000 : 30,
    planType: quotaInfo.planType,
  };
}

function describeTransaction(row: CreditTransaction): string {
  if (row.reason) return row.reason;
  if (row.type === 'grant') return '创作点发放';
  if (row.type === 'refund') return '生成失败返还';
  if (row.type === 'consume') return 'AI 生成消耗';
  return '额度调整';
}

function formatYuan(amountCents: number): string {
  return `￥${(amountCents / 100).toFixed(2)}`;
}

export default async function QuotaPage() {
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  const profile = await getCachedProfile(user.id);
  const { info: quotaInfo, error: quotaError } = buildQuotaFromProfile(profile);

  const quotaService = new QuotaService();
  const manualPaymentService = new ManualPaymentService();

  let creditInfo = buildCreditFallback(quotaInfo);
  let historyRows: CreditTransaction[] = [];
  let manualOrders: ManualPaymentOrder[] = [];
  let creditError: string | null = null;
  let manualOrderError: string | null = null;

  try {
    [creditInfo, historyRows] = await Promise.all([
      quotaService.getCreditInfo(user.id),
      quotaService.getCreditTransactions(user.id, 20),
    ]);
  } catch (error) {
    creditError =
      error instanceof Error
        ? `创作点账户暂不可用，已展示旧额度估算：${error.message}`
        : '创作点账户暂不可用，已展示旧额度估算。';
  }

  try {
    manualOrders = await manualPaymentService.listUserOrders(user.id);
  } catch (error) {
    manualOrderError =
      error instanceof Error
        ? `手动收款单暂不可用：${error.message}`
        : '手动收款单暂不可用。';
  }

  const isPro = creditInfo.planType === 'pro';
  const usedPercent =
    creditInfo.monthlyGrant > 0
      ? Math.min(
          100,
          Math.round(
            ((creditInfo.monthlyGrant - creditInfo.balance) /
              creditInfo.monthlyGrant) *
              100,
          ),
        )
      : 0;
  const isQuotaLow =
    creditInfo.balance <=
    Math.max(15, Math.round(creditInfo.monthlyGrant * 0.15));

  return (
    <section className="quota-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Crown size={22} />
            额度与套餐
            <span className="seal">QUOTA</span>
          </h1>
          <div className="page-desc">管理你的 AI 创作点与订阅套餐</div>
        </div>
        <div className="page-actions">
          <Link href="/dashboard" className="btn btn-ghost">
            返回概览
          </Link>
        </div>
      </div>

      {quotaError ? (
        <div className="quota-warn" role="alert">
          {quotaError}
        </div>
      ) : null}
      {creditError ? (
        <div className="quota-warn" role="alert">
          {creditError}
        </div>
      ) : null}

      <div className={`quota-current-card ${isPro ? 'is-pro' : ''}`}>
        <div className="qc-left">
          <div className="qc-plan-badge">
            {isPro ? <Crown size={14} /> : <Sparkles size={14} />}
            {PLAN_LABEL[creditInfo.planType]}
          </div>
          <div className="qc-title">
            {isPro ? '专业版创作者' : '免费体验中'}
          </div>
          <div className="qc-desc">
            {isPro
              ? `本月已发放 ${creditInfo.monthlyGrant} 创作点，失败生成会自动返还。`
              : `当前剩余 ${creditInfo.balance} / ${creditInfo.monthlyGrant} 创作点。`}
          </div>
        </div>
        <div className="qc-right">
          <div className="qc-progress-label">
            <span>创作点余额</span>
            <span className={`qc-pct ${isQuotaLow ? 'low' : ''}`}>
              {creditInfo.balance} 点
            </span>
          </div>
          <div className={`qc-progress-bar ${isPro ? 'pro' : ''}`}>
            <div
              className={`qc-progress-fill ${isQuotaLow ? 'low' : ''} ${isPro ? 'pro' : ''}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          {isQuotaLow ? (
            <div className="qc-hint">
              <Zap size={12} />
              创作点即将用尽，升级或补充点数后可继续创作。
            </div>
          ) : null}
        </div>
      </div>

      <div className="quota-compare-card">
        <div className="card-head">
          <h3>
            <TrendingUp size={16} />
            套餐设计
          </h3>
          <span className="pricing-note">开发期价格方案</span>
        </div>
        <div className="qc-compare-body">
          <div className="pricing-grid">
            {PRICING_PLANS.map((plan) => {
              const isCurrentPro = isPro && plan.id === 'pro';
              const Icon =
                plan.id === 'studio'
                  ? Users
                  : plan.id === 'starter'
                    ? Layers
                    : Crown;

              return (
                <article
                  key={plan.id}
                  className={`pricing-card ${plan.highlighted ? 'is-highlighted' : ''}`}
                >
                  {plan.highlighted ? (
                    <div className="pricing-ribbon">推荐</div>
                  ) : null}
                  <div className="pricing-head">
                    <div className="pricing-icon" aria-hidden="true">
                      <Icon size={17} />
                    </div>
                    <div>
                      <h4>{plan.name}</h4>
                      <p>{plan.audience}</p>
                    </div>
                  </div>
                  <div className="pricing-price">{plan.price}</div>
                  <div className="pricing-credit">{plan.credits}</div>
                  <div className="pricing-output">{plan.output}</div>
                  <ul className="pricing-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={14} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrentPro ? (
                    <div className="qc-current-tag pricing-action">
                      <Crown size={14} />
                      当前套餐
                    </div>
                  ) : plan.id === 'pro' ? (
                    <form action={upgradeToPro}>
                      <button
                        type="submit"
                        className="btn btn-primary qc-upgrade-btn pricing-action"
                      >
                        <Crown size={15} />
                        {plan.actionLabel}
                        <span className="qc-mock-tag">开发期 mock</span>
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost pricing-action"
                      disabled={plan.disabled}
                    >
                      {plan.actionLabel}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="manual-pay-card">
        <div className="card-head">
          <h3>
            <QrCode size={16} />
            手动收款单
          </h3>
          <span className="pricing-note">
            先生成固定金额订单，再扫码付款
          </span>
        </div>
        <div className="card-body">
          <div className="manual-pay-grid">
            <form action={createManualPaymentOrder} className="manual-pay-form">
              <div className="manual-field">
                <label className="manual-label" htmlFor="productCode">
                  套餐
                </label>
                <select
                  id="productCode"
                  name="productCode"
                  className="manual-select"
                  defaultValue="pro_month"
                >
                  {MANUAL_PAYMENT_PRODUCTS.map((product) => (
                    <option key={product.code} value={product.code}>
                      {product.name} · {formatYuan(product.amountCents)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="manual-field">
                <label className="manual-label" htmlFor="paymentChannel">
                  收款渠道
                </label>
                <select
                  id="paymentChannel"
                  name="paymentChannel"
                  className="manual-select"
                  defaultValue="wechat"
                >
                  <option value="wechat">微信收款码</option>
                  <option value="alipay">支付宝收款码</option>
                </select>
              </div>
              <div className="manual-help">
                订单创建后会跳到付款页，付款完成后再上传截图和交易号。金额固定，避免自行修改。
              </div>
              <button type="submit" className="btn btn-primary">
                生成收款单
              </button>
            </form>

            <div className="manual-channel-card">
              <div className="manual-qr">
                <div className="manual-section-note">
                  收款码图片地址配置在环境变量里，支持微信和支付宝分别展示。
                </div>
                <div className="manual-qr-placeholder">
                  <div>
                    微信二维码：
                    {process.env.NEXT_PUBLIC_MANUAL_PAYMENT_WECHAT_QR_URL
                      ? '已配置'
                      : '未配置'}
                  </div>
                  <div>
                    支付宝二维码：
                    {process.env.NEXT_PUBLIC_MANUAL_PAYMENT_ALIPAY_QR_URL
                      ? '已配置'
                      : '未配置'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: '14px' }} />

          {manualOrderError ? (
            <div className="quota-warn" role="alert">
              {manualOrderError}
            </div>
          ) : null}

          <div className="manual-order-list">
            {manualOrders.length > 0 ? (
              manualOrders.map((order) => (
                <div key={order.id} className="manual-order-row">
                  <div className="manual-order-main">
                    <div className="manual-order-title">{order.productName}</div>
                    <div className="manual-order-sub">
                      订单号：{order.orderNo} ·{' '}
                      {order.paymentChannel === 'wechat' ? '微信' : '支付宝'} ·{' '}
                      {order.createdAt.slice(0, 10)}
                    </div>
                  </div>
                  <div className="manual-order-meta">
                    <div className="manual-order-amount">
                      {formatYuan(order.amountCents)}
                    </div>
                    <span className={`manual-status ${order.status}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="manual-order-action">
                    <Link
                      href={`/settings/quota/pay/${order.id}`}
                      className="btn btn-ghost"
                    >
                      去处理
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="manual-empty-state">
                <div className="manual-empty-icon" aria-hidden="true">
                  <QrCode size={20} />
                </div>
                <div className="manual-empty-title">暂无收款单</div>
                <div className="manual-empty-desc">
                  先生成一笔固定金额订单，付款后再去详情页上传截图。
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="quota-history-card">
        <div className="card-head">
          <h3>
            <History size={16} />
            创作点流水
          </h3>
          <span className="qh-count">最近 {historyRows?.length ?? 0} 条</span>
        </div>
        {historyRows && historyRows.length > 0 ? (
          <div className="qh-list">
            {historyRows.map((row) => {
              const statusClass =
                row.amount > 0
                  ? 'ok'
                  : row.type === 'consume'
                    ? 'gen'
                    : 'warn';

              return (
                <div key={row.id} className="qh-row">
                  <div className="qh-type">{describeTransaction(row)}</div>
                  <div className="qh-time">{formatTime(row.createdAt)}</div>
                  <div className={`qh-status qh-${statusClass}`}>
                    {row.amount > 0 ? '+' : ''}
                    {row.amount} 点 · {TRANSACTION_TYPE_LABEL[row.type]}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="manual-empty-state">
            <div className="manual-empty-icon" aria-hidden="true">
              <History size={20} />
            </div>
            <div className="manual-empty-title">暂无使用记录</div>
            <div className="manual-empty-desc">
              开始使用 AI 生成功能后，这里会展示最近的创作点消费和返还。
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
