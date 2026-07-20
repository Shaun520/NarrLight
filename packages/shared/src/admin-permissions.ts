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
  "scripts:read",
  "scripts:write",
  "generation_tasks:read",
  "generation_tasks:write",
  "moderation:read",
  "moderation:write",
  "audit_logs:read",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
