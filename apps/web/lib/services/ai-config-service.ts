// AI 配置服务：从 system_configs 表读取运行时配置
// 仅在 server 端使用，通过 service role client 绕过 RLS
// 敏感凭据（API Key）继续从环境变量读取，本服务只负责路由选择 / 开关 / 重试次数

import { cache } from "react";
import type {
  ContentSafetyConfig,
  ImageProviderConfig,
  ImageProviderName,
  ProviderRuntimeConfig,
  QuotaDefaultsConfig,
  TextProviderConfig,
  TextProviderName,
} from "@narrlight/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { getProvider } from "@/lib/ai/providers/base-provider";
import type { AIProvider } from "@/lib/ai/providers/base-provider";

/** 文本 provider 环境变量 key 映射 */
const TEXT_PROVIDER_ENV_KEY: Record<TextProviderName, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  glm: "GLM_API_KEY",
};

/** 图像 provider 环境变量 key 映射 */
const IMAGE_PROVIDER_ENV_KEY: Record<ImageProviderName, string> = {
  "openai-image": "OPENAI_API_KEY",
  seedream: "ARK_API_KEY",
  glm: "GLM_API_KEY",
};

const DEFAULT_TEXT_CONFIG: TextProviderConfig = {
  primary: "deepseek",
  fallback: "glm",
  providers: {
    deepseek: { enabled: true, model: "deepseek-chat", timeout: 60, retries: 2 },
    glm: { enabled: true, model: "glm-5.1", timeout: 60, retries: 2 },
  },
};

const DEFAULT_IMAGE_CONFIG: ImageProviderConfig = {
  primary: "openai-image",
  fallback: "seedream",
  providers: {
    "openai-image": { enabled: true, model: "gpt-image-1.5", size: "1024x1024", timeout: 60, retries: 3 },
    seedream: { enabled: true, model: "", size: "1024x1024", timeout: 60, retries: 3 },
    glm: { enabled: true, model: "cogview-3-plus", size: "1024x1024", timeout: 60, retries: 3 },
  },
};

const DEFAULT_CONTENT_SAFETY: ContentSafetyConfig = {
  enabled: true,
  manual_review: false,
};

const DEFAULT_QUOTA_DEFAULTS: QuotaDefaultsConfig = {
  free_quota_limit: 10,
  pro_monthly_quota: 500,
  max_script_words: 150000,
};

interface SystemConfigRow {
  key: string;
  value: Json;
}

/** 从 system_configs 表批量读取配置 */
async function fetchConfigs(keys: readonly string[]): Promise<Record<string, Json>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("system_configs")
      .select("key, value")
      .in("key", keys);
    if (error) {
      console.warn("[ai-config-service] 读取 system_configs 失败，使用默认配置", error.message);
      return {};
    }
    const result: Record<string, Json> = {};
    for (const row of (data ?? []) as SystemConfigRow[]) {
      result[row.key] = row.value;
    }
    return result;
  } catch (error) {
    console.warn(
      "[ai-config-service] 连接 Supabase 失败，使用默认配置",
      error instanceof Error ? error.message : String(error),
    );
    return {};
  }
}

/** 安全读取 JSON 为指定类型，失败时返回默认值 */
function safeParse<T>(value: Json | undefined, fallback: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return { ...fallback, ...(value as Record<string, unknown>) } as T;
}

/** 判断 provider 对应的 API Key 是否已配置（环境变量） */
export function isProviderKeyConfigured(name: TextProviderName | ImageProviderName): boolean {
  const envKey =
    name in TEXT_PROVIDER_ENV_KEY
      ? TEXT_PROVIDER_ENV_KEY[name as TextProviderName]
      : IMAGE_PROVIDER_ENV_KEY[name as ImageProviderName];
  const value = process.env[envKey]?.trim();
  return Boolean(value) && !value!.includes("你的") && !value!.includes("your-");
}

/** 获取文本 provider 配置（带单次请求缓存） */
export const getTextProviderConfig = cache(async (): Promise<TextProviderConfig> => {
  const raw = await fetchConfigs(["text_provider"]);
  const config = safeParse<TextProviderConfig>(raw["text_provider"], DEFAULT_TEXT_CONFIG);
  return normalizeTextConfig(config);
});

/** 获取图像 provider 配置（带单次请求缓存） */
export const getImageProviderConfig = cache(async (): Promise<ImageProviderConfig> => {
  const raw = await fetchConfigs(["image_provider"]);
  const config = safeParse<ImageProviderConfig>(raw["image_provider"], DEFAULT_IMAGE_CONFIG);
  return normalizeImageConfig(config);
});

/** 获取内容安全配置 */
export const getContentSafetyConfig = cache(async (): Promise<ContentSafetyConfig> => {
  const raw = await fetchConfigs(["content_safety"]);
  return safeParse<ContentSafetyConfig>(raw["content_safety"], DEFAULT_CONTENT_SAFETY);
});

/** 获取配额默认值 */
export const getQuotaDefaults = cache(async (): Promise<QuotaDefaultsConfig> => {
  const raw = await fetchConfigs(["quota_defaults"]);
  return safeParse<QuotaDefaultsConfig>(raw["quota_defaults"], DEFAULT_QUOTA_DEFAULTS);
});

/** 移除对象中值为 undefined 的字段，避免覆盖默认值 */
function pickDefined<T>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) result[key] = value;
  }
  return result as Partial<T>;
}

/** 规范化文本 provider 配置，确保所有字段就位 */
function normalizeTextConfig(config: TextProviderConfig): TextProviderConfig {
  const providers: Record<TextProviderName, ProviderRuntimeConfig> = {
    deepseek: { ...DEFAULT_TEXT_CONFIG.providers.deepseek, ...pickDefined(config.providers?.deepseek) },
    glm: { ...DEFAULT_TEXT_CONFIG.providers.glm, ...pickDefined(config.providers?.glm) },
  };
  return {
    primary: config.primary ?? DEFAULT_TEXT_CONFIG.primary,
    // 注意：fallback 可能是 null（表示不启用备用），只有 undefined 时才用默认值
    fallback: config.fallback === undefined ? DEFAULT_TEXT_CONFIG.fallback : config.fallback,
    providers,
  };
}

/** 规范化图像 provider 配置 */
function normalizeImageConfig(config: ImageProviderConfig): ImageProviderConfig {
  const defaults = DEFAULT_IMAGE_CONFIG.providers;
  const overrides = config.providers ?? {};
  const providers: Partial<Record<ImageProviderName, ProviderRuntimeConfig>> = {
    "openai-image": defaults["openai-image"] ? { ...defaults["openai-image"], ...pickDefined(overrides["openai-image"]) } : undefined,
    seedream: defaults.seedream ? { ...defaults.seedream, ...pickDefined(overrides.seedream) } : undefined,
    glm: defaults.glm ? { ...defaults.glm, ...pickDefined(overrides.glm) } : undefined,
  };
  return {
    primary: config.primary ?? DEFAULT_IMAGE_CONFIG.primary,
    // 注意：fallback 可能是 null（表示不启用备用），只有 undefined 时才用默认值
    fallback: config.fallback === undefined ? DEFAULT_IMAGE_CONFIG.fallback : config.fallback,
    providers,
  };
}

/** 选择一个启用且配置了 key 的文本 provider */
export function resolveTextProvider(
  config: TextProviderConfig,
): { name: TextProviderName; runtime: ProviderRuntimeConfig } {
  const candidates: Array<TextProviderName> = [config.primary];
  if (config.fallback && config.fallback !== config.primary) {
    candidates.push(config.fallback);
  }
  for (const name of candidates) {
    const runtime = config.providers[name];
    if (runtime?.enabled && isProviderKeyConfigured(name)) {
      return { name, runtime };
    }
  }
  // 全部不可用时返回 primary（由调用方报错）
  const fallbackRuntime = config.providers[config.primary];
  return { name: config.primary, runtime: fallbackRuntime ?? { enabled: false, model: "", timeout: 60, retries: 0 } };
}

/** 选择一个启用且配置了 key 的图像 provider */
export function resolveImageProvider(
  config: ImageProviderConfig,
): { name: ImageProviderName; runtime: ProviderRuntimeConfig } {
  const candidates: Array<ImageProviderName> = [config.primary];
  if (config.fallback && config.fallback !== config.primary) {
    candidates.push(config.fallback);
  }
  for (const name of candidates) {
    const runtime = config.providers[name];
    if (runtime?.enabled && isProviderKeyConfigured(name)) {
      return { name, runtime };
    }
  }
  const fallbackRuntime = config.providers[config.primary];
  return { name: config.primary, runtime: fallbackRuntime ?? { enabled: false, model: "", timeout: 60, retries: 0 } };
}

/** 获取已解析的文本 provider 实例（带单次请求缓存） */
export const getTextProviderInstance = cache(async (): Promise<{
  provider: AIProvider;
  name: TextProviderName;
  runtime: ProviderRuntimeConfig;
}> => {
  const config = await getTextProviderConfig();
  const { name, runtime } = resolveTextProvider(config);
  const provider = getProvider(name, runtime);
  return { provider, name, runtime };
});

/** 获取已解析的图像 provider 实例（带单次请求缓存） */
export const getImageProviderInstance = cache(async (): Promise<{
  provider: AIProvider;
  name: ImageProviderName;
  runtime: ProviderRuntimeConfig;
}> => {
  const config = await getImageProviderConfig();
  const { name, runtime } = resolveImageProvider(config);
  const provider = getProvider(name, runtime);
  return { provider, name, runtime };
});
