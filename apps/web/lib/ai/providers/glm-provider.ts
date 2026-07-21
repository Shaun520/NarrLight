// GLM 5.1 Provider - 格式化输出与插画生成
// 基于智谱 AI 开放平台接口实现，擅长指令遵循与结构化 JSON 输出
// 通过 CogView 文生图接口支持插画生成，支持 SSE 流式、AbortSignal、Mock 模式

import type {
  AIProvider,
  GenerateOptions,
  IllustrationResult,
  StreamChunk,
  ValidationResult,
} from "./base-provider";
import type { ProviderRuntimeConfig } from "@narrlight/shared";
import { parseJSONWithTolerance } from "./deepseek-provider";

// 逻辑校验专用 system prompt（GLM 版本，强调严格 JSON 格式）
const VALIDATE_SYSTEM_PROMPT = `你是剧本杀逻辑校验专家。请分析剧本内容并识别逻辑漏洞、时间线冲突、未回收伏笔、孤立线索等问题。

严格按以下 JSON 结构返回（不要输出任何其他内容，不要使用 markdown 代码块）：
{
  "issues": [
    {
      "id": "issue-1",
      "severity": "CRITICAL | WARNING | SUGGESTION",
      "category": "TIMELINE_CONFLICT | UNRECOVERED_FORESHADOW | ORPHAN_CLUE | MISSING_EVIDENCE_CHAIN | WEAK_MOTIVATION | IMPOSSIBLE_METHOD | OOC_BEHAVIOR | NARRATIVE_TRICK",
      "location": { "actId": "", "sceneId": "", "characterId": "", "clueId": "" },
      "description": "问题描述",
      "suggestion": "修复建议",
      "isFixed": false
    }
  ],
  "summary": "校验结果摘要"
}`;

// Mock 模式返回的示例内容
const MOCK_CONTENT = `【Mock 模式 - 未配置 GLM_API_KEY】
GLM 模拟生成内容（结构化输出）：
{
  "title": "示例剧本",
  "characters": []
}`;

// CogView 默认模型
const COGVIEW_MODEL = "cogview-3-plus";

/**
 * GLM Provider 实现
 * 调用智谱 AI 接口完成文本生成、流式输出、JSON 生成、校验与插画生成
 */
export class GLMProvider implements AIProvider {
  readonly name = "glm";
  model: string;

  private apiKey: string;
  private baseUrl = "https://open.bigmodel.cn/api/paas/v4";
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config?: Partial<ProviderRuntimeConfig>) {
    this.apiKey = process.env.GLM_API_KEY ?? "";
    this.model = config?.model || "glm-5.1";
    this.timeout = config?.timeout ?? 60;
    this.retries = config?.retries ?? 2;
  }

  /** 是否处于 Mock 模式（无 API Key） */
  private get isMockMode(): boolean {
    return !this.apiKey;
  }

  /**
   * 文本生成（非流式）
   * 调用 GLM chat/completions 接口，返回完整文本
   * 带超时与重试（由 ai-config-service 的 retries 控制）
   */
  async generate(options: GenerateOptions): Promise<string> {
    if (this.isMockMode) {
      return this.mockGenerate(options);
    }

    const messages = this.buildMessages(options);
    let lastError: Error | null = null;
    const maxAttempts = Math.max(1, this.retries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);
      const signal = options.signal ?? controller.signal;
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens,
            stream: false,
          }),
          signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw await this.wrapError(response);
        }
        const data = (await response.json()) as GLMChatResponse;
        return data.choices?.[0]?.message?.content ?? "";
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (signal.aborted && options.signal?.aborted) {
          throw lastError;
        }
        if (attempt < maxAttempts) {
          await delay(500 * attempt);
        }
      }
    }
    throw lastError ?? new Error("GLM generate failed after retries");
  }

  /**
   * 流式文本生成
   * 调用 chat/completions with stream=true，逐片段 yield StreamChunk
   * 带超时控制（流式不重试，避免重复输出）
   */
  async *generateStream(
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    if (this.isMockMode) {
      yield* this.mockGenerateStream(options);
      return;
    }

    const messages = this.buildMessages(options);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);
    const signal = options.signal ?? controller.signal;
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        throw await this.wrapError(response);
      }

      if (!response.body) {
        throw new Error("GLM stream response body is empty");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const chunk = this.parseSSELine(line);
            if (chunk) {
              if (chunk.content) {
                options.onChunk?.(chunk.content);
                yield chunk;
              }
              if (chunk.done) {
                return;
              }
            }
          }
        }
        yield { content: "", done: true, progress: 1 };
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 结构化 JSON 生成
   * GLM 擅长指令遵循，调用 generate 后做容错 JSON 解析
   */
  async generateJSON<T>(options: GenerateOptions): Promise<T> {
    const text = await this.generate(options);
    return parseJSONWithTolerance<T>(text);
  }

  /**
   * 逻辑校验
   * 转发到 generateJSON<ValidationResult>，使用专用 system prompt
   */
  async validate(options: GenerateOptions): Promise<ValidationResult> {
    const merged: GenerateOptions = {
      ...options,
      systemPrompt: options.systemPrompt ?? VALIDATE_SYSTEM_PROMPT,
      temperature: options.temperature ?? 0.3,
    };
    return this.generateJSON<ValidationResult>(merged);
  }

  /**
   * 插画生成
   * 调用 CogView 文生图接口，返回图片 URL
   */
  async illustrate(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<IllustrationResult> {
    if (this.isMockMode) {
      return this.mockIllustrate(prompt);
    }

    const model = (options?.model as string) ?? COGVIEW_MODEL;
    const body: Record<string, unknown> = {
      model,
      prompt,
      ...options,
    };

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: options?.signal as AbortSignal | undefined,
    });

    if (!response.ok) {
      throw await this.wrapError(response);
    }

    const data = (await response.json()) as GLMImageResponse;
    const imageUrl = data.data?.[0]?.url ?? "";
    if (!imageUrl) {
      throw new Error("GLM CogView returned empty image url");
    }

    return {
      imageUrl,
      seed: (data.data?.[0]?.seed as number) ?? randomSeed(),
      model,
    };
  }

  // ===== 内部工具方法 =====

  private buildMessages(
    options: GenerateOptions,
  ): Array<{ role: "system" | "user"; content: string }> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: options.prompt });
    return messages;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * 解析单行 SSE 数据
   * GLM SSE 格式与 OpenAI 兼容：`data: {...}` / `data: [DONE]`
   */
  private parseSSELine(line: string): StreamChunk | null {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
      return null;
    }
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") {
      return { content: "", done: true, progress: 1 };
    }
    try {
      const json = JSON.parse(data) as GLMStreamChunk;
      const content = json.choices?.[0]?.delta?.content ?? "";
      const finishReason = json.choices?.[0]?.finish_reason;
      return {
        content,
        done: finishReason === "stop",
        progress: finishReason === "stop" ? 1 : undefined,
      };
    } catch {
      return null;
    }
  }

  private async wrapError(response: Response): Promise<Error> {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? JSON.stringify(body);
    } catch {
      detail = await response.text().catch(() => "");
    }
    return new Error(
      `GLM API error ${response.status}: ${detail || response.statusText}`,
    );
  }

  // ===== Mock 模式实现 =====

  private async mockGenerate(options: GenerateOptions): Promise<string> {
    await delay(200);
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return `${MOCK_CONTENT}\n【Prompt 摘要】${options.prompt.slice(0, 80)}...`;
  }

  private async *mockGenerateStream(
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const fullText = `${MOCK_CONTENT}\n【Prompt 摘要】${options.prompt.slice(0, 80)}...`;
    const chunkSize = 8;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const content = fullText.slice(i, i + chunkSize);
      options.onChunk?.(content);
      yield { content, done: false };
      await delay(20);
    }
    yield { content: "", done: true, progress: 1 };
  }

  private async mockIllustrate(prompt: string): Promise<IllustrationResult> {
    await delay(300);
    // 将 prompt 摘要嵌入 SVG，便于开发时辨识
    const preview = escapeXml(prompt.slice(0, 30));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">' +
      '<rect width="100%" height="100%" fill="#e6f4ff"/>' +
      '<text x="50%" y="46%" font-size="20" text-anchor="middle" fill="#1677ff">Mock Illustration</text>' +
      `<text x="50%" y="56%" font-size="14" text-anchor="middle" fill="#595959">${preview}</text>` +
      "</svg>";
    return {
      imageUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
      seed: randomSeed(),
      model: COGVIEW_MODEL,
    };
  }
}

// ===== 类型定义 =====

interface GLMChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
}

interface GLMStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

interface GLMImageResponse {
  data?: Array<{ url?: string; seed?: number }>;
}

// ===== 工具函数 =====

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** 转义 XML 特殊字符，避免注入 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
