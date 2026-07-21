import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError } from '@/lib/api/response';
import { QuotaService } from '@/lib/services/quota-service';

export type ManualPaymentChannel = 'wechat' | 'alipay';

export type ManualPaymentProductCode = 'starter_pack' | 'pro_month' | 'studio_pack';

export interface ManualPaymentProduct {
  code: ManualPaymentProductCode;
  name: string;
  amountCents: number;
  credits: number;
  planType: 'free' | 'pro' | null;
  description: string;
}

export const MANUAL_PAYMENT_PRODUCTS: ManualPaymentProduct[] = [
  {
    code: 'starter_pack',
    name: '入门包',
    amountCents: 4900,
    credits: 300,
    planType: null,
    description: '一次性补充 300 创作点，适合低频体验用户。',
  },
  {
    code: 'pro_month',
    name: '专业版',
    amountCents: 12900,
    credits: 0,
    planType: 'pro',
    description: '升级为专业版，并补发专业版月度创作点。',
  },
  {
    code: 'studio_pack',
    name: '工作室包',
    amountCents: 39900,
    credits: 4000,
    planType: null,
    description: '批量补充 4000 创作点，适合稳定创作用户。',
  },
];

export interface ManualPaymentOrder {
  id: string;
  orderNo: string;
  userId: string;
  productCode: ManualPaymentProductCode;
  productName: string;
  amountCents: number;
  currency: string;
  credits: number;
  planType: 'free' | 'pro' | null;
  paymentChannel: ManualPaymentChannel;
  status: 'pending' | 'submitted' | 'paid' | 'rejected' | 'expired' | 'cancelled';
  payerNote: string;
  transactionNo: string;
  proofImageUrl: string;
  proofStoragePath: string;
  proofFileName: string;
  proofContentType: string;
  proofUploadedAt: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

interface ManualPaymentOrderRow {
  id: string;
  order_no: string;
  user_id: string;
  product_code: ManualPaymentProductCode;
  product_name: string;
  amount_cents: number;
  currency: string;
  credits: number;
  plan_type: 'free' | 'pro' | null;
  payment_channel: ManualPaymentChannel;
  status: ManualPaymentOrder['status'];
  payer_note: string;
  transaction_no: string;
  proof_storage_path: string;
  proof_file_name: string;
  proof_content_type: string;
  proof_uploaded_at: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  reject_reason: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface ManualPaymentOrderInsert {
  order_no: string;
  user_id: string;
  product_code: ManualPaymentProductCode;
  product_name: string;
  amount_cents: number;
  currency: string;
  credits: number;
  plan_type: 'free' | 'pro' | null;
  payment_channel: ManualPaymentChannel;
  status: ManualPaymentOrder['status'];
  expires_at: string;
}

const PROOF_BUCKET = 'manual-payment-proofs';

export class ManualPaymentService {
  private readonly quotaService = new QuotaService();

  async createOrder(args: {
    userId: string;
    productCode: ManualPaymentProductCode;
    paymentChannel: ManualPaymentChannel;
  }): Promise<ManualPaymentOrder> {
    const product = await this.getProduct(args.productCode);
    const supabase = this.getAdminClient();
    const orderNo = this.buildOrderNo();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const payload: ManualPaymentOrderInsert = {
      order_no: orderNo,
      user_id: args.userId,
      product_code: product.code,
      product_name: product.name,
      amount_cents: product.amountCents,
      currency: 'CNY',
      credits: product.credits,
      plan_type: product.planType,
      payment_channel: args.paymentChannel,
      status: 'pending',
      expires_at: expiresAt,
    };

    const { data, error } = await supabase
      .from('manual_payment_orders')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_INSERT_ERROR', error.message, 500);
    }

    return this.hydrateOrder(data as ManualPaymentOrderRow);
  }

  async listUserOrders(userId: string): Promise<ManualPaymentOrder[]> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', error.message, 500);
    }

    await this.expireOrders(data ?? []);
    return await Promise.all(((data ?? []) as ManualPaymentOrderRow[]).map((row) => this.hydrateOrder(row)));
  }

  async getUserOrder(userId: string, orderId: string): Promise<ManualPaymentOrder | null> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', error.message, 500);
    }
    if (!data) return null;

    await this.expireOrder(data as ManualPaymentOrderRow);
    return this.hydrateOrder(data as ManualPaymentOrderRow);
  }

  async listPendingOrders(): Promise<ManualPaymentOrder[]> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .select('*')
      .in('status', ['pending', 'submitted'])
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', error.message, 500);
    }

    await this.expireOrders(data ?? []);
    return await Promise.all(((data ?? []) as ManualPaymentOrderRow[]).map((row) => this.hydrateOrder(row)));
  }

  async submitProof(args: {
    userId: string;
    orderId: string;
    payerNote: string;
    transactionNo: string;
    proofFile: File | null;
  }): Promise<ManualPaymentOrder> {
    const order = await this.mustGetOwnedOrder(args.userId, args.orderId);
    this.assertEditable(order);

    const proof = args.proofFile;
    if (!proof) {
      throw new ApiError('VALIDATION_ERROR', '请上传付款截图', 400);
    }

    const storagePath = await this.uploadProofFile(order.id, proof);
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .update({
        status: 'submitted',
        payer_note: args.payerNote.trim(),
        transaction_no: args.transactionNo.trim(),
        proof_storage_path: storagePath,
        proof_file_name: proof.name,
        proof_content_type: proof.type || 'application/octet-stream',
        proof_uploaded_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reject_reason: '',
        rejected_at: null,
      })
      .eq('id', order.id)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', error.message, 500);
    }

    return this.hydrateOrder(data as ManualPaymentOrderRow);
  }

  async approveOrder(args: {
    orderId: string;
    approverUserId: string;
  }): Promise<ManualPaymentOrder> {
    const order = await this.mustGetOrder(args.orderId);
    if (order.status === 'paid') {
      return this.hydrateOrder(order);
    }
    if (order.status === 'rejected' || order.status === 'cancelled') {
      throw new ApiError('INVALID_STATE', '该订单已被驳回或取消，无法确认到账', 409);
    }

    const supabase = this.getAdminClient();
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('manual_payment_orders')
      .update({
        status: 'paid',
        approved_by: args.approverUserId,
        approved_at: now,
        paid_at: now,
        updated_at: now,
        reject_reason: '',
        rejected_at: null,
      })
      .eq('id', order.id)
      .select('*')
      .single();

    if (updateError) {
      throw new ApiError('DB_UPDATE_ERROR', updateError.message, 500);
    }

    try {
      await this.applyEntitlement(updated as ManualPaymentOrderRow, args.approverUserId);
    } catch (error) {
      await supabase
        .from('manual_payment_orders')
        .update({
          status: 'submitted',
          approved_by: null,
          approved_at: null,
          paid_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      throw error;
    }

    return this.hydrateOrder(updated as ManualPaymentOrderRow);
  }

  async rejectOrder(args: {
    orderId: string;
    approverUserId: string;
    reason: string;
  }): Promise<ManualPaymentOrder> {
    const order = await this.mustGetOrder(args.orderId);
    if (order.status === 'paid') {
      throw new ApiError('INVALID_STATE', '该订单已确认到账，不能再驳回', 409);
    }
    const supabase = this.getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .update({
        status: 'rejected',
        approved_by: args.approverUserId,
        approved_at: now,
        rejected_at: now,
        reject_reason: args.reason.trim(),
        updated_at: now,
      })
      .eq('id', order.id)
      .select('*')
      .single();

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', error.message, 500);
    }

    return this.hydrateOrder(data as ManualPaymentOrderRow);
  }

  async getProduct(code: ManualPaymentProductCode): Promise<ManualPaymentProduct> {
    const product = MANUAL_PAYMENT_PRODUCTS.find((item) => item.code === code);
    if (!product) {
      throw new ApiError('NOT_FOUND', '未找到对应套餐', 404);
    }
    return product;
  }

  private getAdminClient() {
    return createAdminClient();
  }

  private async mustGetOwnedOrder(userId: string, orderId: string): Promise<ManualPaymentOrderRow> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', error.message, 500);
    }
    if (!data) {
      throw new ApiError('NOT_FOUND', '未找到订单', 404);
    }

    const row = data as ManualPaymentOrderRow;
    await this.expireOrder(row);
    if (row.status === 'expired' || row.status === 'cancelled') {
      throw new ApiError('INVALID_STATE', '该订单已过期或取消', 409);
    }
    return row;
  }

  private async mustGetOrder(orderId: string): Promise<ManualPaymentOrderRow> {
    const supabase = this.getAdminClient();
    const { data, error } = await supabase
      .from('manual_payment_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', error.message, 500);
    }
    if (!data) {
      throw new ApiError('NOT_FOUND', '未找到订单', 404);
    }

    const row = data as ManualPaymentOrderRow;
    await this.expireOrder(row);
    return row;
  }

  private async applyEntitlement(order: ManualPaymentOrderRow, approverUserId: string): Promise<void> {
    if (order.plan_type === 'pro') {
      await this.quotaService.upgradePlan(order.user_id);
      return;
    }

    if (order.credits > 0) {
      await this.quotaService.grantCredits(
        order.user_id,
        order.credits,
        `手动收款到账：${order.product_name}`,
        {
          manualPaymentOrderId: order.id,
          orderNo: order.order_no,
          paymentChannel: order.payment_channel,
          approvedBy: approverUserId,
        },
      );
    }
  }

  private async uploadProofFile(orderId: string, file: File): Promise<string> {
    await this.ensureProofBucket();
    const supabase = this.getAdminClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${orderId}/${Date.now()}-${safeName || 'proof'}`;
    const buffer = await file.arrayBuffer();

    const { error } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, new Uint8Array(buffer), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      throw new ApiError('STORAGE_UPLOAD_FAILED', `上传付款截图失败：${error.message}`, 500);
    }

    return path;
  }

  private async ensureProofBucket(): Promise<void> {
    const supabase = this.getAdminClient();
    const { error } = await supabase.storage.getBucket(PROOF_BUCKET);
    if (!error) return;

    const { error: createError } = await supabase.storage.createBucket(PROOF_BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    });

    if (createError && !createError.message.toLowerCase().includes('already exists')) {
      throw new ApiError('STORAGE_BUCKET_ERROR', `创建付款截图桶失败：${createError.message}`, 500);
    }
  }

  private async hydrateOrder(order: ManualPaymentOrderRow): Promise<ManualPaymentOrder> {
    let proofImageUrl = '';
    if (order.proof_storage_path) {
      const supabase = this.getAdminClient();
      const { data } = await supabase.storage
        .from(PROOF_BUCKET)
        .createSignedUrl(order.proof_storage_path, 60 * 60);
      proofImageUrl = data?.signedUrl ?? '';
    }

    return {
      id: order.id,
      orderNo: order.order_no,
      userId: order.user_id,
      productCode: order.product_code,
      productName: order.product_name,
      amountCents: order.amount_cents,
      currency: order.currency,
      credits: order.credits,
      planType: order.plan_type,
      paymentChannel: order.payment_channel,
      status: order.status,
      payerNote: order.payer_note,
      transactionNo: order.transaction_no,
      proofImageUrl,
      proofStoragePath: order.proof_storage_path,
      proofFileName: order.proof_file_name,
      proofContentType: order.proof_content_type,
      proofUploadedAt: order.proof_uploaded_at,
      submittedAt: order.submitted_at,
      paidAt: order.paid_at,
      approvedBy: order.approved_by,
      approvedAt: order.approved_at,
      rejectedAt: order.rejected_at,
      rejectReason: order.reject_reason,
      expiresAt: order.expires_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  private async expireOrder(order: ManualPaymentOrderRow): Promise<void> {
    if (order.status === 'paid' || order.status === 'rejected' || order.status === 'expired' || order.status === 'cancelled') {
      return;
    }
    if (new Date(order.expires_at).getTime() > Date.now()) return;

    const supabase = this.getAdminClient();
    await supabase
      .from('manual_payment_orders')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
    order.status = 'expired';
  }

  private async expireOrders(rows: ManualPaymentOrderRow[]): Promise<void> {
    await Promise.all(rows.map((row) => this.expireOrder(row)));
  }

  private assertEditable(order: ManualPaymentOrderRow): void {
    if (order.status === 'paid' || order.status === 'cancelled') {
      throw new ApiError('INVALID_STATE', '该订单当前不可提交凭证', 409);
    }
  }

  private buildOrderNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    return `MP${date}${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }
}
