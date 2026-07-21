import Link from 'next/link';
import { redirect } from 'next/navigation';
import { QrCode, Upload, CreditCard, AlertTriangle } from 'lucide-react';
import { getCachedUser } from '@/lib/queries/dashboard-queries';
import { ManualPaymentService } from '@/lib/services/manual-payment-service';
import '../../manual-payment.css';
import '../pay.css';

async function submitProof(formData: FormData) {
  'use server';
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  const orderId = String(formData.get('orderId') ?? '');
  const payerNote = String(formData.get('payerNote') ?? '');
  const transactionNo = String(formData.get('transactionNo') ?? '');
  const proofFile = formData.get('proofFile');

  if (!(proofFile instanceof File)) {
    throw new Error('请上传付款截图');
  }

  const service = new ManualPaymentService();
  await service.submitProof({
    userId: user.id,
    orderId,
    payerNote,
    transactionNo,
    proofFile,
  });

  redirect(`/settings/quota/pay/${orderId}`);
}

function formatYuan(amountCents: number): string {
  return `￥${(amountCents / 100).toFixed(2)}`;
}

export default async function ManualPayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  const { orderId } = await params;
  const service = new ManualPaymentService();
  const order = await service.getUserOrder(user.id, orderId);

  if (!order) {
    return (
      <section className="manual-pay-page">
        <div className="manual-empty-state">
          <div className="manual-empty-icon" aria-hidden="true">
            <AlertTriangle size={20} />
          </div>
          <div className="manual-empty-title">?????</div>
          <div className="manual-empty-desc">???????????????</div>
          <Link href="/settings/quota" className="btn btn-ghost">
            ?????
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="manual-pay-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <CreditCard size={22} />
            手动收款单
          </h1>
          <div className="page-desc">订单号 {order.orderNo} · {formatYuan(order.amountCents)}</div>
        </div>
        <Link href="/settings/quota" className="btn btn-ghost">
          返回额度页
        </Link>
      </div>

      <div className="manual-pay-card">
        <div className="card-head">
          <h3>
            <QrCode size={16} />
            收款信息
          </h3>
        </div>
        <div className="card-body">
          <div className="manual-pay-grid">
            <div className="manual-channel-card">
              <div className="manual-section-note">请按订单金额付款，付款后上传截图和交易号。</div>
              <div className="manual-qr-placeholder">
                <div>套餐：{order.productName}</div>
                <div>金额：{formatYuan(order.amountCents)}</div>
                <div>渠道：{order.paymentChannel === 'wechat' ? '微信' : '支付宝'}</div>
                <div>状态：{order.status}</div>
                <div>过期时间：{new Date(order.expiresAt).toLocaleString()}</div>
              </div>
              {order.paymentChannel === 'wechat' ? (
                <div className="manual-help">微信二维码地址：{process.env.NEXT_PUBLIC_MANUAL_PAYMENT_WECHAT_QR_URL || '未配置'}</div>
              ) : (
                <div className="manual-help">支付宝二维码地址：{process.env.NEXT_PUBLIC_MANUAL_PAYMENT_ALIPAY_QR_URL || '未配置'}</div>
              )}
            </div>

            <form action={submitProof} className="manual-pay-form">
              <input type="hidden" name="orderId" value={order.id} />
              <div className="manual-field">
                <label className="manual-label" htmlFor="transactionNo">交易号后几位</label>
                <input id="transactionNo" name="transactionNo" className="manual-input" placeholder="可填后4-6位" />
              </div>
              <div className="manual-field">
                <label className="manual-label" htmlFor="payerNote">付款备注</label>
                <input id="payerNote" name="payerNote" className="manual-input" placeholder="填付款时间或备注" />
              </div>
              <div className="manual-field">
                <label className="manual-label" htmlFor="proofFile">付款截图</label>
                <input id="proofFile" name="proofFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="manual-input" />
              </div>
              <div className="manual-help">
                仅凭截图不自动到账，最终以人工核对账单为准。
              </div>
              <button type="submit" className="btn btn-primary">
                <Upload size={14} />
                提交凭证
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
