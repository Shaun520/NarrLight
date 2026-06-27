# Implementation Plan: 叙光 - AI 驱动剧本杀全生命周期平台

**Branch**: `001-narrlight-platform` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-narrlight-platform/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

叙光是一个 AI 驱动的剧本杀全生命周期一站式平台，MVP 阶段覆盖 P1（剧本 AI 生成、时间线校验、线索卡管理）和 P2（人物关系可视化、插画生成）模块。技术方案采用 Next.js 全栈架构，前端使用 Ant Design + Tailwind CSS 4 构建结构化编辑器与可视化组件，**后端基于 Supabase BaaS 平台**提供完整的后端服务（PostgreSQL 数据库、Auth 认证、Realtime 实时订阅、Storage 文件存储），通过 Supabase Client SDK 和 Edge Functions 对接大模型服务实现剧本生成、逻辑校验等 AI 能力。

## Technical Context

**Language/Version**: TypeScript 5.x（前端 + 后端统一语言）

**Primary Dependencies**:
- 前端：Next.js 15、Ant Design 5、Tailwind CSS 4、Vite 8
- 可视化：AntV G6 + @antv/g6-extension-react（人物关系图）、D3.js 按需模块（时间线可视化）
- **后端服务：Supabase（BaaS 平台）**
  - `@supabase/supabase-js`：Supabase Client SDK（数据库查询、认证、实时订阅）
  - `@supabase/ssr`：Next.js App Router 服务端组件认证支持
  - Supabase Auth：用户认证与授权（手机号+验证码登录、Session 管理）
  - Supabase PostgreSQL：结构化剧本数据、用户数据存储
  - Supabase Realtime：实时数据同步（协作编辑状态、生成任务进度）
  - Supabase Storage：文件存储（线索卡 PDF/图片、插画素材）
  - Supabase Edge Functions：服务端逻辑（AI 生成接口、校验接口、导出接口）
- AI 集成：多模型策略 — DeepSeek V4 Pro（剧本生成+逻辑校验）+ GLM 5.1（格式化输出）+ 文心一言/通义千问（多模态插画），通过 Provider 抽象层统一管理
- PDF 生成：@react-pdf/renderer（JSX 语法定义 PDF 模板，Flexbox 布局，自定义字体，流式输出）

**Storage**: **Supabase 托管服务**
- **PostgreSQL**：结构化剧本数据、用户数据（通过 Supabase Dashboard 管理）
- **Auth**：用户认证与会话管理（手机号+验证码、JWT Token）
- **Realtime**：实时数据同步（生成任务状态、编辑锁、在线状态）
- **Storage**：文件存储（线索卡导出文件、AI 生成的插画素材）
- **Edge Functions**：服务端计算（AI 接口调用、业务逻辑处理）

**Testing**: Vitest + React Testing Library（单元/组件测试）+ Playwright（E2E 测试）

**Target Platform**: Web 浏览器（桌面端优先，响应式适配移动端查看）

**Project Type**: Web 应用（全栈，Next.js 前后端一体）

**Performance Goals**:
- AI 生成任务响应：首 token 延迟 < 3s，流式输出
- 页面交互反馈：< 100ms（宪法 VI 要求）
- 大型剧本（10 万字）编辑器加载：< 2s
- 时间线可视化渲染：< 1s

**Constraints**:
- 前端禁止使用蓝紫渐变色、字体图标（宪法 II）
- 禁止使用 CSS-in-JS 和 CSS Modules（宪法 III）
- 禁止使用 `any` 类型（宪法 IV）
- 所有交互元素必须支持 ARIA 和键盘导航（宪法 V）
- AI 生成需支持中断续传
- 免费额度 + 付费扩展模式

**Scale/Scope**:
- MVP 阶段目标用户：1k 创作者
- 并发 AI 生成任务：50
- 剧本数据量：单剧本最大 10 万字
- 页面数量：约 15-20 个核心页面

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | 原则 | 状态 | 说明 |
|---|------|------|------|
| I | Skill 优先执行 | ✅ 通过 | 实现阶段将检查并调用匹配的 Skill |
| II | 视觉与设计完整性 | ✅ 通过 | 设计方案禁止蓝紫渐变、字体图标，统一使用 SVG 图标，Ant Design + Tailwind CSS 保持一致性 |
| III | 技术栈锁定 | ✅ 通过 | 前端使用 Next.js + TypeScript + Ant Design + Tailwind CSS 4 + Vite 8，不引入 CSS-in-JS 或 CSS Modules |
| IV | 代码质量与简洁性 | ✅ 通过 | 禁止 `any`，使用 `unknown`；变量命名自解释 |
| V | 行为、伦理与可访问性 | ✅ 通过 | 不使用占位文本，实现真实 Loading/Error/Empty 状态，ARIA 属性和键盘导航，不硬编码密钥 |
| VI | 交互与响应标准 | ✅ 通过 | 交互反馈 < 100ms，破坏性操作需确认 |
| VII | 文档语言规范 | ✅ 通过 | 所有文档使用中文 |

**门控结果**: ✅ 全部通过，可进入 Phase 0 研究。

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/                          # Next.js App Router 页面
│   ├── (auth)/                   # 认证相关页面
│   │   ├── login/                # 登录页（Supabase Auth）
│   │   └── register/             # 注册页（Supabase Auth）
│   ├── (dashboard)/              # 主工作区
│   │   ├── scripts/              # 剧本管理列表
│   │   ├── editor/               # 剧本编辑器
│   │   │   └── [scriptId]/       # 具体剧本编辑
│   │   │       ├── timeline/     # 时间线校验
│   │   │       ├── clues/        # 线索卡管理
│   │   │       ├── relations/    # 人物关系图
│   │   │       └── validation/   # 逻辑校验
│   │   └── settings/             # 用户设置
│   └── api/                      # Next.js API Routes（轻量级代理层）
│       └── auth/                 # 认证回调（Supabase Auth Callback）
├── components/                   # 共享组件
│   ├── editor/                   # 结构化编辑器组件
│   ├── visualization/            # 可视化组件（时间线、关系图）
│   ├── clue-card/                # 线索卡组件
│   └── common/                   # 通用 UI 组件
├── lib/                          # 业务逻辑与工具
│   ├── supabase/                 # Supabase 客户端配置与管理
│   │   ├── client.ts             # 浏览器端 Supabase Client
│   │   ├── server.ts             # 服务端 Supabase Client（SSR 支持）
│   │   ├── middleware.ts         # Auth 中间件（Session 验证、路由保护）
│   │   └── types.ts              # Supabase 数据库类型定义
│   ├── ai/                       # AI 服务集成层
│   │   ├── providers/            # 大模型 Provider 抽象
│   │   ├── prompts/              # Prompt 模板管理
│   │   └── stream/               # 流式输出处理
│   ├── validation/               # 逻辑校验引擎
│   │   ├── timeline/             # 时间线校验
│   │   ├── logic/                # 逻辑闭环校验
│   │   └── difficulty/           # 难度评估
│   └── export/                   # 导出服务（PDF/图片）
├── hooks/                        # 自定义 React Hooks
├── stores/                       # 状态管理（Zustand + Supabase Realtime）
├── types/                        # TypeScript 类型定义
└── styles/                       # 全局样式（Tailwind 配置）

supabase/                         # Supabase 项目配置
├── config.toml                   # 本地开发配置
├── functions/                    # Edge Functions（服务端逻辑）
│   ├── generate/                 # AI 生成接口
│   ├── validate/                 # 校验接口
│   ├── clues/                    # 线索卡接口
│   └── export/                   # 导出接口
├── migrations/                   # 数据库迁移脚本
│   └── *.sql                     # Schema 变更 SQL
└── seed.sql                      # 种子数据

tests/
├── unit/                         # 单元测试
├── integration/                  # 集成测试
└── e2e/                          # 端到端测试
```

**Structure Decision**: 采用 **Next.js App Router + Supabase BaaS** 混合架构。前端页面路由放在 `app/` 目录，共享组件在 `components/`，业务逻辑在 `lib/`。**Supabase 提供完整的后端服务**：数据库操作通过 `lib/supabase/` 封装的 Client SDK 进行，认证由 Supabase Auth 处理，实时同步使用 Supabase Realtime，服务端计算逻辑部署在 Supabase Edge Functions（`supabase/functions/`）。Next.js API Routes 仅保留轻量级的认证回调代理。选择此架构是因为 Supabase 作为 BaaS 平台可大幅降低后端运维复杂度，提供开箱即用的数据库、认证、实时订阅和文件存储能力，让团队专注于业务逻辑和 AI 能力开发。

## Complexity Tracking

> Constitution Check 全部通过，无需记录违规豁免。
