import { redirect } from 'next/navigation';
import { Check, Shield, X } from 'lucide-react';
import { getCachedUser } from '@/lib/queries/dashboard-queries';
import { ManualPaymentService } from '@/lib/services/manual-payment-service';
import './admin.css';

async function approveOrder(formData: FormData) {
  'use server';
  if (String(formData.get('token') ?? '') !== process.env.MANUAL_PAYMENT_ADMIN_TOKEN) {
    throw new Error('invalid token');
  }
  const orderId = String(formData.get('orderId') ?? '');
  const service = new ManualPaymentService();
  await service.approveOrder({
    orderId,
    approverUserId: String(formData.get('approverUserId') ?? 'system'),
  });
  redirect('/settings/quota/admin');
}

async function rejectOrder(formData: FormData) {
  'use server';
  if (String(formData.get('token') ?? '') !== process.env.MANUAL_PAYMENT_ADMIN_TOKEN) {
    throw new Error('invalid token');
  }
  const orderId = String(formData.get('orderId') ?? '');
  const reason = String(formData.get('reason') ?? '未说明');
  const service = new ManualPaymentService();
  await service.rejectOrder({
    orderId,
    approverUserId: String(formData.get('approverUserId') ?? 'system'),
    reason,
  });
  redirect('/settings/quota/admin');
}

function formatYuan(amountCents: number): string {
  return `￥${(amountCents / 100).toFixed(2)}`;
}

export default async function ManualPaymentAdminPage() {
  const user = await getCachedUser();
  if (!user) redirect('/auth/login');

  const service = new ManualPaymentService();
  const orders = await service.listPendingOrders();

  return (
    <section className="manual-admin-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Shield size={22} />
            手动收款审核
          </h1>
          <div className="page-desc">仅用于本地或内部审核，口令来自 MANUAL_PAYMENT_ADMIN_TOKEN。</div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="manual-empty-state">
          <div className="manual-empty-icon" aria-hidden="true">
            <Shield size={20} />
          </div>
          <div className="manual-empty-title">???????</div>
          <div className="manual-empty-desc">??????????????</div>
        </div>
      ) : (
        <div className="manual-admin-list">
          {orders.map((order) => (
            <div key={order.id} className="manual-admin-item">
              <div className="manual-admin-top">
                <div className="manual-admin-text">
                  <div className="manual-admin-title">
                    {order.productName} · {formatYuan(order.amountCents)}
                  </div>
                  <div className="manual-admin-desc">
                    订单号 {order.orderNo} · {order.paymentChannel === 'wechat' ? '微信' : '支付宝'} · {order.status}
                  </div>
                  <div className="manual-admin-desc">
                    备注：{order.payerNote || '未填写'} · 交易号：{order.transactionNo || '未填写'}
                  </div>
                </div>
                <div className="manual-admin-proof">
                  {order.proofImageUrl ? <img src={order.proofImageUrl} alt="付款截图" /> : null}
                </div>
              </div>

              <div className="manual-admin-actions">
                <form action={approveOrder}>
                  <input name="token" className="manual-admin-token" placeholder="审核口令" type="password" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="approverUserId" value={user.id} />
                  <button type="submit" className="btn btn-primary">
                    <Check size={14} />
                    确认到账
                  </button>
                </form>
                <form action={rejectOrder}>
                  <input name="token" className="manual-admin-token" placeholder="审核口令" type="password" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="approverUserId" value={user.id} />
                  <input type="hidden" name="reason" value="信息不符" />
                  <button type="submit" className="btn btn-ghost">
                    <X size={14} />
                    驳回
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
