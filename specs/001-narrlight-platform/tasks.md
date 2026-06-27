# Tasks: 叙光 - AI 驱动剧本杀全生命周期平台

**Input**: Design documents from `/specs/001-narrlight-platform/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [research.md](./research.md), [quickstart.md](./quickstart.md)

**Tests**: 本任务列表包含可选测试任务，仅在明确需要 TDD 或验收回归时执行。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化项目结构、Supabase BaaS 环境、设计系统与核心依赖

- [x] T001 初始化 Next.js 15 + TypeScript 项目，安装核心依赖（narr-light/package.json）
- [x] T002 [P] 配置 Tailwind CSS 全局样式与主题变量（narr-light/app/globals.css、narr-light/tailwind.config.ts）
- [x] T003 配置 Ant Design 5 与 Tailwind 的样式隔离方案（narr-light/app/layout.tsx）
- [x] T004 初始化 Supabase 项目配置与本地 CLI 环境（narr-light/supabase/config.toml）
- [x] T005 [P] 配置 Supabase 浏览器端与服务端 Client SDK（narr-light/lib/supabase/client.ts、narr-light/lib/supabase/server.ts）
- [x] T006 创建 Supabase 数据库迁移脚本（users、scripts、characters、acts、scenes、clues、relations、timeline、version_snapshots、generation_tasks、validation_reports、difficulty_assessments）
- [x] T007 生成 Supabase TypeScript 数据库类型定义（narr-light/lib/supabase/types.ts）
- [x] T008 配置认证中间件与受保护路由（narr-light/lib/supabase/middleware.ts）
- [x] T009 安装可视化库（AntV G6 + @antv/g6-extension-react、D3.js 按需模块）
- [x] T010 安装 PDF 与导出依赖（@react-pdf/renderer、html-to-image）
- [x] T011 [P] 配置 ESLint、Prettier、Vitest 与 Playwright 测试环境（narr-light/vitest.config.ts、.prettierrc）
- [x] T012 创建共享 UI 组件库（Button、Input、Card、Modal、Empty、Loading、Badge）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事依赖的核心基础设施与领域模型

**⚠️ CRITICAL**: 在完成此阶段前，不应开始任何用户故事的具体实现

- [ ] T013 实现项目全局类型定义（narr-light/types/index.ts：Script、Character、Clue、Act、Scene、TimelineEvent、ValidationIssue 等）
- [ ] T014 实现统一 API 响应与错误处理封装（narr-light/lib/api/response.ts）
- [ ] T015 实现 Supabase 数据库访问层基础封装（narr-light/lib/db/base-repository.ts）
- [ ] T016 实现 AI Provider 抽象层与 DeepSeek / GLM Provider（narr-light/lib/ai/providers/base-provider.ts、deepseek-provider.ts、glm-provider.ts）
- [ ] T017 实现流式 SSE 输出处理模块（narr-light/lib/ai/stream/sse-handler.ts）
- [ ] T018 实现用户额度与配额检查服务（narr-light/lib/services/quota-service.ts）
- [ ] T019 实现通用内容安全与合规预检工具（narr-light/lib/utils/content-safety.ts）
- [ ] T020 实现版本快照存储与回滚服务（narr-light/lib/services/version-service.ts）
- [ ] T021 创建应用主布局与导航（narr-light/app/layout.tsx、narr-light/app/(dashboard)/layout.tsx）

**Checkpoint**: 基础架构就绪，用户故事可并行启动

---

## Phase 3: User Story 1 - 剧本 AI 生成与智能调整 (Priority: P1) 🎯 MVP

**Goal**: 作者通过参数一键生成完整结构化剧本，并支持局部智能调整、版本回退与合规适配。

**Independent Test**: 选择题材=情感、6人、5小时、新手难度、古风背景、家国亲情立意，一键生成完整剧本；验证包含人物剧本、组织者手册、线索卡、真相复盘；对第二幕执行「增加公共搜证环节」局部调整，确认仅第二幕变化。

### Tests for User Story 1 (Optional)

- [ ] T022 [P] [US1] 编写 AI 剧本生成集成测试（tests/integration/script-generation.test.ts）
- [ ] T023 [P] [US1] 编写版本快照回退单元测试（tests/unit/version-service.test.ts）

### Implementation for User Story 1

- [ ] T024 [P] [US1] 创建 User 与 Script 的数据库模型及 Supabase 类型（supabase/migrations/001_users_and_scripts.sql）
- [ ] T025 [P] [US1] 创建 Character、Act、Scene 数据库表（supabase/migrations/002_characters_acts_scenes.sql）
- [ ] T026 [US1] 实现剧本元信息创建与列表服务（narr-light/lib/services/script-service.ts）
- [ ] T027 [US1] 实现剧本列表页与新建剧本页（narr-light/app/(dashboard)/scripts/page.tsx、narr-light/app/(dashboard)/scripts/new/page.tsx）
- [ ] T028 [US1] 实现剧本结构化编辑器布局（人物剧本 / 组织者手册 / 线索卡 / 复盘 分区域）（narr-light/app/(dashboard)/editor/[scriptId]/page.tsx）
- [ ] T029 [US1] 实现剧本生成 Prompt 模板（narr-light/lib/ai/prompts/script-generation.ts）
- [ ] T030 [US1] 实现 AI 全本生成 Edge Function（supabase/functions/generate/index.ts：FULL_SCRIPT 类型）
- [ ] T031 [US1] 实现生成任务状态管理与 SSE 进度推送（narr-light/lib/services/generation-task-service.ts）
- [ ] T032 [US1] 实现局部调整 Prompt 模板与 Edge Function（CHARACTER_ADJUST、CLUE_MODIFY、TRICK_REPLACE、STYLE_CHANGE、COMPRESS、COMPLIANCE）
- [ ] T033 [US1] 实现生成结果解析与结构化入库（narr-light/lib/services/script-import-service.ts）
- [ ] T034 [US1] 实现参数合理性检查与二次确认弹窗（narr-light/components/script/param-validator.tsx）
- [ ] T035 [US1] 实现版本历史面板与一键回退（narr-light/app/(dashboard)/editor/[scriptId]/versions/page.tsx）
- [ ] T036 [US1] 实现版本差异对比视图（narr-light/components/editor/version-diff.tsx）
- [ ] T037 [US1] 实现中断续传状态恢复（narr-light/lib/services/generation-resume-service.ts）
- [ ] T038 [US1] 实现内容违规拦截提示（narr-light/components/common/content-blocked-modal.tsx）
- [ ] T039 [US1] 实现剧本编辑器搜索与章节跳转（narr-light/components/editor/script-outline.tsx）

**Checkpoint**: User Story 1 可独立运行，支持从参数生成到局部调整、版本回退的完整闭环

---

## Phase 4: User Story 2 - 时间线校验与逻辑校验 (Priority: P1)

**Goal**: 系统自动提取时间线并可视化，检测逻辑漏洞与难度评估，支持增量复检与报告导出。

**Independent Test**: 导入一部已知存在时间线冲突和逻辑漏洞的测试剧本，执行全量校验，验证可视化时间轴正确标注冲突点、逻辑漏洞列表按严重等级分级、一键修复可修正对应段落。

### Tests for User Story 2 (Optional)

- [ ] T040 [P] [US2] 编写时间线冲突检测单元测试（tests/unit/timeline-validation.test.ts）
- [ ] T041 [P] [US2] 编写逻辑闭环校验单元测试（tests/unit/logic-validation.test.ts）

### Implementation for User Story 2

- [ ] T042 [P] [US2] 创建 Timeline、TimelineEvent、ValidationReport、DifficultyAssessment 数据库表（supabase/migrations/003_timeline_validation.sql）
- [ ] T043 [US2] 实现时间线自动提取服务（narr-light/lib/validation/timeline/extractor.ts）
- [ ] T044 [US2] 实现时间线冲突检测算法（narr-light/lib/validation/timeline/conflict-detector.ts）
- [ ] T045 [US2] 实现时间线校验 Edge Function（supabase/functions/validate/index.ts：TIMELINE 类型）
- [ ] T046 [US2] 实现可视化时间轴组件（narr-light/components/visualization/timeline-chart.tsx）
- [ ] T047 [US2] 实现时间线事件手动修正与原文同步（narr-light/app/(dashboard)/editor/[scriptId]/timeline/page.tsx）
- [ ] T048 [US2] 实现逻辑闭环校验 Prompt 模板（narr-light/lib/ai/prompts/logic-validation.ts）
- [ ] T049 [US2] 实现逻辑校验 Edge Function（supabase/functions/validate/index.ts：LOGIC / FULL 类型）
- [ ] T050 [US2] 实现漏洞严重等级分类与筛选（narr-light/lib/validation/logic/issue-classifier.ts）
- [ ] T051 [US2] 实现漏洞定位跳转与高亮（narr-light/components/editor/issue-locator.tsx）
- [ ] T052 [US2] 实现一键按建议修复功能（narr-light/lib/services/auto-fix-service.ts）
- [ ] T053 [US2] 实现增量复检逻辑（narr-light/lib/services/incremental-validation-service.ts）
- [ ] T054 [US2] 实现难度评估算法与 Edge Function（narr-light/lib/validation/difficulty/assessor.ts）
- [ ] T055 [US2] 实现叙诡识别与手动标记排除（narr-light/lib/validation/logic/narrative-trick-detector.ts）
- [ ] T056 [US2] 实现校验报告 PDF 导出（narr-light/lib/export/validation-report-pdf.tsx）
- [ ] T057 [US2] 实现跨模块变更提示（创作修改 / 线索变更后提示重新校验）（narr-light/components/common/stale-validation-banner.tsx）

**Checkpoint**: User Story 2 可独立运行，支持时间线、逻辑闭环、难度评估、报告导出

---

## Phase 5: User Story 3 - 线索卡管理 (Priority: P1)

**Goal**: 自动解析与分类剧本线索，支持手动标记、编辑关联、批量导出可打印线索卡。

**Independent Test**: 导入包含物证/口供/深入/隐藏线索的剧本，验证自动分类正确；标记干扰项/关键线索；选择 A5 尺寸 PDF 导出，确认版式整齐、中文渲染正确。

### Tests for User Story 3 (Optional)

- [ ] T058 [P] [US3] 编写线索自动解析单元测试（tests/unit/clue-extractor.test.ts）
- [ ] T059 [P] [US3] 编写线索卡导出集成测试（tests/integration/clue-export.test.ts）

### Implementation for User Story 3

- [ ] T060 [US3] 创建 Clue 数据库表（supabase/migrations/004_clues.sql）
- [ ] T061 [US3] 实现线索自动解析与分类服务（narr-light/lib/services/clue-extractor.ts）
- [ ] T062 [US3] 实现线索管理页面与多维筛选（narr-light/app/(dashboard)/editor/[scriptId]/clues/page.tsx）
- [ ] T063 [US3] 实现线索详情与关联展示（人物/地点/真相）（narr-light/components/clue-card/clue-detail.tsx）
- [ ] T064 [US3] 实现线索编辑与跨模块同步（narr-light/lib/services/clue-service.ts）
- [ ] T065 [US3] 实现干扰项 / 关键线索标记（narr-light/components/clue-card/clue-tags.tsx）
- [ ] T066 [US3] 实现深入线索 / 隐藏线索解锁层级展示（narr-light/components/clue-card/clue-hierarchy.tsx）
- [ ] T067 [US3] 实现线索卡版式模板配置（narr-light/lib/export/clue-card-templates.ts）
- [ ] T068 [US3] 实现线索卡 PDF 导出服务（narr-light/lib/export/clue-pdf-export.tsx）
- [ ] T069 [US3] 实现线索卡图片导出与 ZIP 打包服务（narr-light/lib/export/clue-image-export.ts）
- [ ] T070 [US3] 实现批量导出任务进度展示（narr-light/components/clue-card/export-progress.tsx）
- [ ] T071 [US3] 实现线索与复盘双向跳转（narr-light/components/clue-card/truth-link.tsx）

**Checkpoint**: User Story 3 可独立运行，支持线索分类、编辑、标记、导出

---

## Phase 6: User Story 4 - 人物关系可视化与分镜可视化 (Priority: P2)

**Goal**: 自动生成可交互人物关系图谱并支持手动编辑，针对关键场景生成分镜脚本与画面。

**Independent Test**: 导入一部含多个人物关系的剧本，验证自动生成关系图谱、明暗线区分显示、双击关系线可编辑、分镜脚本可生成对应场景插画。

### Tests for User Story 4 (Optional)

- [ ] T072 [P] [US4] 编写人物关系提取单元测试（tests/unit/relation-extractor.test.ts）
- [ ] T073 [P] [US4] 编写分镜脚本生成单元测试（tests/unit/storyboard-generator.test.ts）

### Implementation for User Story 4

- [ ] T074 [US4] 创建 CharacterRelation 数据库表（supabase/migrations/005_relations.sql）
- [ ] T075 [US4] 实现人物关系自动提取服务（narr-light/lib/services/relation-extractor.ts）
- [ ] T076 [US4] 实现人物关系图谱页面（narr-light/app/(dashboard)/editor/[scriptId]/relations/page.tsx）
- [ ] T077 [US4] 实现 AntV G6 关系图组件（narr-light/components/visualization/relation-graph.tsx）
- [ ] T078 [US4] 实现明暗线关系样式区分与图例（narr-light/components/visualization/relation-legend.tsx）
- [ ] T079 [US4] 实现关系编辑面板（新增 / 删除 / 修改关系）（narr-light/components/visualization/relation-editor.tsx）
- [ ] T080 [US4] 实现节点拖拽与力导向布局（narr-light/components/visualization/relation-graph.tsx）
- [ ] T081 [US4] 实现关系图谱导出 PNG/PDF（narr-light/lib/export/relation-graph-export.ts）
- [ ] T082 [US4] 实现分镜脚本自动生成功能（narr-light/lib/services/storyboard-generator.ts）
- [ ] T083 [US4] 实现分镜脚本与插画生成 Edge Function（supabase/functions/generate/index.ts：ILLUSTRATION 类型）
- [ ] T084 [US4] 实现分镜浏览与台词展示页面（narr-light/app/(dashboard)/editor/[scriptId]/storyboard/page.tsx）
- [ ] T085 [US4] 实现插画风格统一性与人物形象一致性控制（narr-light/lib/ai/prompts/illustration-style.ts）
- [ ] T086 [US4] 实现分镜导出 PDF 功能（narr-light/lib/export/storyboard-pdf.tsx）

**Checkpoint**: User Story 4 可独立运行，支持关系图谱编辑与分镜画面生成

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨用户故事的优化、文档、性能与可访问性收尾

- [ ] T087 [P] 实现全局 Loading / Error / Empty 状态组件（narr-light/components/common/state-views.tsx）
- [ ] T088 统一所有页面的 ARIA 属性与键盘导航支持
- [ ] T089 实现移动端响应式适配（编辑器、时间轴、关系图）
- [ ] T090 实现 AI 生成任务队列与并发控制（narr-light/lib/services/generation-queue-service.ts）
- [ ] T091 实现免费额度与付费扩展计费入口（narr-light/app/(dashboard)/settings/quota/page.tsx）
- [ ] T092 实现应用性能监控与关键路径日志（narr-light/lib/utils/performance.ts）
- [ ] T093 [P] 补充核心组件单元测试（narr-light/tests/unit/components/）
- [ ] T094 运行 quickstart.md 端到端验证场景并修复问题
- [ ] T095 更新 API 文档与数据模型文档，确保与实现一致（specs/001-narrlight-platform/contracts/api.md、data-model.md）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，可立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1 完成，阻塞所有用户故事
- **Phase 3-6 (User Stories)**: 均依赖 Phase 2 完成；US1/2/3/4 可并行开发（按团队容量）
- **Phase 7 (Polish)**: 依赖所有已选用户故事完成

### User Story Dependencies

| User Story | 优先级 | 依赖 | 说明 |
|------------|--------|------|------|
| US1 剧本 AI 生成 | P1 | Phase 2 | 无其他用户故事依赖，MVP 核心 |
| US2 时间线/逻辑校验 | P1 | Phase 2 | 依赖 US1 生成的剧本数据作为输入，但可用测试剧本独立验证 |
| US3 线索卡管理 | P1 | Phase 2 | 依赖 US1 生成的线索数据，但可独立实现导入与导出 |
| US4 人物关系/分镜 | P2 | Phase 2 | 依赖 US1 的人物与场景数据，可独立测试 |

### Within Each User Story

1. 数据库模型 / 类型定义
2. 服务端服务 / Edge Functions
3. 前端页面与组件
4. 集成与端到端验证

### Parallel Opportunities

- Phase 1 中所有标 [P] 的任务可并行
- Phase 2 中所有标 [P] 的任务可并行
- Phase 3-6 四个用户故事可在团队充足时并行开发
- 同一用户故事内标 [P] 的模型/测试任务可并行

---

## Parallel Example: User Story 1

```text
T024 [P] User/Script 模型
T025 [P] Character/Act/Scene 模型
      ↓
T026 剧本服务
      ↓
T027 剧本列表 / 新建页
T028 结构化编辑器布局
      ↓
T029 Prompt 模板  +  T030 Edge Function
      ↓
T031 任务状态管理 → T037 中断续传
      ↓
T032 局部调整  +  T034 参数校验
      ↓
T035 版本历史  +  T036 差异对比
```

---

## Summary

- **Total Tasks**: 95
- **Phase 1 (Setup)**: 12 tasks
- **Phase 2 (Foundational)**: 9 tasks
- **Phase 3 (US1)**: 18 tasks
- **Phase 4 (US2)**: 16 tasks
- **Phase 5 (US3)**: 14 tasks
- **Phase 6 (US4)**: 13 tasks
- **Phase 7 (Polish)**: 9 tasks
- **Suggested MVP Scope**: User Story 1（剧本 AI 生成与智能调整）
- **Recommended First Deliverable**: T001 → T021 → US1 checkpoint（可运行的剧本生成 demo）
