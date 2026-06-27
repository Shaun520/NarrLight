# 数据模型：叙光平台

**日期**: 2026-06-17
**状态**: 已完成

## 实体关系概览

```text
User ──1:N──> Script ──1:N──> Character
                     ├──1:N──> Act
                     ├──1:N──> Clue
                     ├──1:1──> Timeline
                     ├──1:1──> ValidationReport
                     ├──1:1──> DifficultyAssessment
                     └──1:N──> VersionSnapshot

Character ──N:N──> CharacterRelation
Act ──1:N──> Scene
Timeline ──1:N──> TimelineEvent
```

---

## 实体定义

### User（用户）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| phone | String | ✅ | 手机号，唯一 |
| nickname | String | ✅ | 昵称 |
| avatar | String | ❌ | 头像 URL |
| freeQuota | Int | ✅ | 剩余免费 AI 生成额度，默认 10 |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 更新时间 |

**验证规则**：
- phone：11 位数字，符合中国大陆手机号格式
- nickname：2-20 个字符

---

### Script（剧本）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| userId | UUID | ✅ | 外键 → User.id |
| title | String | ✅ | 剧本标题 |
| genre | Enum | ✅ | 题材：HARDCORE / EMOTIONAL / HORROR / COMEDY / MECHANISM |
| playerCount | Int | ✅ | 玩家人数，4-12 |
| durationHours | Float | ✅ | 预计时长（小时），2-8 |
| difficulty | Enum | ✅ | 难度：BEGINNER / INTERMEDIATE / ADVANCED / EXPERT |
| background | String | ❌ | 背景设定（如"古风"、"现代都市"） |
| coreTheme | String | ❌ | 核心立意（如"家国亲情"） |
| noEdgeRole | Boolean | ❌ | 是否无边缘位，默认 false |
| ageRating | Enum | ❌ | 适龄分级：ALL / TWELVE_PLUS / SIXTEEN_PLUS / EIGHTEEN_PLUS，默认 ALL |
| writingStyle | String | ❌ | 写作风格 |
| status | Enum | ✅ | 状态：DRAFT / GENERATING / GENERATED / VALIDATING / COMPLETED |
| wordCount | Int | ❌ | 总字数 |
| currentVersion | Int | ✅ | 当前版本号，默认 1 |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 更新时间 |

**验证规则**：
- playerCount：4 ≤ value ≤ 12
- durationHours：2 ≤ value ≤ 8
- 当 genre = MECHANISM 时，需额外生成机制规则内容

**状态转换**：
```text
DRAFT → GENERATING → GENERATED → VALIDATING → COMPLETED
  ↑         ↓            ↓            ↓
  └── (中断续传) ────────┘            └──→ DRAFT (修改后)
```

---

### Character（人物）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| name | String | ✅ | 人物姓名 |
| gender | Enum | ✅ | 性别：MALE / FEMALE / OTHER |
| age | Int | ❌ | 年龄 |
| identity | String | ✅ | 身份/职业 |
| background | Text | ❌ | 背景故事 |
| personality | String | ❌ | 性格特征 |
| motivation | Text | ❌ | 核心动机 |
| isKiller | Boolean | ❌ | 是否为凶手（仅内部标记，不暴露给玩家） |
| scriptContent | Text | ❌ | 人物剧本全文（含分幕剧情、个人任务） |
| sortOrder | Int | ✅ | 排序序号 |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 更新时间 |

**验证规则**：
- 每部剧本至少 4 个人物
- 每部剧本恰好 1 个人物 isKiller = true（硬核本/情感本）

---

### CharacterRelation（人物关系）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| sourceCharacterId | UUID | ✅ | 外键 → Character.id |
| targetCharacterId | UUID | ✅ | 外键 → Character.id |
| relationType | Enum | ✅ | 关系类型：FAMILY / FRIEND / LOVER / ENEMY / COLLEAGUE / OTHER |
| surfaceLabel | String | ✅ | 明线关系标签（如"同窗好友"） |
| hiddenLabel | String | ❌ | 暗线关系标签（如"暗中仇杀"） |
| isHidden | Boolean | ✅ | 是否为暗线关系，默认 false |

**验证规则**：
- sourceCharacterId ≠ targetCharacterId
- 同一对人物不可重复定义相同关系类型

---

### Act（幕）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| actNumber | Int | ✅ | 幕次序号，从 1 开始 |
| title | String | ✅ | 幕标题 |
| summary | Text | ❌ | 幕概要 |
| dmGuide | Text | ❌ | DM 扶车提示 |
| durationMinutes | Int | ❌ | 预计时长（分钟） |
| sortOrder | Int | ✅ | 排序序号 |

**验证规则**：
- actNumber 在同一剧本内唯一且连续

---

### Scene（场景）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| actId | UUID | ✅ | 外键 → Act.id |
| sceneNumber | Int | ✅ | 场景序号 |
| location | String | ✅ | 场景地点 |
| description | Text | ❌ | 场景描述 |
| timestamp | String | ❌ | 时间戳（绝对时间，如"2024-01-01 20:00"） |
| relativeTime | String | ❌ | 相对时间（如"案发后 2 小时"） |
| sortOrder | Int | ✅ | 排序序号 |

---

### Clue（线索）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| name | String | ✅ | 线索名称 |
| description | Text | ✅ | 线索描述 |
| clueType | Enum | ✅ | 类型：EVIDENCE / TESTIMONY / DEEP / HIDDEN |
| actId | UUID | ❌ | 外键 → Act.id，所属章节 |
| location | String | ❌ | 搜证地点 |
| relatedCharacterIds | UUID[] | ❌ | 关联人物 ID 列表 |
| isDecoy | Boolean | ✅ | 是否为干扰项，默认 false |
| isKeyClue | Boolean | ✅ | 是否为关键线索，默认 false |
| truthExplanation | Text | ❌ | 真相复盘中对该线索的解释 |
| triggerCondition | String | ❌ | 解锁条件（深入线索/隐藏线索） |
| parentClueId | UUID | ❌ | 外键 → Clue.id，前置线索（深入线索层级关系） |
| sortOrder | Int | ✅ | 排序序号 |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 更新时间 |

**验证规则**：
- clueType = DEEP 或 HIDDEN 时，triggerCondition 必填
- clueType = DEEP 时，parentClueId 必填
- isDecoy 和 isKeyClue 不可同时为 true
- description 不可为空字符串

---

### Timeline（时间线）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id，唯一 |
| mode | Enum | ✅ | 模式：ABSOLUTE（绝对时间）/ SCENE_ORDER（场景顺序） |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 更新时间 |

---

### TimelineEvent（时间线事件）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| timelineId | UUID | ✅ | 外键 → Timeline.id |
| characterId | UUID | ✅ | 外键 → Character.id |
| sceneId | UUID | ❌ | 外键 → Scene.id |
| eventDescription | Text | ✅ | 事件描述 |
| absoluteTime | DateTime | ❌ | 绝对时间（mode = ABSOLUTE 时必填） |
| relativeOrder | Int | ❌ | 相对顺序（mode = SCENE_ORDER 时必填） |
| actId | UUID | ❌ | 外键 → Act.id |
| hasConflict | Boolean | ✅ | 是否存在时间冲突，默认 false |
| conflictDescription | Text | ❌ | 冲突描述 |

---

### ValidationReport（校验报告）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| type | Enum | ✅ | 校验类型：TIMELINE / LOGIC / DIFFICULTY / FULL |
| status | Enum | ✅ | 状态：RUNNING / COMPLETED / FAILED / INTERRUPTED |
| issues | Json | ❌ | 校验问题列表（结构化 JSON） |
| progress | Float | ❌ | 校验进度 0-1 |
| startedAt | DateTime | ❌ | 开始时间 |
| completedAt | DateTime | ❌ | 完成时间 |

**issues JSON 结构**：
```typescript
interface ValidationIssue {
  id: string;
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  category: "TIMELINE_CONFLICT" | "UNRECOVERED_FORESHADOW" | "ORPHAN_CLUE"
    | "MISSING_EVIDENCE_CHAIN" | "WEAK_MOTIVATION" | "IMPOSSIBLE_METHOD"
    | "OOC_BEHAVIOR" | "NARRATIVE_TRICK";
  location: {
    actId?: string;
    sceneId?: string;
    characterId?: string;
    clueId?: string;
  };
  description: string;
  suggestion: string;
  isFixed: boolean;
}
```

---

### DifficultyAssessment（难度评估）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| overallLevel | Enum | ✅ | 综合难度：BEGINNER / INTERMEDIATE / ADVANCED / EXPERT |
| overallScore | Float | ✅ | 综合评分 0-100 |
| clueCount | Int | ✅ | 线索总数 |
| decoyRatio | Float | ✅ | 干扰项占比 0-1 |
| trickComplexity | Float | ✅ | 诡计复杂度评分 0-100 |
| immersionThreshold | Float | ❌ | 沉浸门槛评分 0-100（情感本侧重） |
| reasoningWeight | Float | ❌ | 推理权重（硬核本侧重） |
| assessedAt | DateTime | ✅ | 评估时间 |

---

### VersionSnapshot（版本快照）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| versionNumber | Int | ✅ | 版本号 |
| snapshotData | Json | ✅ | 剧本完整快照（含所有关联实体） |
| changeDescription | String | ❌ | 变更描述 |
| operationType | Enum | ✅ | 操作类型：GENERATE / EDIT_CHARACTER / EDIT_CLUE / REPLACE_TRICK / STYLE_CHANGE / COMPRESS / COMPLIANCE_ADJUST |
| createdAt | DateTime | ✅ | 创建时间 |

**验证规则**：
- versionNumber 在同一剧本内递增且唯一

---

### GenerationTask（生成任务）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | ✅ | 主键 |
| scriptId | UUID | ✅ | 外键 → Script.id |
| userId | UUID | ✅ | 外键 → User.id |
| type | Enum | ✅ | 任务类型：FULL_SCRIPT / CHARACTER_ADJUST / CLUE_MODIFY / TRICK_REPLACE / STYLE_CHANGE / COMPRESS / COMPLIANCE / ILLUSTRATION |
| status | Enum | ✅ | 状态：PENDING / RUNNING / COMPLETED / FAILED / CANCELLED |
| provider | String | ✅ | 使用的 AI Provider（如 "deepseek-v4-pro"） |
| inputParams | Json | ✅ | 输入参数 |
| outputData | Json | ❌ | 输出结果 |
| errorMessage | Text | ❌ | 错误信息 |
| progress | Float | ❌ | 进度 0-1 |
| tokenUsage | Json | ❌ | Token 用量统计 |
| startedAt | DateTime | ❌ | 开始时间 |
| completedAt | DateTime | ❌ | 完成时间 |
| createdAt | DateTime | ✅ | 创建时间 |

**状态转换**：
```text
PENDING → RUNNING → COMPLETED
  ↓         ↓
CANCELLED  FAILED
```

---

## Prisma Schema 关键关系

```prisma
model User {
  scripts         Script[]
  generationTasks GenerationTask[]
}

model Script {
  user                User                 @relation(fields: [userId], references: [id])
  characters          Character[]
  acts                Act[]
  clues               Clue[]
  characterRelations  CharacterRelation[]
  timeline            Timeline?
  validationReports   ValidationReport[]
  difficultyAssessments DifficultyAssessment[]
  versionSnapshots    VersionSnapshot[]
  generationTasks     GenerationTask[]
}

model Character {
  script            Script              @relation(fields: [scriptId], references: [id])
  sourceRelations   CharacterRelation[] @relation("SourceCharacter")
  targetRelations   CharacterRelation[] @relation("TargetCharacter")
  timelineEvents    TimelineEvent[]
}

model CharacterRelation {
  script            Script    @relation(fields: [scriptId], references: [id])
  sourceCharacter   Character @relation("SourceCharacter", fields: [sourceCharacterId], references: [id])
  targetCharacter   Character @relation("TargetCharacter", fields: [targetCharacterId], references: [id])
}

model Act {
  script  Script   @relation(fields: [scriptId], references: [id])
  scenes  Scene[]
  clues   Clue[]
}

model Clue {
  script       Script  @relation(fields: [scriptId], references: [id])
  act          Act?    @relation(fields: [actId], references: [id])
  parentClue   Clue?   @relation("ClueHierarchy", fields: [parentClueId], references: [id])
  childClues   Clue[]  @relation("ClueHierarchy")
}
```
