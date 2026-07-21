-- 管理员操作审计日志表
-- 所有 admin 端写操作必须携带 reason 字段并落库到本表
-- 用于回溯管理员对用户/剧本/任务/系统配置等资源的变更

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id VARCHAR(60),
  payload JSONB DEFAULT '{}'::jsonb,
  reason TEXT DEFAULT '',
  ip VARCHAR(60),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 仅通过 service role client 访问，不配置前端 RLS 策略

CREATE INDEX IF NOT EXISTS idx_audit_admin_time
  ON public.admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target
  ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON public.admin_audit_logs(action, created_at DESC);

COMMENT ON TABLE public.admin_audit_logs IS
  '管理员操作审计日志。admin_id 为登录账号标识（当前固定为 admin），payload 存储变更前后快照，reason 为强制填写的变更原因。';
