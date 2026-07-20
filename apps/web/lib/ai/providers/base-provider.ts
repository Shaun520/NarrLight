// AI Provider 抽象层 - 统一多模型调用接口
// 提供文本生成（流式/非流式）、结构化 JSON 生成、逻辑校验、插画生成的统一抽象
// 通过 Provider 工厂模式支持 DeepSeek / GLM 等多模型切换

// 注意：provider 实现文件使用 import type 引用本文件的接口，
// 因此此处静态 import 不会产生运行时循环依赖
import { DeepSeekProvider } from "./deepseek-provider";
import { GLMProvider } from "./glm-provider";
import { OpenAIImageProvider } from "./openai-image-provider";
import { SeedreamProvider } from "./seedream-provider";

/**
 * 文本生成请求选项
 */
export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void; // 流式回调
  signal?: AbortSignal; // 中断信号
}

/**
 * 流式输出片段
 */
export interface StreamChunk {
  content: string;
  done: boolean;
  progress?: number; // 0-1
}

/**
 * 逻辑校验结果
 * issues 类型为 unknown[]，待 T013 全局类型定义完成后可替换为 ValidationIssue[]
 */
export interface ValidationResult {
  issues: unknown[]; // ValidationIssue[]
  summary: string;
}

/**
 * 插画生成结果
 */
export interface IllustrationResult {
  imageUrl: string;
  seed: number;
  model: string;
}

/**
 * AIProvider 抽象接口
 * 所有 Provider 实现类需实现此接口，确保多模型可互换
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;

  // 文本生成（支持流式）
  generate(options: GenerateOptions): Promise<string>;
  generateStream(
    options: GenerateOptions,
  ): AsyncGenerator<StreamChunk, void, unknown>;

  // 结构化 JSON 生成
  generateJSON<T>(options: GenerateOptions): Promise<T>;

  // 逻辑校验
  validate(options: GenerateOptions): Promise<ValidationResult>;

  // 插画生成
  illustrate(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<IllustrationResult>;
}

/**
 * Provider 工厂
 * 根据 name 返回对应的 Provider 实例
 */
export function getProvider(name: "deepseek" | "glm" | "openai-image" | "seedream"): AIProvider {
  if (name === "deepseek") {
    return new DeepSeekProvider();
  }
  if (name === "glm") {
    return new GLMProvider();
  }
  if (name === "openai-image") {
    return new OpenAIImageProvider();
  }
  if (name === "seedream") {
    return new SeedreamProvider();
  }
  throw new Error(`Unknown provider: ${name}`);
}
