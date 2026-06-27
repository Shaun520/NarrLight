# API 接口契约：叙光平台

**日期**: 2026-06-17
**基础路径**: `/api`

## 通用约定

### 认证

所有需要认证的接口在 Header 中携带：
```
Authorization: Bearer <session_token>
```

### 响应格式

```typescript
// 成功响应
interface ApiResponse<T> {
  success: true;
  data: T;
}

// 错误响应
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### 分页

```typescript
interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

### 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| AUTH_REQUIRED | 401 | 未认证 |
| AUTH_INVALID | 401 | 认证无效 |
| FORBIDDEN | 403 | 无权限 |
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 422 | 参数校验失败 |
| QUOTA_EXCEEDED | 429 | 免费额度已用尽 |
| RATE_LIMITED | 429 | 请求频率超限 |
| GENERATION_FAILED | 500 | AI 生成失败 |
| CONTENT_BLOCKED | 451 | 内容违规被拦截 |

---

## 1. 认证模块

### POST /auth/send-code

发送手机验证码。

**请求**：
```typescript
interface SendCodeRequest {
  phone: string; // 11位中国大陆手机号
}
```

**响应**：
```typescript
interface SendCodeResponse {
  success: true;
  data: {
    expiresIn: number; // 验证码有效时间（秒）
  };
}
```

### POST /auth/login

手机号+验证码登录。

**请求**：
```typescript
interface LoginRequest {
  phone: string;
  code: string; // 6位验证码
}
```

**响应**：
```typescript
interface LoginResponse {
  success: true;
  data: {
    token: string;
    user: User;
  };
}
```

---

## 2. 剧本模块

### GET /scripts

获取当前用户的剧本列表（分页）。

**查询参数**：
```typescript
interface ListScriptsQuery {
  page?: number;      // 默认 1
  pageSize?: number;  // 默认 20
  status?: ScriptStatus;
  genre?: ScriptGenre;
}
```

**响应**：`PaginatedResponse<ScriptSummary>`

```typescript
interface ScriptSummary {
  id: string;
  title: string;
  genre: ScriptGenre;
  playerCount: number;
  status: ScriptStatus;
  wordCount: number;
  currentVersion: number;
  updatedAt: string;
}
```

### POST /scripts

创建新剧本（空白草稿）。

**请求**：
```typescript
interface CreateScriptRequest {
  title: string;
  genre: ScriptGenre;
  playerCount: number;
  durationHours: number;
  difficulty: ScriptDifficulty;
  background?: string;
  coreTheme?: string;
  noEdgeRole?: boolean;
}
```

**响应**：`ApiResponse<Script>`

### GET /scripts/:scriptId

获取剧本详情（含人物、幕次概要）。

**响应**：`ApiResponse<ScriptDetail>`

```typescript
interface ScriptDetail {
  script: Script;
  characters: Character[];
  acts: Act[];
  clueCount: number;
  lastValidationReport?: ValidationReport;
  difficultyAssessment?: DifficultyAssessment;
}
```

### PATCH /scripts/:scriptId

更新剧本元信息。

**请求**：`Partial<CreateScriptRequest>`

**响应**：`ApiResponse<Script>`

### DELETE /scripts/:scriptId

删除剧本（需二次确认，前端弹窗确认）。

**响应**：`ApiResponse<{ deleted: true }>`

---

## 3. AI 生成模块

### POST /scripts/:scriptId/generate

触发 AI 剧本生成（全本生成或局部调整）。

**请求**：
```typescript
interface GenerateRequest {
  type: "FULL_SCRIPT" | "CHARACTER_ADJUST" | "CLUE_MODIFY" | "TRICK_REPLACE"
      | "STYLE_CHANGE" | "COMPRESS" | "COMPLIANCE";
  // 全本生成参数
  params?: {
    genre?: ScriptGenre;
    playerCount?: number;
    durationHours?: number;
    difficulty?: ScriptDifficulty;
    background?: string;
    coreTheme?: string;
    noEdgeRole?: boolean;
    ageRating?: AgeRating;
    writingStyle?: string;
    compressRatio?: number; // COMPRESS 类型时使用，0.0-1.0
  };
  // 局部调整参数
  targetId?: string;       // 目标实体 ID（人物/线索/幕次）
  instruction?: string;    // 调整指令
}
```

**响应**：`ApiResponse<GenerationTask>`

```typescript
interface GenerationTask {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
}
```

### GET /scripts/:scriptId/generate/:taskId

查询生成任务状态（支持 SSE 流式推送进度）。

**查询参数**：
```typescript
interface GetGenerationStatusQuery {
  stream?: boolean; // 是否使用 SSE 流式推送
}
```

**SSE 事件格式**：
```typescript
interface GenerationSSEEvent {
  event: "progress" | "chunk" | "completed" | "failed";
  data: {
    progress?: number;
    chunk?: string;       // 流式文本片段
    result?: unknown;     // 完成时的完整结果
    error?: string;       // 失败时的错误信息
  };
}
```

### POST /scripts/:scriptId/generate/:taskId/cancel

取消正在进行的生成任务。

**响应**：`ApiResponse<{ cancelled: true }>`

### POST /scripts/:scriptId/generate/:taskId/resume

从中断处继续生成。

**响应**：`ApiResponse<GenerationTask>`

---

## 4. 人物模块

### GET /scripts/:scriptId/characters

获取剧本所有人物。

**响应**：`ApiResponse<Character[]>`

### PATCH /scripts/:scriptId/characters/:characterId

更新人物信息。

**请求**：`Partial<Character>`

**响应**：`ApiResponse<Character>`

### GET /scripts/:scriptId/characters/:characterId/relations

获取指定人物的所有关系。

**响应**：
```typescript
interface CharacterRelationsResponse {
  success: true;
  data: {
    character: Character;
    relations: Array<{
      relation: CharacterRelation;
      targetCharacter: Character;
    }>;
  };
}
```

### PUT /scripts/:scriptId/relations

批量更新人物关系（全量替换）。

**请求**：
```typescript
interface UpdateRelationsRequest {
  relations: Array<{
    sourceCharacterId: string;
    targetCharacterId: string;
    relationType: RelationType;
    surfaceLabel: string;
    hiddenLabel?: string;
    isHidden: boolean;
  }>;
}
```

**响应**：`ApiResponse<CharacterRelation[]>`

---

## 5. 校验模块

### POST /scripts/:scriptId/validate

触发校验任务。

**请求**：
```typescript
interface ValidateRequest {
  type: "TIMELINE" | "LOGIC" | "DIFFICULTY" | "FULL";
  incremental?: boolean;      // 是否增量校验
  targetIssueId?: string;     // 增量校验时指定修复的问题 ID
}
```

**响应**：`ApiResponse<ValidationReport>`

### GET /scripts/:scriptId/validate/:reportId

获取校验报告详情。

**响应**：`ApiResponse<ValidationReportDetail>`

```typescript
interface ValidationReportDetail {
  report: ValidationReport;
  issues: ValidationIssue[];
  difficultyAssessment?: DifficultyAssessment;
}
```

### POST /scripts/:scriptId/validate/:reportId/export

导出校验报告为 PDF。

**请求**：
```typescript
interface ExportReportRequest {
  format: "PDF";
}
```

**响应**：PDF 文件流（Content-Type: application/pdf）

### POST /scripts/:scriptId/validate/:reportId/auto-fix

根据建议自动修复指定问题。

**请求**：
```typescript
interface AutoFixRequest {
  issueId: string;
}
```

**响应**：`ApiResponse<{ fixed: true; changes: string[] }>`

---

## 6. 线索卡模块

### GET /scripts/:scriptId/clues

获取剧本所有线索（支持筛选）。

**查询参数**：
```typescript
interface ListCluesQuery {
  clueType?: ClueType;
  actId?: string;
  location?: string;
  isDecoy?: boolean;
  isKeyClue?: boolean;
}
```

**响应**：`ApiResponse<Clue[]>`

### POST /scripts/:scriptId/clues

新增自定义线索。

**请求**：`Omit<Clue, "id" | "createdAt" | "updatedAt">`

**响应**：`ApiResponse<Clue>`

### PATCH /scripts/:scriptId/clues/:clueId

更新线索信息。

**请求**：`Partial<Clue>`

**响应**：`ApiResponse<Clue>`

### DELETE /scripts/:scriptId/clues/:clueId

删除线索。

**响应**：`ApiResponse<{ deleted: true }>`

### POST /scripts/:scriptId/clues/export

批量导出线索卡。

**请求**：
```typescript
interface ExportCluesRequest {
  format: "PDF" | "IMAGE";
  clueIds?: string[];      // 不指定则导出全部
  templateId?: string;     // 版式模板 ID
  customStyle?: {
    size?: "A4" | "A5" | "POKER";  // 尺寸
    colorScheme?: string;           // 配色方案
    margin?: number;                // 边距（mm）
  };
}
```

**响应**：
- format = PDF：PDF 文件流
- format = IMAGE：ZIP 压缩包（含多张图片）

---

## 7. 时间线模块

### GET /scripts/:scriptId/timeline

获取剧本时间线数据。

**响应**：
```typescript
interface TimelineResponse {
  success: true;
  data: {
    timeline: Timeline;
    events: Array<TimelineEvent & {
      characterName: string;
      actTitle: string;
    }>;
    conflicts: Array<{
      eventIds: string[];
      description: string;
      severity: "CRITICAL" | "WARNING";
    }>;
  };
}
```

### PATCH /scripts/:scriptId/timeline/events/:eventId

手动修正时间线事件。

**请求**：`Partial<TimelineEvent>`

**响应**：`ApiResponse<TimelineEvent>`

---

## 8. 版本模块

### GET /scripts/:scriptId/versions

获取版本历史列表。

**响应**：
```typescript
interface VersionListResponse {
  success: true;
  data: Array<{
    versionNumber: number;
    operationType: string;
    changeDescription: string;
    createdAt: string;
  }>;
}
```

### POST /scripts/:scriptId/versions/:versionNumber/rollback

回退到指定版本。

**响应**：`ApiResponse<Script>`

### GET /scripts/:scriptId/versions/compare

对比两个版本的差异。

**查询参数**：
```typescript
interface CompareVersionsQuery {
  fromVersion: number;
  toVersion: number;
}
```

**响应**：
```typescript
interface CompareResponse {
  success: true;
  data: {
    additions: string[];   // 新增内容
    deletions: string[];   // 删除内容
    modifications: Array<{
      path: string;        // 变更路径（如 "characters[0].background"）
      before: string;
      after: string;
    }>;
  };
}
```

---

## 9. 用户模块

### GET /user/profile

获取当前用户信息。

**响应**：`ApiResponse<User>`

### PATCH /user/profile

更新用户信息。

**请求**：`Partial<Pick<User, "nickname" | "avatar">>`

**响应**：`ApiResponse<User>`

### GET /user/quota

获取 AI 生成额度信息。

**响应**：
```typescript
interface QuotaResponse {
  success: true;
  data: {
    freeQuota: number;
    usedQuota: number;
    totalQuota: number;
  };
}
```
