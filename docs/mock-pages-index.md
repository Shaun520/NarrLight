# 叙光（NarrLight）开发页面路径索引

> 本文档汇总项目中可在开发期直接访问的页面路径，并记录正式产品入口行为。
>
> - **访问前提**：本地开发服务器已启动（`npm run dev`）；受保护路由需登录态（未配置 Supabase 时会被 proxy 重定向到登录页，可通过 `/auth/login` 任意手机号 + 验证码登录进入）。
> - **正式入口策略**：编辑器必须绑定真实剧本。用户无剧本时，`/editor` 与编辑器子功能入口统一引导到 `/generate` 创建剧本。
>
> 基础地址：`http://localhost:3000`

---

## 一、营销与认证页（公开访问，无需登录）

| 路径 | 页面名称 | 内容 | 说明 |
|------|---------|-----------|------|
| `/` | 推广落地页 | 单屏沉浸式海报 + 滚动动效 | 严格还原 `docs/prototype/promo-v1.html` |
| `/auth/login` | 登录页 | 手机号 + 验证码表单 | 开发期任意输入即可登录 |
| `/auth/sign-up` | 注册页 | 手机号 + 验证码注册表单 | 同上 |
| `/auth/forgot-password` | 忘记密码 | 手机号重置表单 | — |
| `/auth/update-password` | 重置密码 | 新密码表单 | — |
| `/auth/sign-up-success` | 注册成功 | 成功提示页 | — |
| `/auth/error` | 认证错误 | 错误提示页 | — |

---

## 二、工作台核心页面（需登录）

### 2.1 概览与剧本管理

| 路径 | 页面名称 | 内容 | 说明 |
|------|---------|-----------|------|
| `/dashboard` | 工作台概览 | 环形进度 + 4 张统计卡 + 工作流列表 + 待办/活动流 + 5 个快捷入口 | 无剧本时 `overview-service` 返回 `MOCK_DATA`（古镇迷案样例） |
| `/scripts` | 剧本列表 | 卡片网格 + 状态/进度展示 | 无剧本时显示空状态引导 |
| `/scripts/new` | 新建剧本 | 双栏布局 + 创建方式选择 + 9 字段表单 + 参数预览 | 表单提交需登录态；UI 可直接预览 |
| `/generate` | 剧本 AI 生成 | 参数表单 + 流式生成面板 | Mock 流式输出（`MOCK_LINES` 逐行推送） |
| `/community` | 创作社区 | 7 分类 tab + 瀑布流 + 侧栏榜单 + 脉搏统计 | `community-service` 返回 `MOCK_POSTS`/`MOCK_TOPICS` 等 |

### 2.2 编辑器主页面

| 路径 | 页面名称 | 内容 | 说明 |
|------|---------|-----------|------|
| `/editor` | 编辑器入口 | 自动重定向 | 有剧本 → `/editor/[最近scriptId]`；无剧本 → `/generate` |
| `/editor/[scriptId]` | 剧本编辑器 | 三栏布局：章节树 + 正文编辑 + 版本/AI 面板 | 从真实剧本数据聚合加载角色剧本、组织者手册、线索与真相复盘 |

---

## 三、编辑器子页面（需真实 scriptId）

> 访问方式：将路径中的 `[scriptId]` 替换为真实剧本 ID。无剧本时请先访问 `/generate` 创建剧本。
>
> 例如：`http://localhost:3000/editor/<scriptId>/timeline`

### 3.1 时间线校验

| 路径 | 页面名称 |
|------|---------|
| `/editor/[scriptId]/timeline` | 时间线校验 |

**当前能力**：
- 从 `/api/validate` 加载当前剧本的时间线事件与冲突
- 支持在缺少结构化时间线时通过 `/api/timeline/regenerate` 触发重新生成
- 时间刻度表头可横滚（min-width 760px）
- 冲突事件朱砂红描边 + 脉冲动画
- 角色筛选 chip、幕次筛选、仅看冲突开关
- 冲突列表含"前往修正"按钮（跳转编辑器高亮）

### 3.2 逻辑闭环校验

| 路径 | 页面名称 |
|------|---------|
| `/editor/[scriptId]/validation` | 逻辑闭环校验 |

**当前能力**：
- 4 级漏洞 tab（严重缺陷 / 局部警告 / 优化提示 / 叙诡识别），带计数
- 每条漏洞含类型、标题、描述、位置、修复建议
- 一键修复、跳转原文高亮、标记叙诡操作
- 难度评估卡：等级 + 评分 + 5 维度进度条（线索数量/干扰项占比/诡计复杂度/沉浸门槛/逻辑闭环度）
- 叙诡识别：时间叙诡 / 身份叙诡 / 视角叙诡
- 全量校验通过真实接口刷新漏洞、叙诡与难度数据
- 跨模块变更提示 banner（StaleValidationBanner）

### 3.3 线索卡管理

| 路径 | 页面名称 |
|------|---------|
| `/editor/[scriptId]/clues` | 线索卡管理 |

**当前状态**：
- 两行联动标签栏：幕次行（全部/第一幕/第二幕/第三幕/真相复盘）+ 环节行（全部/公共/角色私有/关键证据/干扰线索）
- 标签栏计数实时更新，act 与 phase 双向联动
- 4 种视觉风格：ink 水墨 / film 胶片 / hand 手写 / mini 极简
- 每张卡含 corner 序号 + tag + title + text + foot 编号位置
- 干扰项 / 关键线索标记
- 深入 / 隐藏线索解锁层级展示
- 线索与复盘双向跳转
- 批量重绘仍待接入真实 AI 任务
- 批量导出 PDF / PNG ZIP 打包

### 3.4 人物关系图谱

| 路径 | 页面名称 |
|------|---------|
| `/editor/[scriptId]/relations` | 人物关系图谱 |

**当前状态**：
- 关系图 UI 与交互已实现，数据接入 `character_relations` 仍待补齐
- 3 种布局：力导向 / 环形 / 层级（AntV G6 实现）
- 明线实线金色，暗线虚线朱砂
- VIEW 模式 5 tab：全景 / 明线 / 暗线 / 阵营 / 亲密度
- FILTER 筛选 chips：沈家 / 外人 / 死者相关 / 凶手相关 / 医者相关
- 明暗线 / 标签三个开关
- 节点详情面板：头像 + 姓名 + 角色 + 简介 + 关联关系列表 + AI 调整快捷指令
- 双击连线弹出关系编辑面板（新增/删除/修改关系类型与标签）
- 节点拖拽与画布缩放平移
- 图谱导出 PNG / PDF（分辨率可选 1080p/2K/4K）

### 3.5 插画生成

| 路径 | 页面名称 |
|------|---------|
| `/editor/[scriptId]/illustrations` | 插画生成 |

**当前状态**：
- 6 类 tab：封面 / 场景 / 线索卡 / 公共线 / 人物立绘 / 海报（含计数）
- 资产列表含缩略图 + 标题 + 状态 + 类型 badge，支持类型筛选与计数
- 生成主区：多模型对比卡（DeepSeek-V4 / GLM-5.1 / 多模态融合）
- 生成卡含图片 + 模型 + seed + 采用/重绘/放大操作
- prompt-box：模型 / 比例 / 张数选择 + AUTO-INJECT 视觉基调提示
- 新建任务抽屉（4 步表单：基础 / Prompt / 参数 / 确认）
  - 类型卡单选、模型卡多选、比例/张数 chip、采样步数/CFG/风格强度滑块
  - 引用资产多选、高级折叠
  - 朱砂左边框 + "拟"字印章装饰
- 定稿保护、批量导出
- 生成任务仍待接入真实 `illustrationService`

---

## 四、设置与通知页（需登录）

| 路径 | 页面名称 | 内容 | 说明 |
|------|---------|-----------|------|
| `/settings` | 账号设置 | 昵称/手机号/邮箱展示 + 编辑表单 | 开发期 Mock 保存（标注"开发期 mock"） |
| `/settings/quota` | 额度管理 | 免费额度进度 + 套餐对比 + 升级表单 | 标注"开发期 mock" |
| `/notifications` | 通知列表 | 5 个筛选 tab + 通知项列表 | `notification-service` 返回 Mock 通知（校验/生成/版本/社区） |

---

## 五、编辑器入口说明

### 5.1 无剧本时的自动跳转

1. 用户登录后访问 `/editor`（侧栏「剧本编辑」）
2. `/editor/page.tsx` 查询用户剧本列表
3. **有剧本** → 重定向到 `/editor/[最近scriptId]`
4. **无剧本** → 重定向到 `/generate`，引导用户创建真实剧本

### 5.2 侧栏导航行为

- **有剧本时**：侧栏的「时间线校验/逻辑校验/线索卡管理/人物关系/插画生成」链接指向 `/editor/[scriptId]/[子页面]`
- **无剧本时**：侧栏子功能入口提示“请先创建或选择一个剧本”，并跳转 `/generate`

### 5.3 直接访问编辑器子页面

在浏览器地址栏直接输入以下路径即可查看对应真实剧本视图：

```
http://localhost:3000/editor/<scriptId>/timeline
http://localhost:3000/editor/<scriptId>/validation
http://localhost:3000/editor/<scriptId>/clues
http://localhost:3000/editor/<scriptId>/relations
http://localhost:3000/editor/<scriptId>/illustrations
```

---

## 六、数据来源状态索引

| 页面 | 当前数据来源 | 说明 |
|------|------------------|----------|
| 推广页 | `app/(marketing)/page.tsx` + `components/marketing/promo-props.tsx` | — |
| 概览页 | `lib/services/overview-service.ts` | `MOCK_DATA` |
| 编辑器 | `/api/editor/[scriptId]` 聚合真实剧本数据 | 无剧本统一进入 `/generate` |
| 时间线 | `/api/validate` + `/api/timeline/regenerate` | 基于真实 scriptId |
| 逻辑校验 | `/api/validate` | 全量校验走真实接口，局部数据装配仍在推进 |
| 线索卡 | 编辑器子页组件 | 真实 CRUD 与 AI 重绘仍待接入 |
| 人物关系 | 编辑器子页组件 | `character_relations` 数据接入仍待补齐 |
| 插画生成 | 编辑器子页组件 | 生成任务服务仍待接入 |
| 生成页 | `app/(dashboard)/generate/page.tsx` | `DEFAULT_PARAMS` / `MOCK_LINES` |
| 社区 | `lib/services/community-service.ts` | `MOCK_POSTS` / `MOCK_TOPICS` / `MOCK_AUTHORS` / `MOCK_RANK` / `MOCK_PULSE` |
| 通知 | `lib/services/notification-service.ts` | 内联 Mock 通知列表 |
| 账号设置 | `app/(dashboard)/settings/page.tsx` | 开发期 Mock 保存 |
| 额度管理 | `app/(dashboard)/settings/quota/page.tsx` | 开发期 Mock 套餐数据 |

---

## 七、快速预览清单（按推荐顺序）

1. `/` — 推广落地页（首屏视觉冲击）
2. `/dashboard` — 工作台概览（Mock 数据完整展示）
3. `/generate` — 创建第一部真实剧本
4. `/editor` — 自动进入最近剧本；无剧本时回到 `/generate`
5. `/editor/<scriptId>/timeline` — 时间线校验（可视化时间轴）
6. `/editor/<scriptId>/validation` — 逻辑闭环校验（漏洞分级 + 难度评估）
7. `/editor/<scriptId>/clues` — 线索卡管理（4 种风格 + 联动筛选）
8. `/editor/<scriptId>/relations` — 人物关系图谱（G6 关系图 + 3 种布局）
9. `/editor/<scriptId>/illustrations` — 插画生成（多模型对比 + 任务抽屉）
10. `/community` — 创作社区（瀑布流 + 双视角切换）
11. `/scripts/new` — 新建剧本（双栏布局 + 创建方式选择）
12. `/notifications` — 通知列表（5 类筛选）
13. `/settings` — 账号设置
14. `/settings/quota` — 额度管理
