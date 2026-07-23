export const ADMIN_ROLES = [
  "super_admin",
  "operator",
  "reviewer",
  "support",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "users:read",
  "users:write",
  "users:quota:write",
  "users:ban:write",
  "scripts:read",
  "scripts:write",
  "scripts:takedown:write",
  "generation_tasks:read",
  "generation_tasks:write",
  "generation_tasks:retry:write",
  "knowledge:read",
  "knowledge:write",
  "illustrations:read",
  "illustrations:retry:write",
  "moderation:read",
  "moderation:write",
  "moderation:appeal:write",
  "dashboard:read",
  "system:config:write",
  "system:ai_provider:write",
  "audit_logs:read",
  "audit_logs:export",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
