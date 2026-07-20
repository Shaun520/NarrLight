import type {
  AIProvider,
  GenerateOptions,
  IllustrationResult,
  StreamChunk,
  ValidationResult,
} from './base-provider';
import { fetchWithOptionalProxy } from './fetch-with-proxy';

interface ArkImageResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}

export class SeedreamProvider implements AIProvider {
  readonly name = 'seedream';
  readonly model = process.env.SEEDDANCE_IMAGE_MODEL
    ?? process.env.SEEDREAM_IMAGE_MODEL
    ?? '';

  private readonly apiKey = process.env.ARK_API_KEY ?? process.env.VOLCENGINE_API_KEY ?? '';
  private readonly baseUrl =
    process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3';

  async illustrate(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<IllustrationResult> {
    if (!this.apiKey) {
      throw new Error('ARK_API_KEY is not configured');
    }
    if (!this.model && !options?.model) {
      throw new Error('SEEDREAM_IMAGE_MODEL or SEEDDANCE_IMAGE_MODEL is not configured');
    }

    const model = (options?.model as string | undefined) ?? this.model;
    const response = await fetchWithOptionalProxy(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size: options?.size ?? '1024x1024',
        response_format: options?.response_format ?? 'url',
        n: options?.n ?? 1,
        guidance_scale: options?.guidance_scale,
        watermark: options?.watermark ?? false,
      }),
      signal: options?.signal as AbortSignal | undefined,
    }, process.env.ARK_PROXY_URL);

    if (!response.ok) {
      throw new Error(await buildProviderError('Ark Seedream', response));
    }

    const data = (await response.json()) as ArkImageResponse;
    const image = data.data?.[0];
    const imageUrl = image?.url
      ?? (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : '');

    if (!imageUrl) {
      throw new Error('Ark Seedream returned empty image data');
    }

    return {
      imageUrl,
      model,
      seed: randomSeed(),
    };
  }

  generate(_options: GenerateOptions): Promise<string> {
    void _options;
    return Promise.reject(new Error('SeedreamProvider only supports image generation'));
  }

  async *generateStream(_options: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    void _options;
    throw new Error('SeedreamProvider only supports image generation');
  }

  generateJSON<T>(_options: GenerateOptions): Promise<T> {
    void _options;
    return Promise.reject(new Error('SeedreamProvider only supports image generation'));
  }

  validate(_options: GenerateOptions): Promise<ValidationResult> {
    void _options;
    return Promise.reject(new Error('SeedreamProvider only supports image generation'));
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
  return `${provider} API error ${response.status}: ${detail || response.statusText}`;
}
