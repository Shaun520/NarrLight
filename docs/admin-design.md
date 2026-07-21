<!--
  文档: 叙光 Admin 后台管理系统设计
  作用: 阐明 apps/admin 子工程的定位、权限模型、数据库改造、功能模块、页面结构、API 规范与实施路线
  受众: 项目开发与运营人员
  约束: 本期只设置超级管理员一种角色，拥有全部权限；后续如需细分角色再扩展
  更新: 2026-07-20
-->

# 叙光 Admin 后台管理系统设计

## 一、系统定位与职责边界

### 1.1 定位

`apps/admin` 是叙光平台的内部运营后台，供超级管理员对 web 端的用户、剧本、生成任务、插画任务、社区内容、系统配置与审计日志进行全量管理。工程独立部署，与 web 端共享 Supabase 数据源，但通过 service role client 绕过 RLS 完成跨租户操作。

### 1.2 与 web 端的边界

| 维度 | web 端 | admin 端 |
|---|---|---|
| 用户 | 创作者、玩家 | 公司内部超级管理员 |
| 入口 | `(marketing)` + `(dashboard)` 路由组 | 独立登录页 + 固定超级管理员账号 |
| 数据访问 | RLS，仅本人数据 | service role，全量数据 |
| 部署域名 | `narrlight.app` | `admin.narrlight.app` |
| 构建产物 | `apps/web/.next` | `apps/admin/.next` |
| 视觉风格 | 水墨朱砂卷轴 | AntD 默认蓝，标准表格密度 |

### 1.3 本期范围

- 角色模型只设置**超级管理员**一种，拥有下文列出的全部权限。
- 不实现角色管理、权限分配、多角色审批流。
- 当前阶段登录方式为固定超级管理员账号：`admin / narr-light-admin123`。
- `admin_users` 表已预留给后续多管理员账号管理；当前固定账号登录不读取该表。
- 后续如需多个后台账号，可在系统中增加管理员账号管理入口，使用 `admin_users.username`、`password_hash`、`role`、`is_active` 等字段承载账号、密码哈希、角色与启停状态。

---

## 二、技术栈选型

与 web 端对齐，降低心智负担与依赖维护成本。

```jsonc
// apps/admin/package.json 关键依赖
{
  "next": "latest",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "antd": "^6.4.5",
  "@ant-design/icons": "^6.2.5",
  "@supabase/ssr": "latest",
  "@supabase/supabase-js": "latest",
  "zustand": "^5.0.14",
  "@narrlight/shared": "workspace:*",
  "tailwindcss": "^3.4.1",
  "tailwindcss-animate": "^1.0.7",
  "lucide-react": "^0.511.0",
  "typescript": "^5",
  "vitest": "^4.1.9",
  "eslint": "^9",
  "eslint-config-next": "15.3.1"
}
```

关键决策：

- 不引入 `@ant-design/pro-components`，直接用 AntD 6 的 Table + Form 组合，避免额外依赖。
- 复用 `packages/shared` 中已声明的 `ADMIN_ROLES` 与 `ADMIN_PERMISSIONS`，本期只启用 `super_admin`。
- 复用 web 端 `apps/web/lib/supabase/admin.ts` 的 service role client 实现思路。
- 当前阶段不走 Supabase Auth，使用固定超级管理员账号写入后台专用 httpOnly cookie。
- `admin_users` 作为后续多管理员账号管理的预留表；届时再把登录切换为读取账号表并校验密码哈希。

---

## 三、权限模型

### 3.1 角色

本期只设置一个角色：

| 角色 key | 名称 | 说明 |
|---|---|---|
| `super_admin` | 超级管理员 | 拥有全部权限，可操作所有模块 |

### 3.2 权限清单

权限粒度按模块拆分，所有权限对超级管理员默认开放。

```ts
// packages/shared/src/admin-permissions.ts
export const ADMIN_ROLES = ["super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  // 用户
  "users:read",
  "users:write",
  "users:quota:write",
  "users:ban:write",
  // 剧本
  "scripts:read",
  "scripts:write",
  "scripts:takedown:write",
  // 生成任务
  "generation_tasks:read",
  "generation_tasks:retry:write",
  // 插画任务
  "illustrations:read",
  "illustrations:retry:write",
  // 社区审核
  "moderation:read",
  "moderation:write",
  "moderation:appeal:write",
  // 数据看板
  "dashboard:read",
  // 系统配置
  "system:config:write",
  "system:ai_provider:write",
  // 审计日志
  "audit_logs:read",
  "audit_logs:export",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

// 超级管理员拥有全部权限
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[] | ["*"]> = {
  super_admin: ["*"],
};
```

### 3.3 鉴权三层校验

1. **Proxy 层** `apps/admin/proxy.ts`：未携带有效 `narr_admin_session` cookie 时跳转 `/login`。
2. **Server Component 层**：`app/(admin)/layout.tsx` 调用 `requireAdmin()`，防止绕过 proxy 直接渲染后台页面。
3. **API 层**：后续所有 `/api/admin/*` 路由首行调用 `requireAdmin()` / `requirePermission()`；当前固定超级管理员拥有全部权限。

---

## 四、数据库改造

Admin 相关迁移从 `supabase/migrations/016_admin_users.sql` 开始追加。`016` 如果已经在数据库执行，不再修改历史迁移；后续账号字段通过 `017_admin_account_fields.sql` 追加。

### 4.1 admin_users

管理员账号预留表。当前固定账号登录不读取该表；后续多管理员账号管理再接入。

```sql
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(200) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'super_admin'
    CHECK (role IN ('super_admin', 'operator', 'reviewer', 'support')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- 仅 super_admin 可读写；service role 绕过 RLS
CREATE POLICY "admin_users_self_read" ON public.admin_users
  FOR SELECT USING (auth.uid() = id);
```

`017_admin_account_fields.sql` 追加预留字段：

```sql
ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_id_fkey;

ALTER TABLE public.admin_users
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS username VARCHAR(80),
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

注意：`password_hash` 只存密码哈希，禁止存明文密码。当前固定超级管理员密码仅存在应用代码中，后续切换多账号登录时再统一改为哈希校验。

### 4.2 admin_audit_logs

所有管理员敏感操作必须落库。

```sql
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id),
  action VARCHAR(60) NOT NULL,        -- 例: 'user.quota.update'
  target_type VARCHAR(40) NOT NULL,   -- 'user' | 'script' | 'task' | ...
  target_id VARCHAR(60),
  payload JSONB DEFAULT '{}',         -- 变更前后快照
  reason TEXT DEFAULT '',              -- 操作原因（强制填写）
  ip VARCHAR(60),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_admin_time ON public.admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX idx_audit_action ON public.admin_audit_logs(action, created_at DESC);
```

### 4.3 community_reports

社区举报队列。

```sql
CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id),
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post','comment','user')),
  target_id UUID NOT NULL,
  reason VARCHAR(40) NOT NULL,
  detail TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','resolved','rejected')),
  handler_id UUID REFERENCES public.admin_users(id),
  handled_at TIMESTAMPTZ,
  resolution_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_status ON public.community_reports(status, created_at);
```

### 4.4 scripts.status 枚举扩展

为剧本审核流新增四个状态。

```sql
ALTER TABLE public.scripts
  DROP CONSTRAINT IF EXISTS scripts_status_check;
ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_status_check CHECK (status IN (
    'draft','generating','completed','archived',
    'reviewing','approved','rejected','taken_down'
  ));
```

### 4.5 system_configs

系统配置 KV 表。**仅存放非敏感运行时配置**（模型选择 / 启用开关 / 重试次数 / 超时），敏感凭据（API Key）继续使用环境变量，不写入本表。

```sql
CREATE TABLE IF NOT EXISTS public.system_configs (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

预置配置 key：
- `text_provider`：文本生成路由（primary / fallback / 各 provider 的 enabled / model / timeout / retries）
- `image_provider`：插画生成路由（同上，额外含 size）
- `content_safety`：内容安全开关与人工复核策略
- `quota_defaults`：配额默认值（free_quota_limit / pro_monthly_quota / max_script_words）

web 端通过 `lib/services/ai-config-service.ts` 读取本表，用 React `cache()` 在单次请求内共享配置。

### 4.6 RLS 策略

`admin_users`、`admin_audit_logs`、`community_reports`、`system_configs` 均通过 service role client 访问，不向前端用户配 RLS。`admin_users` 仅配自读策略便于登录后取自身信息。

---

## 五、功能模块设计

按业务优先级规划九大模块。所有写操作必须带 `reason` 字段并自动落审计日志。

### 模块 1：工作台（Dashboard）

- 核心指标卡片：今日新增用户、今日生成任务数、活跃剧本数、待审核举报数、AI 调用总量。
- 趋势图：用户增长曲线、生成任务成功率曲线、收入曲线（接入支付后）。
- 待办区：待审核剧本、待处理举报、失败任务需重试。
- 数据来源：复用 web 端 `overview-service.ts` 思路，改用 admin client 跨用户聚合。

### 模块 2：用户管理

- 列表字段：邮箱、昵称、会员等级、配额使用、注册时间、最近活跃。
- 操作：调整免费配额、升级/降级会员（`plan_type`）、封禁/解封、查看用户全部剧本。
- 详情页：基础信息 + 剧本列表 + 生成任务历史 + 配额变更历史（来自审计日志）。
- 写操作落 `admin_audit_logs`。

### 模块 3：剧本管理

- 列表字段：标题、作者、题材、难度、状态、字数、创建时间。
- 多维筛选：状态（含 `reviewing` / `approved` / `rejected` / `taken_down`）、题材、难度、字数区间。
- 操作：进入审核、通过、驳回（带原因）、强制下架、软删除。
- 详情页：只读查看剧本全貌（设定本 + 人物 + 幕次 + 线索 + 时间线 + 真相复盘 + 插画）。
- 查询逻辑复用 web 端 `script-service.ts` 的查询签名，实现改用 admin client。

### 模块 4：生成任务监控

- 列表字段：任务类型、状态、进度、开始-结束时间、耗时。
- 筛选：失败任务、运行中超 30 分钟任务、特定 `task_type`。
- 操作：失败任务重试（重新入队）、强制取消卡死任务。
- 统计：各类型任务成功率、平均耗时、错误分布。

### 模块 5：插画任务监控

- 列表字段：任务类型、状态、质量状态（`quality_status`）、模型、进度、耗时。
- 操作：重试失败插画、批量取消。
- 统计：模型使用占比、画质警告占比。

### 模块 6：社区审核

- 内容列表：复用 `community-service.ts` 类型定义，接入真实数据后替换 mock。
- 举报队列：`community_reports` 表，按 `pending` → `processing` → `resolved` / `rejected` 流转。
- 操作：内容下架、警告作者、封禁用户、举报驳回（带原因）。
- 申诉处理：`moderation:appeal:write` 专用入口。

### 模块 7：数据看板

- 创作侧：剧本数量分布（题材/难度）、字数分布、生成阶段耗时分布。
- 用户侧：留存曲线、付费转化漏斗、配额使用分布。
- AI 资源侧：各 provider 调用次数、token 消耗趋势、图片生成成本。
- 导出：CSV / PDF，复用 web 端 `@react-pdf/renderer` 方案。

### 模块 8：系统配置

- AI 提供商配置：DeepSeek / GLM / OpenAI Image / Seedream 的**模型选择、启用开关、超时、重试次数**（API Key 继续由环境变量管理，不在此配置）。
- 配额默认值：`free_quota_limit` 默认值、各 `plan_type` 配额。
- 内容安全：敏感词词库、`content-safety.ts` 规则开关。
- 操作：增删改查 `system_configs` 表，所有变更落审计日志。
- 消费链路：web 端 `ai-config-service.ts` 通过 service role client 读取 `system_configs`，根据 primary / fallback 与 enabled 标志选择 provider，将 model / retries / timeout 传给 Provider 构造函数。

### 模块 9：审计日志

- 列表字段：管理员、操作类型、目标、时间、IP。
- 筛选：按管理员、按操作类型、按目标、时间范围。
- 详情：变更前后 JSON diff（参考 web 端 `version-diff.tsx` 的 word-level diff 思路）。
- 导出：CSV。

---

## 六、页面结构与信息架构

### 6.1 路由结构

```
apps/admin/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx              # 独立登录（邮箱+密码，无注册）
│   ├── (admin)/
│   │   ├── layout.tsx                  # ProLayout 侧边栏 + 顶栏
│   │   ├── dashboard/page.tsx          # 工作台
│   │   ├── users/
│   │   │   ├── page.tsx                # 列表
│   │   │   └── [id]/page.tsx           # 详情
│   │   ├── scripts/
│   │   │   ├── page.tsx                # 列表
│   │   │   └── [id]/page.tsx           # 只读详情
│   │   ├── tasks/
│   │   │   ├── generation/page.tsx
│   │   │   └── illustration/page.tsx
│   │   ├── moderation/
│   │   │   ├── content/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   └── appeals/page.tsx
│   │   ├── analytics/
│   │   │   ├── creation/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   └── ai-usage/page.tsx
│   │   ├── system/
│   │   │   ├── ai-providers/page.tsx
│   │   │   ├── quotas/page.tsx
│   │   │   └── content-safety/page.tsx
│   │   └── audit-logs/page.tsx
│   ├── api/
│   │   └── admin/
│   │       ├── users/[id]/route.ts
│   │       ├── scripts/[id]/route.ts
│   │       ├── tasks/[id]/retry/route.ts
│   │       ├── moderation/reports/[id]/route.ts
│   │       └── system/configs/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── layout/
│   │   ├── admin-layout.tsx           # 侧边栏 + 顶栏
│   │   ├── permission-guard.tsx       # 权限守卫
│   │   └── audit-action-button.tsx    # 带审计日志的操作按钮
│   ├── common/
│   │   ├── admin-table.tsx            # 封装 AntD Table
│   │   ├── json-diff-viewer.tsx       # 复用 web 版 diff 思路
│   │   └── confirm-action-modal.tsx   # 二次确认 + 原因填写
│   └── modules/                       # 各业务模块组件
├── lib/
│   ├── supabase/
│   │   ├── admin-server.ts            # server 端 service role client
│   │   ├── admin-client.ts            # client 端受限 client
│   │   └── middleware.ts              # 鉴权中间件
│   ├── auth/
│   │   ├── session.ts                 # 会话管理
│   │   └── permissions.ts             # hasPermission / requirePermission
│   ├── services/                      # 复用 web 端服务签名，重写实现
│   ├── hooks/
│   │   └── use-permission.ts
│   └── utils/
└── package.json
```

### 6.2 视觉规范

与 web 端区分，避免创作者误入：

- 主色调：AntD 默认蓝 `#1677ff`，不用 web 端水墨朱砂。
- 布局：标准 ProLayout（左侧深色侧栏 + 顶栏 + 内容区）。
- 表格密度：`size="middle"`，避免 web 端宽松的卷轴式排版。
- 顶栏右侧：超级管理员身份 + 退出登录，无主题切换。

### 6.3 超级管理员账号初始化

当前阶段不需要 SQL 初始化后台登录账号，固定账号为：

```txt
账号：admin
密码：narr-light-admin123
```

`admin_users` 表只作为后续多账号管理预留。如果后续切换为表驱动登录，再在系统配置中添加管理员账号，并写入 `username`、`password_hash`、`role`、`is_active` 等字段。密码只保存哈希，不保存明文。

已执行过 `016_admin_users.sql` 的数据库无需回滚，继续执行 `017_admin_account_fields.sql` 即可补齐预留字段。

历史 Supabase Auth 白名单方案暂不启用，不需要在 Supabase Auth 中创建后台管理员用户。

---

## 七、关键 API 设计

统一规范：所有写操作使用 POST + body 带 `reason` 字段，自动落审计日志。响应格式复用 web 端 `lib/api/response.ts`。

```ts
// POST /api/admin/users/[id]/quota
// body: { delta: number, reason: string }
// 权限: users:quota:write
// 副作用: admin_audit_logs 落库

// POST /api/admin/users/[id]/ban
// body: { banned: boolean, reason: string }
// 权限: users:ban:write

// POST /api/admin/scripts/[id]/review
// body: { action: 'approve' | 'reject' | 'takedown', reason: string }
// 权限: scripts:takedown:write (reject/takedown) | scripts:write (approve)

// POST /api/admin/tasks/[id]/retry
// body: { reason: string }
// 权限: generation_tasks:retry:write | illustrations:retry:write

// POST /api/admin/moderation/reports/[id]/handle
// body: { action: 'approve' | 'reject' | 'takedown', reason: string, note?: string }
// 权限: moderation:write

// PUT /api/admin/system/configs/[key]
// body: { value: object, reason: string }
// 权限: system:config:write | system:ai_provider:write
```

---

## 八、与 web 端的代码复用

| 复用对象 | 复用方式 |
|---|---|
| `ADMIN_ROLES` / `ADMIN_PERMISSIONS` | `@narrlight/shared` 直接导入 |
| `database.types.ts` | 先跑 `supabase gen types --lang=ts` 补全，再共享 |
| `lib/supabase/admin.ts` | 实现思路复制到 `apps/admin/lib/supabase/admin-server.ts` |
| `lib/api/response.ts` | 类型与实现复制到 admin 端 |
| `lib/services/*` | 复用类型签名，实现重写（admin client） |
| `editor/version-diff.tsx` | 思路复用到审计日志 diff viewer |
| `export/clue-pdf-export.tsx` | 复用到数据导出 |
| AI Provider 逻辑（`lib/ai/providers/*`） | 本期不共享，admin 端只做任务重试入队，不重新调用模型 |

---

## 九、分阶段实施路线

### Phase 1 — 骨架搭建（基础可用）

1. `apps/admin` 工程初始化（package.json / next.config / tsconfig / tailwind / eslint）。
2. 迁移 `014_admin_tables.sql` 上线，跑 `supabase gen types` 补全 `database.types.ts`。
3. 扩展 `packages/shared/src/admin-permissions.ts` 为本设计定义的权限清单。
4. 登录页 + 中间件鉴权 + ProLayout 外壳。
5. 工作台（基础指标卡，无图表）。
6. 用户管理（列表 + 详情 + 配额调整 + 封禁）。
7. 审计日志列表 + 详情。

### Phase 2 — 内容与任务管理

8. 剧本管理（列表 + 审核流 + 只读详情）。
9. 生成任务监控 + 重试。
10. 插画任务监控 + 重试。

### Phase 3 — 审核与数据

11. 社区内容审核 + 举报队列 + 申诉。
12. 数据看板（创作 / 用户 / AI 三视图）。
13. 审计日志 diff viewer + 导出。

### Phase 4 — 系统配置

14. 系统配置（AI 提供商 + 配额 + 内容安全）。
15. 数据看板导出。

---

## 十、关键风险与对策

| 风险 | 对策 |
|---|---|
| service role key 泄漏 | 仅在 server 端使用，环境变量校验沿用 web 端 `admin.ts` 的 ASCII 校验 |
| 超级管理员误操作造成数据损坏 | 所有写操作强制 `reason` 字段 + 二次确认 + 审计日志可回溯 |
| web 端 RLS 升级后 admin 端遗漏同步 | admin 端只用 service role，不依赖 RLS；`scripts.status` 等枚举扩展需双向同步 |
| `database.types.ts` 当前是 placeholder | Phase 1 必须先跑 `supabase gen types --lang=ts` 落到 `packages/shared` |
| 社区数据当前是 mock | admin 端先实现 UI 框架，待 web 端 `community-service.ts` 接入真实数据后再启用 |
| 超级管理员账号丢失 | 初始账号通过 SQL 预置，并在 `admin_users` 表中至少保留 1 个 `is_active = TRUE` 的记录 |
