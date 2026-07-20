-- 叙光 (NarrLight) - users 表 INSERT 策略
-- 迁移版本: 003_users_insert_policy
-- 创建日期: 2026-06-27
-- 说明: 为 public.users 表添加 INSERT 策略，允许用户插入自己的记录。
--       001_initial_schema.sql 已为 users 表启用 RLS 并创建 SELECT/UPDATE 策略，
--       但缺少 INSERT 策略，导致注册流程无法写入 public.users（sign-up-form 报错）。
-- 依赖: 001_initial_schema.sql

-- 为 public.users 表添加 INSERT 策略，允许用户插入自己的记录
CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
