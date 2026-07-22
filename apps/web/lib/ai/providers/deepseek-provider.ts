// DeepSeek V4 Pro Provider - 剧本生成与逻辑校验
// 基于 DeepSeek OpenAI 兼容接口实现，擅长创意写作与逻辑推理
// 支持 SSE 流式输出、AbortSignal 中断、Mock 模式（无 API Key 时返回模拟数据）

import type {
  AIProvider,
  GenerateOptions,
  IllustrationResult,
  StreamChunk,
  ValidationResult,
} from "./base-provider";
import type { ProviderRuntimeConfig } from "@narrlight/shared";

// 逻辑校验专用 system prompt
const VALIDATE_SYSTEM_PROMPT = `你是一名剧本杀逻辑校验专家。请分析用户提供的剧本内容，识别其中的逻辑漏洞、时间线冲突、未回收伏笔、孤立线索、动机薄弱、不可能手法、OOC 行为、叙诡等问题。

请以严格的 JSON 格式返回校验结果，结构如下：
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
}

仅返回 JSON，不要包含 markdown 代码块或其他文本。`;

// Mock 模式返回的示例剧本内容
const MOCK_CONTENT = `【Mock 模式 - 未配置 DEEPSEEK_API_KEY】
这是一段模拟生成的剧本内容，用于开发与测试。

第一幕：风雨欲来
夜幕降临，老宅内灯火通明。六位宾客应邀而来，却不知这场聚会背后的真正目的……

【人物剧本】
- 林少爷：表面纨绔，实则暗中追查父亲死因
- 苏小姐：温婉知性，与林家有未解之缘
- 管家王伯：忠诚侍奉三十年，知晓诸多秘密

【组织者手册】
本幕核心目标：通过自由交谈建立人物关系，埋下三条关键伏笔。
`;

/**
 * DeepSeek Provider 实现
 * 调用 DeepSeek OpenAI 兼容接口完成文本生成、流式输出、JSON 生成与逻辑校验
 */
export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek";
  model: string;

  private apiKey: string;
  private baseUrl = "https://api.deepseek.com/v1";
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config?: Partial<ProviderRuntimeConfig>) {
    this.apiKey = process.env.DEEPSEEK_API_KEY ?? "";
    this.model = config?.model || "deepseek-chat";
    this.timeout = config?.timeout ?? 60;
    this.retries = config?.retries ?? 2;
  }

  /** 是否处于 Mock 模式（无 API Key） */
  private get isMockMode(): boolean {
    return !this.apiKey;
  }

  /**
   * 文本生成（非流式）
   * 调用 chat/completions，返回完整文本
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
        const data = (await response.json()) as DeepSeekChatResponse;
        return data.choices?.[0]?.message?.content ?? "";
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (controller.signal.aborted && !options.signal?.aborted) {
          lastError = new Error(`DeepSeek 请求超时（${this.timeout} 秒），请在 Admin 模型配置中调高文本模型超时时间后重试`);
        }
        if (signal.aborted && options.signal?.aborted) {
          // 调用方主动中断，不重试
          throw lastError;
        }
        if (attempt < maxAttempts) {
          await delay(500 * attempt);
        }
      }
    }
    throw lastError ?? new Error("DeepSeek generate failed after retries");
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
        throw new Error("DeepSeek stream response body is empty");
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
          // 保留最后一行（可能不完整）
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
        // 流正常结束
        yield { content: "", done: true, progress: 1 };
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (controller.signal.aborted && !options.signal?.aborted) {
        throw new Error(`DeepSeek 流式生成超时（${this.timeout} 秒），请在 Admin 模型配置中调高文本模型超时时间后重试`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 结构化 JSON 生成
   * 调用 generate 后对结果做容错 JSON 解析（剥离 markdown 代码块等）
   */
  async generateJSON<T>(options: GenerateOptions): Promise<T> {
    const text = await this.generate(options);
    return parseJSONWithTolerance<T>(text);
  }

  /**
   * 逻辑校验
   * 使用专用 system prompt 调用 generateJSON<ValidationResult>
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
   * 插画生成 - DeepSeek 为纯文本模型，不支持插画生成
   */
  illustrate(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<IllustrationResult> {
    void options; // 接口要求保留参数，DeepSeek 不支持插画
    return Promise.reject(
      new Error(
        `DeepSeek 是文本模型，不支持插画生成（收到请求：${prompt.slice(0, 50)}）。请使用 GLM Provider 调用 CogView。`,
      ),
    );
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
   * 解析单行 SSE 数据，返回 StreamChunk 或 null（跳过）
   * - `data: [DONE]` → { done: true, progress: 1 }
   * - `data: {...}` → 提取 choices[0].delta.content
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
      const json = JSON.parse(data) as DeepSeekStreamChunk;
      const content = json.choices?.[0]?.delta?.content ?? "";
      const finishReason = json.choices?.[0]?.finish_reason;
      return {
        content,
        done: finishReason === "stop",
        progress: finishReason === "stop" ? 1 : undefined,
      };
    } catch {
      // 跳过格式异常的行
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
      `DeepSeek API error ${response.status}: ${detail || response.statusText}`,
    );
  }

  // ===== Mock 模式实现 =====

  private async mockGenerate(options: GenerateOptions): Promise<string> {
    // 模拟网络延迟
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
    // 按字符切片模拟流式
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
}

// ===== 类型定义 =====

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
}

interface DeepSeekStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

// ===== 工具函数 =====

/**
 * 容错 JSON 解析
 * - 剥离 markdown 代码块（```json ... ```）
 * - 剥离首尾非 JSON 文本
 */
export function parseJSONWithTolerance<T>(text: string): T {
  let cleaned = text.trim();

  // 剥离 markdown 代码块
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 尝试直接解析
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 尝试提取第一个 { 到最后一个 } 的子串
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = cleaned.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced) as T;
    }
    throw new Error(`Failed to parse JSON from AI response: ${text.slice(0, 200)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
