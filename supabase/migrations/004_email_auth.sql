-- 叙光 (NarrLight) - 邮箱认证登录改造
-- 迁移版本: 004_email_auth
-- 创建日期: 2026-06-29
-- 关联规格: spec 006-email-auth-login
--
-- 改动原因:
--   将登录方式从手机号验证码改为邮箱验证码登录。
--   因此 public.users 表的主标识字段由 phone(VARCHAR(20)) 改为 email(TEXT)。
--
-- 数据处理说明:
--   当前处于开发期，users 表数据可清空，无需保留历史手机号记录，
--   故直接通过 ALTER TABLE 重命名列并修改类型，不进行数据迁移与清洗。
--
-- RLS 说明:
--   001_initial_schema.sql 中 users 表的 RLS 策略基于 auth.uid() = id，
--   不涉及 phone 字段，本次改动无需修改任何 RLS 策略。
--   列重命名后，原 phone 上的 UNIQUE 约束由 PostgreSQL 自动保留并作用于 email 列。

-- ============================================================
-- 1. 重命名 phone 列为 email
-- ============================================================
-- RENAME COLUMN 会自动保留该列上现有的 UNIQUE、NOT NULL 等约束。
ALTER TABLE public.users
  RENAME COLUMN phone TO email;

-- ============================================================
-- 2. 修改列类型为 TEXT
-- ============================================================
-- 开发期数据可清空，无需保留历史手机号，故直接 USING 直接转型即可。
ALTER TABLE public.users
  ALTER COLUMN email TYPE TEXT USING email::TEXT;
