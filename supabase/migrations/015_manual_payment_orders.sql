-- NarrLight - 手动收款订单与凭证
-- 迁移版本: 015_manual_payment_orders
-- 创建日期: 2026-07-21

CREATE TABLE IF NOT EXISTS public.manual_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no VARCHAR(40) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_code VARCHAR(40) NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  plan_type VARCHAR(20) DEFAULT NULL CHECK (plan_type IS NULL OR plan_type IN ('free', 'pro')),
  payment_channel VARCHAR(20) NOT NULL CHECK (payment_channel IN ('wechat', 'alipay')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'paid', 'rejected', 'expired', 'cancelled')),
  payer_note TEXT NOT NULL DEFAULT '',
  transaction_no VARCHAR(100) NOT NULL DEFAULT '',
  proof_storage_path TEXT NOT NULL DEFAULT '',
  proof_file_name VARCHAR(255) NOT NULL DEFAULT '',
  proof_content_type VARCHAR(100) NOT NULL DEFAULT '',
  proof_uploaded_at TIMESTAMPTZ DEFAULT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NULL,
  paid_at TIMESTAMPTZ DEFAULT NULL,
  approved_by UUID DEFAULT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ DEFAULT NULL,
  rejected_at TIMESTAMPTZ DEFAULT NULL,
  reject_reason TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_payment_orders_user_created
  ON public.manual_payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_payment_orders_status_created
  ON public.manual_payment_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_payment_orders_expired
  ON public.manual_payment_orders(expires_at);

ALTER TABLE public.manual_payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_payment_orders_select_own" ON public.manual_payment_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "manual_payment_orders_insert_own" ON public.manual_payment_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "manual_payment_orders_update_own" ON public.manual_payment_orders
  FOR UPDATE USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manual-payment-proofs',
  'manual-payment-proofs',
  FALSE,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
