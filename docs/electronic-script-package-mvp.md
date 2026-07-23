# 电子剧本包 MVP 方案

## 背景

用户调研样本中的剧本 PDF 不是同一模板换皮，而是“内容结构相似、阅读媒介和排版语言差异很大”的发行材料。系统如果只导出一份编辑器正文 PDF，无法接近成熟剧本杀电子版的阅读体验。

本 MVP 的目标是先做一套可落地的“电子剧本包”能力：从现有结构化剧本数据生成可交付的玩家角色本、DM 手册和线索卡包，并支持两种明显不同的风格。

## 样本观察

### 1.pdf：传统文本发行本

特征：

- 纯文本为主，正文密集。
- 页面有细边框、页眉、小标题和页码。
- 信息设计偏“证词、回忆、行动记录”。
- 重点信息通过加粗、下划线或段落位置提示。
- 适合硬核推理、机制推理、传统还原本。

对系统的启发：

- 每幕正文需要清晰承载时间、地点、人物、行动、矛盾点。
- 关键事实要嵌入叙事，而不是直接列答案。
- 每幕末尾应有明确行动暗示或任务。
- 适合做 `classic-text` 风格。

### 当归1.pdf：水墨文学沉浸本

特征：

- 封面和章节页重视留白、植物、水墨和书法标题。
- 章节标题有文学感，不只是“第一幕/第二幕”。
- 正文强调情绪、记忆、关系变化和角色心境。
- 插图参与氛围营造，而不是简单装饰。
- 适合情感本、古风本、沉浸还原本。

对系统的启发：

- 角色本需要有“核心情绪弧线”，例如亏欠、执念、遗憾、妒意、愧疚。
- 任务可以包装成情感目标，而不是机械清单。
- 章节图、章节标题、分隔页要参与叙事。
- 适合做 `ink-literary` 风格。

### 白露_encrypt.pdf：诗意小册 / 阶段补充本

特征：

- 页面较小，留白多。
- 标题页、分隔页和短文本比例高。
- 信息密度低，但单页情绪指向明确。
- 像一封信、一组碎片回忆或阶段补充剧本。
- 适合逐步解锁角色记忆。

对系统的启发：

- 角色本不一定总是长文，可以支持碎片化内容块。
- 每页可以只承载一个秘密、一个情绪或一个记忆片段。
- 后续可扩展“阶段补充剧本”，但 MVP 先不完整实现。

### 星期三.pdf：漫画 / 手写日志媒介本

特征：

- 开头使用漫画分镜，不是传统正文。
- 后续使用横线纸、手写稿、日记感页面。
- 内容不是“作者讲故事”，而是“角色留下的材料”。
- 媒介本身就是叙事机制。

对系统的启发：

- 第二阶段可扩展 `comic-journal`，支持漫画分镜、手写纸、病历、聊天记录、调查档案等媒介。
- MVP 不优先做，因为它依赖图片生成、手写字体、分镜编排和更复杂的导出渲染。

## MVP 范围

本次 MVP 做：

- 电子剧本包入口。
- 角色本生成与预览。
- DM 手册生成与预览。
- 线索卡包复用现有导出能力。
- 两套风格：
  - `classic-text`：传统文本发行本。
  - `ink-literary`：水墨文学沉浸本。
- 导出 ZIP，包含每名玩家的角色本 PDF、DM 手册 PDF、线索卡文件。

本次 MVP 不做：

- 在线玩家阅读器。
- 分享链接和权限控制。
- 漫画分镜本。
- 手写日志风整套模板。
- 自动排版纠错后台服务。
- 商业发行水印和版权防泄漏系统。

## 核心数据结构

### ElectronicScriptPackage

```ts
interface ElectronicScriptPackage {
  script: {
    id: string;
    title: string;
    genre: string;
    playerCount: number;
    durationHours: number;
  };
  stylePreset: 'classic-text' | 'ink-literary';
  playerBooks: PlayerBook[];
  dmManual: DmManual;
  clues: PackageClue[];
}
```

### PlayerBook

角色本不是单纯章节正文，必须包含玩家开本时真正需要的信息控制。

```ts
interface PlayerBook {
  characterCard: {
    characterId: string;
    name: string;
    identity: string;
    publicIntro: string;
    relationshipSummary: string;
  };
  openingBrief: {
    whatYouKnow: string[];
    whatYouWant: string[];
    whatYouFear: string[];
  };
  contentDesign: {
    narrativeMode:
      | 'case-testimony'
      | 'linear-memory'
      | 'literary-fragments';
    revealMode: 'per-act' | 'fragmented';
    playerPressure:
      | 'hide-secret'
      | 'find-truth'
      | 'protect-someone'
      | 'survive'
      | 'confess';
    taskStyle:
      | 'explicit-checklist'
      | 'emotional-goal'
      | 'hidden-trigger';
  };
  chapters: PlayerBookChapter[];
  relationshipNotes: RelationshipNote[];
  timeline: PlayerPrivateTimelineItem[];
  endingHooks: {
    confessionPrompt?: string;
    finalChoice?: string;
    possibleEnding?: string;
  };
}
```

### PlayerBookChapter

```ts
interface PlayerBookChapter {
  actNo: number;
  title: string;
  subtitle?: string;
  mood: string;
  contentBlocks: Array<{
    type: 'prose' | 'memory' | 'letter' | 'task' | 'rule' | 'note';
    title?: string;
    content: string;
  }>;
  keyMemories: string[];
  privateInfo: string[];
  tasks: Array<{
    title: string;
    description: string;
    visibility: 'public' | 'private';
    priority: 'must' | 'optional';
  }>;
  canSay: string[];
  cannotSay: string[];
  unlockAfter?: string;
}
```

### DmManual

```ts
interface DmManual {
  openingFlow: string[];
  actFlow: Array<{
    actNo: number;
    dmGoal: string;
    estimatedMinutes?: number;
    publicBriefing?: string;
    clueRelease: string[];
    rescueHints: string[];
  }>;
  timeline: Array<{
    time: string;
    publicVersion: string;
    truth: string;
  }>;
  truthReview: string;
  npcGuide: string[];
  rescueHints: string[];
}
```

### PackageClue

```ts
interface PackageClue {
  id: string;
  title: string;
  content: string;
  location: string;
  unlockCondition?: string;
  isKeyClue: boolean;
  isDistractor: boolean;
}
```

## 角色本内容设计规则

### 通用规则

每名玩家角色本必须回答：

- 我是谁。
- 我认识谁。
- 我现在想要什么。
- 我害怕别人知道什么。
- 这一幕我应该读什么。
- 这一幕我可以说什么。
- 这一幕我不能说什么。
- 这一幕我要做什么。

每幕建议：

- 1 个情绪目标。
- 1 到 3 个任务。
- 2 到 5 条本幕私密信息。
- 1 到 3 条可说信息。
- 1 到 3 条不可说信息。

### classic-text 内容设计

对应传统文本发行本。

生成要求：

- 以时间线和行动记录为主。
- 每幕按“场景 - 事件 - 心理 - 任务”推进。
- 关键事实可以通过加粗或重点段落标记。
- 任务使用明确清单。
- 可说 / 不可说规则直接列出。

适合字段映射：

- `narrativeMode = 'case-testimony'`
- `revealMode = 'per-act'`
- `taskStyle = 'explicit-checklist'`

页面结构：

1. 封面。
2. 角色卡。
3. 开局须知。
4. 第一幕正文。
5. 第一幕任务与可说 / 不可说。
6. 第二幕正文。
7. 第二幕任务与可说 / 不可说。
8. 终局前提示。
9. 私人时间线。

### ink-literary 内容设计

对应水墨文学沉浸本。

生成要求：

- 以记忆、关系、物件、情绪转折为主。
- 章节标题要有文学感，但不能遮蔽信息。
- 任务可以写成情感目标。
- 私密信息可以通过旧物、称呼、回忆片段释放。
- 每章需要一个 mood，用于控制文字和版式。

适合字段映射：

- `narrativeMode = 'linear-memory'` 或 `literary-fragments`
- `revealMode = 'fragmented'`
- `taskStyle = 'emotional-goal'`

页面结构：

1. 水墨封面。
2. 人物题记。
3. 角色关系短页。
4. 章节分隔页。
5. 章节正文。
6. 本章记忆碎片。
7. 本章情感目标。
8. 可说 / 不可说。
9. 终局前独白。

## 视觉与导出方案

### classic-text 视觉

- A4 或接近 A4 页面。
- 米白背景。
- 细边框。
- 页眉显示剧本名、角色名、幕次。
- 正文字号稳定，行距适中。
- 重点信息使用加粗、下划线、浅色底纹。

### ink-literary 视觉

- 大留白。
- 章节页使用书法标题。
- 可使用水墨植物或抽象纹理作为背景。
- 正文更松，段落更短。
- 页面底部可使用小印章、细线或诗性分隔符。

### 导出方式

MVP 优先使用 HTML/CSS print renderer：

- 先生成电子包预览 HTML。
- 再通过浏览器打印或服务端渲染导出 PDF。
- ZIP 打包每个角色 PDF、DM 手册 PDF、线索卡导出文件。

不优先使用纯 `@react-pdf/renderer` 承载所有样式，因为样本中的纹理、插图、留白、手写纸和复杂排版更适合 HTML/CSS 控制。

## 产品入口

建议入口：

- 编辑器顶部按钮：`导出电子剧本包`
- 或编辑器右侧更多菜单：`电子剧本包`

交互流程：

1. 打开电子剧本包抽屉。
2. 选择风格：`传统文本` / `水墨文学`。
3. 勾选导出内容：
   - 玩家角色本。
   - DM 手册。
   - 线索卡包。
4. 点击生成预览。
5. 检查每个角色本。
6. 导出 ZIP。

## 技术拆分

### 1. package-service

职责：

- 聚合 `scripts`、`characters`、`character_scripts`、`clues`、`organizer_manuals`、`truth_reviews`、`timeline_events`。
- 输出 `ElectronicScriptPackage`。
- 不负责样式。

验证：

- 指定一个已生成剧本，接口能返回完整玩家本、DM 手册和线索数据。

### 2. player-book-designer

职责：

- 从现有角色剧本生成角色卡、开局须知、每幕任务、可说 / 不可说、私人时间线。
- 根据风格填充 `contentDesign`。

验证：

- 每名角色至少有一份完整 `PlayerBook`。
- 每幕至少有正文或任务之一。
- 每幕可说 / 不可说为空时必须显式返回空数组，不编造规则。

### 3. package-preview

职责：

- 提供 `/editor/[scriptId]/package` 预览页面。
- 支持切换 `classic-text` 和 `ink-literary`。
- 展示角色本、DM 手册、线索卡包摘要。

验证：

- 两套风格视觉差异明显。
- 切换风格不改变结构化内容。

### 4. package-export

职责：

- 导出每名玩家角色本 PDF。
- 导出 DM 手册 PDF。
- 复用现有线索卡 PDF / PNG / ZIP 能力。
- 输出一个电子剧本包 ZIP。

验证：

- ZIP 文件包含：
  - `玩家本/角色名-玩家本.pdf`
  - `DM手册/剧本名-DM手册.pdf`
  - `线索卡/`
- PDF 打开无空白页、无文字溢出、无明显错位。

## MVP 验收标准

- 一个已有完整剧本可以生成电子剧本包。
- 每名角色都有独立玩家本。
- 玩家本包含角色卡、开局须知、每幕正文、每幕任务、可说 / 不可说。
- DM 手册包含开本流程、每幕流程、真相复盘、扶车提示。
- 线索卡包可导出。
- 支持 `classic-text` 和 `ink-literary` 两套风格。
- 导出 ZIP 文件结构清晰。
- 不影响现有编辑器保存、回滚、线索卡管理和插画功能。
- `pnpm lint` 通过。
- `pnpm build` 通过。

## 后续阶段

### 第二阶段：诗意碎片与阶段补充

- 增加 `minimal-poetic` 风格。
- 支持短页、碎片回忆、信件页、阶段补充剧本。
- 支持按幕解锁玩家补充资料。

### 第三阶段：漫画 / 日志媒介本

- 增加 `comic-journal` 风格。
- 支持漫画分镜、手写纸、聊天记录、病历、调查档案。
- 接入插画生成和分镜生成。

### 第四阶段：在线电子版

- 支持玩家分享链接。
- 支持按角色权限阅读。
- 支持 DM 控制阶段解锁。
- 支持玩家端移动阅读体验。
