import "server-only";

import type {
  ContentSafetyConfig,
  GenerationSpecConfig,
  ImageProviderConfig,
  ImageProviderName,
  ProviderRuntimeConfig,
  QuotaDefaultsConfig,
  SystemConfigKey,
  TextProviderConfig,
  TextProviderName,
} from "@narrlight/shared";
import type { AdminUser } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";

// 默认配置：与 supabase/migrations/014_system_configs.sql 保持一致
const DEFAULT_TEXT_CONFIG: TextProviderConfig = {
  primary: "deepseek",
  fallback: "glm",
  providers: {
    deepseek: { enabled: true, model: "deepseek-v4-flash", timeout: 180, retries: 2 },
    glm: { enabled: true, model: "glm-5.1", timeout: 180, retries: 2 },
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

const DEFAULT_GENERATION_SPEC: GenerationSpecConfig = {
  baseWordsPerHour: 7500,
  characterScriptShare: 0.62,
  characterScriptMode: "single",
  customScriptsPerPlayer: 1,
  minScenesPerAct: 3,
  minCluesPerRoundBase: 4,
  playerClueRatio: 0.8,
  // 相邻档位边界相接（minDuration == 上一档 maxDuration），确保 [2, 8] 实数区间无盲区。
  // 与 apps/web/lib/generation/spec.ts 中 DEFAULT_GENERATION_SPEC_CONFIG 保持一致。
  durationBands: [
    { minDuration: 2, maxDuration: 3, actCount: 3, searchRoundCount: 3 },
    { minDuration: 3, maxDuration: 5, actCount: 4, searchRoundCount: 4 },
    { minDuration: 5, maxDuration: 7, actCount: 5, searchRoundCount: 5 },
    { minDuration: 7, maxDuration: 8, actCount: 6, searchRoundCount: 6 },
  ],
  difficultyMultipliers: {
    beginner: 0.85,
    intermediate: 1,
    advanced: 1.15,
    expert: 1.3,
  },
  genreMultipliers: {
    hardcore: 1.15,
    emotion: 1.05,
    horror: 1,
    funny: 0.95,
    mechanism: 1.1,
  },
};

export type SystemConfigSnapshot = {
  textProvider: TextProviderConfig;
  imageProvider: ImageProviderConfig;
  contentSafety: ContentSafetyConfig;
  quotaDefaults: QuotaDefaultsConfig;
  generationSpec: GenerationSpecConfig;
};

type SystemConfigRow = {
  key: string;
  value: unknown;
  description: string;
  updated_at: string;
};

/** 读取单条配置并解析为指定类型，失败时回退默认值 */
function parseConfig<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return { ...fallback, ...(value as Record<string, unknown>) } as T;
}

/** 规范化文本 provider 配置，补齐缺失字段 */
function normalizeTextConfig(config: TextProviderConfig): TextProviderConfig {
  const providers: Record<TextProviderName, ProviderRuntimeConfig> = {
    deepseek: { ...DEFAULT_TEXT_CONFIG.providers.deepseek, ...config.providers?.deepseek },
    glm: { ...DEFAULT_TEXT_CONFIG.providers.glm, ...config.providers?.glm },
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
  const overrides = config.providers ?? {};
  const defaults = DEFAULT_IMAGE_CONFIG.providers;
  const providers: Partial<Record<ImageProviderName, ProviderRuntimeConfig>> = {
    "openai-image": defaults["openai-image"]
      ? { ...defaults["openai-image"], ...overrides["openai-image"] }
      : undefined,
    seedream: defaults.seedream ? { ...defaults.seedream, ...overrides.seedream } : undefined,
    glm: defaults.glm ? { ...defaults.glm, ...overrides.glm } : undefined,
  };
  return {
    primary: config.primary ?? DEFAULT_IMAGE_CONFIG.primary,
    // 注意：fallback 可能是 null（表示不启用备用），只有 undefined 时才用默认值
    fallback: config.fallback === undefined ? DEFAULT_IMAGE_CONFIG.fallback : config.fallback,
    providers,
  };
}

/** 读取全部系统配置（供 Server Component 使用） */
export async function getSystemConfigSnapshot(): Promise<SystemConfigSnapshot> {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return {
      textProvider: DEFAULT_TEXT_CONFIG,
      imageProvider: DEFAULT_IMAGE_CONFIG,
      contentSafety: DEFAULT_CONTENT_SAFETY,
      quotaDefaults: DEFAULT_QUOTA_DEFAULTS,
      generationSpec: DEFAULT_GENERATION_SPEC,
    };
  }

  const { data, error } = await supabase
    .from("system_configs")
    .select("key, value, description, updated_at");

  if (error || !data) {
    return {
      textProvider: DEFAULT_TEXT_CONFIG,
      imageProvider: DEFAULT_IMAGE_CONFIG,
      contentSafety: DEFAULT_CONTENT_SAFETY,
      quotaDefaults: DEFAULT_QUOTA_DEFAULTS,
      generationSpec: DEFAULT_GENERATION_SPEC,
    };
  }

  const map = new Map<string, SystemConfigRow>();
  for (const row of data as SystemConfigRow[]) {
    map.set(row.key, row);
  }

  const textProvider = normalizeTextConfig(
    parseConfig<TextProviderConfig>(map.get("text_provider")?.value, DEFAULT_TEXT_CONFIG),
  );
  const imageProvider = normalizeImageConfig(
    parseConfig<ImageProviderConfig>(map.get("image_provider")?.value, DEFAULT_IMAGE_CONFIG),
  );
  const contentSafety = parseConfig<ContentSafetyConfig>(
    map.get("content_safety")?.value,
    DEFAULT_CONTENT_SAFETY,
  );
  const quotaDefaults = parseConfig<QuotaDefaultsConfig>(
    map.get("quota_defaults")?.value,
    DEFAULT_QUOTA_DEFAULTS,
  );
  const generationSpec = parseConfig<GenerationSpecConfig>(
    map.get("generation_spec")?.value,
    DEFAULT_GENERATION_SPEC,
  );

  return { textProvider, imageProvider, contentSafety, quotaDefaults, generationSpec };
}

type UpdateableKey = Extract<
  SystemConfigKey,
  "text_provider" | "image_provider" | "content_safety" | "quota_defaults" | "generation_spec"
>;

const CONFIG_DESCRIPTIONS: Record<UpdateableKey, string> = {
  text_provider: "文本生成 provider 路由（剧本生成 / 校验 / 润色）",
  image_provider: "插画生成 provider 路由（封面 / 场景 / 线索卡 / 人物）",
  content_safety: "内容安全开关与人工复核策略",
  quota_defaults: "配额默认值（新用户与各套餐）",
  generation_spec: "剧本生成规格控制（时长、结构、线索与字数）",
};

/** 更新单个配置项并落审计日志 */
export async function updateSystemConfig(
  key: UpdateableKey,
  value: unknown,
  admin: AdminUser,
  reason: string,
): Promise<{ ok: true; previous: unknown } | { ok: false; error: string }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "变更原因不能为空" };
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "未配置 Supabase service role，无法更新系统配置" };
  }

  // 1. 读取旧值作为审计快照
  const { data: existingRow } = await supabase
    .from("system_configs")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const previous = (existingRow as { value?: unknown } | null)?.value ?? null;

  // 2. 获取请求头信息用于审计日志
  // next/headers 在 server-only 模块中可用，需 await（Next.js 15+ async API）
  const requestHeaders = await headers();
  const clientIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = requestHeaders.get("user-agent");

  // 3. upsert 写入新值
  // updated_by 写入 admin.id（migration 026 已把 updated_by 放宽为 VARCHAR(60)，
  // 不再是 auth.users(id) 外键，因此可以写入 admin 端的字符串 id）
  const { error: upsertError } = await supabase
    .from("system_configs")
    .upsert(
      {
        key,
        value: value as never,
        description: CONFIG_DESCRIPTIONS[key],
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

  if (upsertError) {
    return { ok: false, error: `更新 system_configs 失败：${upsertError.message}` };
  }

  // 4. 写审计日志（补齐 ip / user_agent，与其它 admin 写操作保持一致）
  const { error: auditError } = await supabase.from("admin_audit_logs").insert({
    admin_id: admin.id,
    action: `system.config.update`,
    target_type: "system_config",
    target_id: key,
    payload: { before: previous, after: value },
    reason: trimmedReason,
    ip: clientIp,
    user_agent: userAgent,
    created_at: new Date().toISOString(),
  });

  if (auditError) {
    // 审计日志失败不回滚主写入，仅记录警告
    console.warn(`[system-config] 审计日志写入失败：${auditError.message}`);
  }

  return { ok: true, previous };
}
