// 系统配置类型与 key 常量
// 由 admin 端写入 system_configs 表，web 端通过 service role client 只读消费
// 敏感凭据（API Key）继续使用环境变量，不在此处定义

/** system_configs.key 枚举 */
export const SYSTEM_CONFIG_KEYS = [
  "text_provider",
  "image_provider",
  "content_safety",
  "quota_defaults",
] as const;
export type SystemConfigKey = (typeof SYSTEM_CONFIG_KEYS)[number];

/** 文本 provider 名称 */
export type TextProviderName = "deepseek" | "glm";

/** 图像 provider 名称 */
export type ImageProviderName = "openai-image" | "seedream" | "glm";

/** 单个 provider 的运行时配置 */
export interface ProviderRuntimeConfig {
  enabled: boolean;
  model: string;
  timeout: number;
  retries: number;
  size?: string;
}

/** 文本 provider 路由配置 */
export interface TextProviderConfig {
  primary: TextProviderName;
  fallback: TextProviderName | null;
  providers: Record<TextProviderName, ProviderRuntimeConfig>;
}

/** 图像 provider 路由配置 */
export interface ImageProviderConfig {
  primary: ImageProviderName;
  fallback: ImageProviderName | null;
  providers: Partial<Record<ImageProviderName, ProviderRuntimeConfig>>;
}

/** 内容安全配置 */
export interface ContentSafetyConfig {
  enabled: boolean;
  manual_review: boolean;
}

/** 配额默认值 */
export interface QuotaDefaultsConfig {
  free_quota_limit: number;
  pro_monthly_quota: number;
  max_script_words: number;
}
