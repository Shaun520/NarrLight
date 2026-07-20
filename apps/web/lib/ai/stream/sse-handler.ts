// SSE 流式输出处理 - Server 端与 Client 端
// Server 端：createSSEResponse 创建 Edge Function/Route Handler 用的 SSE 响应流
// Client 端：createSSEClient 基于 fetch + ReadableStream 解析 SSE（支持 POST 与自定义 headers）
// 中断续传：基于 localStorage 保存/恢复/清除生成进度

// ============================================================
// Server 端
// ============================================================

/**
 * SSE 事件源（供 createSSEResponse 消费）
 * - event: 可选事件名（如 progress / chunk / completed / failed）
 * - data: 事件数据字符串（通常是 JSON 序列化后的字符串）
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * 格式化单条 SSE 数据
 * - 无 event：`data: {...}\n\n`
 * - 有 event：`event: xxx\ndata: {...}\n\n`
 */
export function formatSSEData(data: string, event?: string): string {
  if (event) {
    return `event: ${event}\ndata: ${data}\n\n`;
  }
  return `data: ${data}\n\n`;
}

/**
 * 创建 SSE Response
 * 将 AsyncGenerator 产出的 SSE 事件泵入 ReadableStream，返回标准 Response
 * 适用于 Next.js Edge Function / Route Handler
 */
export function createSSEResponse(
  generator: AsyncGenerator<SSEEvent, void, unknown>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of generator) {
          const payload = formatSSEData(event.data, event.event);
          controller.enqueue(encoder.encode(payload));
        }
      } catch (error) {
        // 发送失败事件后关闭流
        const failureMessage =
          error instanceof Error ? error.message : "Unknown error";
        const failPayload = formatSSEData(
          JSON.stringify({ error: failureMessage }),
          "failed",
        );
        controller.enqueue(encoder.encode(failPayload));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 禁用 Nagle 算法，降低流式延迟（如运行环境支持）
      "X-Accel-Buffering": "no",
    },
  });
}

// ============================================================
// Client 端
// ============================================================

/**
 * SSE 客户端配置
 */
export interface SSEClientOptions {
  url: string;
  onMessage: (data: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  signal?: AbortSignal;
  // 可选：自定义请求方法与请求体（默认 GET）
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * 创建 SSE 客户端
 * 使用 fetch + ReadableStream reader 解析 SSE 流
 * （不使用 EventSource，因其不支持 POST 与自定义 headers）
 *
 * @returns { close } 调用 close 主动中断连接
 */
export function createSSEClient(
  options: SSEClientOptions,
): { close: () => void } {
  const controller = new AbortController();
  const externalSignal = options.signal;

  // 联动外部 AbortSignal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...options.headers,
  };
  if (options.method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  (async () => {
    try {
      const response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `SSE request failed: ${response.status} ${response.statusText}`,
        );
      }

      if (!response.body) {
        throw new Error("SSE response body is empty");
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
          // SSE 事件以两个换行分隔
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const rawEvent of events) {
            const parsed = parseSSEEvent(rawEvent);
            if (parsed) {
              options.onMessage(parsed.data);
            }
          }
        }
        // 流正常结束
        options.onClose?.();
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // 主动中断，视为正常关闭
        options.onClose?.();
        return;
      }
      options.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  })();

  return {
    close: () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },
  };
}

/**
 * 解析单个 SSE 事件块（由 \n\n 分隔的文本）
 * 提取 data 字段（多行 data: 拼接）
 * @returns 解析后的事件，或 null（空事件）
 */
function parseSSEEvent(
  raw: string,
): { event?: string; data: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of trimmed.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    // 忽略 id: / retry: / 注释行（:）
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

// ============================================================
// 中断续传 - 基于 localStorage
// ============================================================

/** 生成状态存储结构 */
export interface GenerationState {
  content: string;
  progress: number;
}

/** localStorage key 前缀，避免与其他模块冲突 */
const STORAGE_KEY_PREFIX = "narrlight:generation:";

function buildStorageKey(taskId: string): string {
  return `${STORAGE_KEY_PREFIX}${taskId}`;
}

/**
 * 保存生成进度到 localStorage
 * 用于中断续传：流式生成过程中定期调用，记录已生成内容与进度
 */
export function saveGenerationState(
  taskId: string,
  state: GenerationState,
): void {
  if (typeof window === "undefined") {
    return; // SSR 环境下跳过
  }
  try {
    window.localStorage.setItem(
      buildStorageKey(taskId),
      JSON.stringify(state),
    );
  } catch (error) {
    // 容量超限或隐私模式：静默失败，不阻断主流程
    console.warn("saveGenerationState failed:", error);
  }
}

/**
 * 从 localStorage 加载生成进度
 * @returns 已保存的状态，或 null（无记录或解析失败）
 */
export function loadGenerationState(taskId: string): GenerationState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(buildStorageKey(taskId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as GenerationState;
    if (
      typeof parsed.content === "string" &&
      typeof parsed.progress === "number"
    ) {
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn("loadGenerationState failed:", error);
    return null;
  }
}

/**
 * 清除指定任务的生成进度
 * 生成完成或用户放弃后调用
 */
export function clearGenerationState(taskId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(buildStorageKey(taskId));
  } catch (error) {
    console.warn("clearGenerationState failed:", error);
  }
}
