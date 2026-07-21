import type {
  AIProvider,
  GenerateOptions,
  IllustrationResult,
  StreamChunk,
  ValidationResult,
} from './base-provider';
import type { ProviderRuntimeConfig } from '@narrlight/shared';
import { fetchWithOptionalProxy } from './fetch-with-proxy';

interface OpenAIImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}

export class OpenAIImageProvider implements AIProvider {
  readonly name = 'openai-image';
  model: string;
  private readonly defaultSize: string;
  private readonly timeout: number;
  private readonly retries: number;

  private readonly apiKey = process.env.OPENAI_API_KEY ?? '';
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

  constructor(config?: Partial<ProviderRuntimeConfig>) {
    this.model = config?.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';
    this.defaultSize = config?.size || '1024x1024';
    this.timeout = config?.timeout ?? 60;
    this.retries = config?.retries ?? 3;
  }

  async illustrate(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<IllustrationResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = (options?.model as string | undefined) ?? this.model;
    const outputFormat = (options?.output_format as string | undefined) ?? 'png';
    const response = await requestWithRetry(
      `${this.baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          size: options?.size ?? this.defaultSize,
          quality: options?.quality ?? 'medium',
          output_format: outputFormat,
        }),
        signal: (options?.signal ?? undefined) as AbortSignal | undefined,
      },
      process.env.OPENAI_PROXY_URL,
      this.retries,
      this.timeout,
    );

    if (!response.ok) {
      throw new Error(await buildProviderError('OpenAI Images', response));
    }

    const data = (await response.json()) as OpenAIImageResponse;
    const image = data.data?.[0];
    const imageUrl = image?.b64_json
      ? `data:image/${outputFormat};base64,${image.b64_json}`
      : image?.url;

    if (!imageUrl) {
      throw new Error('OpenAI Images returned empty image data');
    }

    return {
      imageUrl,
      model,
      seed: randomSeed(),
    };
  }

  generate(_options: GenerateOptions): Promise<string> {
    void _options;
    return Promise.reject(new Error('OpenAIImageProvider only supports image generation'));
  }

  async *generateStream(_options: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    void _options;
    throw new Error('OpenAIImageProvider only supports image generation');
  }

  generateJSON<T>(_options: GenerateOptions): Promise<T> {
    void _options;
    return Promise.reject(new Error('OpenAIImageProvider only supports image generation'));
  }

  validate(_options: GenerateOptions): Promise<ValidationResult> {
    void _options;
    return Promise.reject(new Error('OpenAIImageProvider only supports image generation'));
  }
}

async function buildProviderError(provider: string, response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? JSON.stringify(body);
  } catch {
    detail = await response.text().catch(() => '');
  }
  const requestId =
    response.headers.get('x-request-id') ||
    response.headers.get('openai-request-id') ||
    response.headers.get('x-amzn-requestid') ||
    '';
  return `${provider} API error ${response.status}: ${detail || response.statusText}${requestId ? ` (request-id: ${requestId})` : ''}`;
}

async function requestWithRetry(
  input: string | URL,
  init: RequestInit = {},
  explicitProxyUrl?: string,
  retries = 3,
  timeoutSec = 60,
): Promise<Response> {
  const maxAttempts = Math.max(1, retries + 1);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);
    const externalSignal = (init.signal ?? undefined) as AbortSignal | undefined;
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetchWithOptionalProxy(input, { ...init, signal: controller.signal }, explicitProxyUrl);
      if (response.ok || !shouldRetry(response.status) || attempt === maxAttempts) {
        return response;
      }
      lastError = new Error(`OpenAI Images temporary failure ${response.status}`);
      await delay(200 * 2 ** (attempt - 1), externalSignal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (externalSignal?.aborted) {
        throw lastError;
      }
      if (attempt === maxAttempts) {
        throw lastError;
      }
      await delay(200 * 2 ** (attempt - 1), externalSignal);
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError ?? new Error('OpenAI Images request failed');
}

function shouldRetry(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
