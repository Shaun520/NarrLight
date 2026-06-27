# 研究报告：叙光平台技术选型

**日期**: 2026-06-17
**状态**: 已完成

## 研究任务清单

| # | 待澄清项 | 状态 |
|---|---------|------|
| 1 | AI 大模型服务选型 | ✅ 已解决 |
| 2 | PDF 生成方案选型 | ✅ 已解决 |
| 3 | 测试框架选型 | ✅ 已解决 |
| 4 | 可视化库选型 | ✅ 已解决 |

---

## 1. AI 大模型服务选型

### 决策：多模型策略 + Provider 抽象层

采用多模型组合策略，通过统一的 Provider 抽象层对接不同大模型，按场景选择最优模型：

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 剧本创意生成 | DeepSeek V4 Pro | 创意写作评分 82.25，重复率最低（3.2），1M 超长上下文适合长篇剧本，MIT 开源成本低 |
| 逻辑校验 & 推理 | DeepSeek V4 Pro | 逻辑推理能力天花板（96 分），适合时间线冲突检测、逻辑漏洞分析 |
| 格式化输出 & 指令遵循 | GLM 5.1 | IFEval 指令遵循评分 92（中文模型最高），适合严格格式约束的结构化输出 |
| 插画生成（多模态） | 文心一言 / 通义千问 | 多模态能力领先，支持图文混合生成 |

### 理由

- 剧本杀创作是高度中文语境的任务，国产大模型在中文创意写作上已接近甚至超越海外模型
- DeepSeek V4 Pro 在创意写作和逻辑推理上均表现优异，且 API 价格仅为海外模型的 1/20，性价比极高
- GLM 5.1 的指令遵循能力确保结构化输出（人物剧本、线索卡等）格式稳定
- 多模型策略避免单点依赖，Provider 抽象层使模型切换对业务代码透明

### 备选方案

| 方案 | 评价 |
|------|------|
| 单一模型（OpenAI GPT-5.5） | 中文创意写作弱于国产头部模型，成本高 10-20 倍 |
| 单一模型（文心一言） | 创意写作强但逻辑推理弱，不适合校验场景 |
| 全部自部署开源模型 | 运维成本高，MVP 阶段不划算 |

### 架构设计

```
src/lib/ai/
├── providers/
│   ├── base-provider.ts      # Provider 抽象接口
│   ├── deepseek-provider.ts  # DeepSeek V4 Pro
│   ├── glm-provider.ts       # GLM 5.1
│   └── qwen-provider.ts      # 通义千问（备用）
├── prompts/
│   ├── script-generation.ts  # 剧本生成 Prompt 模板
│   ├── logic-validation.ts   # 逻辑校验 Prompt 模板
│   └── difficulty-assess.ts  # 难度评估 Prompt 模板
└── stream/
    └── sse-handler.ts        # 流式输出处理
```

---

## 2. PDF 生成方案选型

### 决策：@react-pdf/renderer

### 理由

| 评估维度 | @react-pdf/renderer | Puppeteer/Playwright | jsPDF |
|---------|---------------------|---------------------|-------|
| Serverless 兼容 | ✅ 原生支持 | ❌ 需要 Chrome | ✅ 客户端 |
| 布局能力 | Flexbox 布局 | 完整 HTML/CSS | 手动坐标 |
| 与 React 集成 | JSX 语法，React 组件 | 需渲染 HTML | 无集成 |
| 包体积 | ~500KB | ~300MB（含 Chrome） | ~300KB |
| 自定义字体 | ✅ 支持 TTF/OTF | ✅ 浏览器原生 | ⚠️ 有限 |
| 部署复杂度 | 低 | 高（Docker 依赖） | 低 |

选择 @react-pdf/renderer 的核心原因：
1. **与项目技术栈一致**：使用 JSX 语法定义 PDF 模板，与 React 组件开发体验一致
2. **无需 headless browser**：原生生成 PDF，兼容 serverless 部署（Vercel 等）
3. **Flexbox 布局**：适合线索卡的复杂版式设计（自定义尺寸、边距、配色模板）
4. **自定义字体**：支持注册中文字体（TTF/OTF），确保中文内容正确渲染
5. **流式输出**：支持大文档流式生成，适合批量线索卡导出

### 备选方案

| 方案 | 评价 |
|------|------|
| Puppeteer | CSS 支持最完整，但部署复杂，Vercel 不支持，MVP 阶段过度 |
| jsPDF | 轻量但布局能力弱，手动坐标不适合复杂版式 |
| PDF4.dev API | 外部服务依赖，增加成本和网络延迟 |

---

## 3. 测试框架选型

### 决策：Vitest + React Testing Library + Playwright

### 理由

| 评估维度 | Vitest 4.1 | Jest 30 |
|---------|-----------|---------|
| 与 Vite 集成 | ✅ 原生，零配置 | ⚠️ 需 ts-jest/babel |
| TypeScript 支持 | ✅ 原生 esbuild | ⚠️ 需 ts-jest |
| Watch 模式速度 | ~380ms | ~3.4s（9x 差距） |
| ESM 支持 | ✅ 原生 | ✅ Jest 30 改善但仍需配置 |
| API 兼容性 | 与 Jest ~95% 兼容 | - |
| 浏览器模式 | ✅ Vitest 4.1 Browser Mode | ❌ |

选择 Vitest 的核心原因：
1. **与项目 Vite 构建工具原生集成**：零配置 TypeScript，复用 Vite 配置
2. **速度优势显著**：Watch 模式 9x 更快，TDD 体验极佳
3. **2026 年新项目标准选择**：Next.js 新项目默认推荐
4. **Jest API 兼容**：迁移成本低，生态工具通用

测试策略分层：
- **单元测试**：Vitest + React Testing Library（纯逻辑、组件）
- **集成测试**：Vitest + MSW（API 路由、数据流）
- **E2E 测试**：Playwright（核心用户流程）

### 备选方案

| 方案 | 评价 |
|------|------|
| Jest 30 | 成熟稳定，但配置复杂，速度慢，新项目无优势 |
| 纯 Playwright | E2E 强但单元测试不适用，需搭配其他框架 |

---

## 4. 可视化库选型

### 决策：AntV G6（人物关系图）+ D3.js（时间线可视化）

### 理由

#### 人物关系图：AntV G6

| 评估维度 | AntV G6 | D3.js | Cytoscape.js |
|---------|---------|-------|-------------|
| 关系图专业度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| React 集成 | ✅ @antv/g6-extension-react | ⚠️ 需手动封装 | ⚠️ 需手动封装 |
| 内置布局 | ✅ 10+ 种（含力导向） | ⚠️ 需自行组合 | ✅ 丰富 |
| 与 Ant Design 生态 | ✅ 同属 Ant 生态 | ❌ | ❌ |
| 中文文档 | ✅ 完善 | ⚠️ 社区翻译 | ⚠️ 有限 |
| 交互能力 | ✅ 拖拽、缩放、选中 | ⚠️ 需手动实现 | ✅ 丰富 |

选择 G6 的核心原因：
1. **专业关系图引擎**：内置力导向布局、拖拽交互、节点选中高亮等开箱即用
2. **React 节点支持**：通过 `@antv/g6-extension-react` 直接用 React 组件作为节点内容，可与 Ant Design 组件无缝集成
3. **Ant 生态一致**：与项目使用的 Ant Design 同属 Ant 设计体系，视觉风格统一
4. **中文文档完善**：降低团队学习成本

#### 时间线可视化：D3.js

时间线可视化需求高度定制化（多角色时间轴叠加、冲突标注、幕次分段），G6 的图模型不适合时间线场景。选择 D3.js 原因：
1. **底层控制力**：时间线需要精确控制 SVG 元素位置、动画、交互
2. **灵活性**：可完全自定义时间轴样式、冲突标注、缩放平移等交互
3. **轻量引入**：按需引入 d3-scale、d3-axis、d3-zoom 等模块，不需要整个 D3 库

### 备选方案

| 方案 | 评价 |
|------|------|
| ECharts 关系图 | 通用图表库，关系图能力弱于 G6，不适合复杂交互 |
| vis-timeline | 专用时间线库，但定制性不足，不支持冲突标注等剧本杀特有需求 |
| Graphin | 基于 G6 的 React 封装，但更新滞后于 G6，直接用 G6 + React 扩展更灵活 |

---

## 技术上下文更新

基于研究结果，更新 plan.md 中的 Technical Context：

| 原标记 | 更新为 |
|--------|--------|
| NEEDS CLARIFICATION（AI 集成） | 多模型策略：DeepSeek V4 Pro（生成+校验）+ GLM 5.1（格式化输出）+ 文心一言/通义千问（多模态），通过 Provider 抽象层统一管理 |
| NEEDS CLARIFICATION（PDF 生成） | @react-pdf/renderer，JSX 语法定义 PDF 模板，支持 Flexbox 布局、自定义字体、流式输出 |
| NEEDS CLARIFICATION（测试） | Vitest + React Testing Library（单元/组件测试）+ Playwright（E2E 测试） |
| D3.js 或 AntV G6（可视化） | AntV G6 + @antv/g6-extension-react（人物关系图）+ D3.js 按需模块（时间线可视化） |
