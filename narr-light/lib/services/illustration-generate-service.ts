import type { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from '@/lib/ai/providers/base-provider';
import { fetchWithOptionalProxy } from '@/lib/ai/providers/fetch-with-proxy';
import { ApiError } from '@/lib/api/response';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/types';

const IMAGE_BUCKET = 'illustration-assets';

export interface GenerateSingleParams {
  scriptId: string;
  assetId: string;
  prompt: string;
  model: string;
  ratio: string;
  count: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  id: string;
  imageUrl: string;
  model: string;
  seed: number;
}

export type ProgressCallback = (percent: number, message: string) => void;

interface AssetRow {
  id: string;
  script_id: string;
  title: string;
  sub: string;
  locked: boolean;
}

interface VersionRow {
  id: string;
  image_url: string;
  model: string;
  seed: number;
}

type ImageProviderName = 'glm' | 'openai-image' | 'seedream';

function normalizeProvider(model: string): ImageProviderName {
  if (model === 'glm') return 'glm';
  if (model === 'openai') return 'openai-image';
  if (model === 'seedream' || model === 'seeddance') return 'seedream';
  throw new ApiError('INVALID_MODEL', `不支持的插画模型: ${model}`, 400);
}

function mapRatioToSize(ratio: string, provider: ImageProviderName): string {
  if (provider === 'openai-image') {
    if (ratio === '3:4') return '1024x1536';
    if (ratio === '16:9') return '1536x1024';
    return '1024x1024';
  }
  if (ratio === '3:4') return '1024x1536';
  if (ratio === '16:9') return '1536x1024';
  return '1024x1024';
}

function resolveProviderModel(provider: ImageProviderName): string {
  if (provider === 'openai-image') {
    return process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1.5';
  }
  if (provider === 'seedream') {
    const model = process.env.SEEDDANCE_IMAGE_MODEL ?? process.env.SEEDREAM_IMAGE_MODEL;
    if (!model) {
      throw new ApiError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'SEEDREAM_IMAGE_MODEL 或 SEEDDANCE_IMAGE_MODEL 未配置，无法调用豆包图片模型。',
        500,
      );
    }
    return model;
  }
  return process.env.GLM_IMAGE_MODEL ?? 'cogview-3-plus';
}

function isInvalidKey(key: string | undefined): boolean {
  const value = key?.trim();
  return (
    !value ||
    value.includes('你的') ||
    value.includes('浣犵殑') ||
    value.includes('your-') ||
    value.includes('_') ||
    [...value].some((char) => char.codePointAt(0)! > 127) ||
    value.length < 20
  );
}

function assertRealImageProviderConfigured(provider: ImageProviderName) {
  const keyByProvider: Record<ImageProviderName, string | undefined> = {
    glm: process.env.GLM_API_KEY,
    'openai-image': process.env.OPENAI_API_KEY,
    seedream: process.env.ARK_API_KEY ?? process.env.VOLCENGINE_API_KEY,
  };
  const envNameByProvider: Record<ImageProviderName, string> = {
    glm: 'GLM_API_KEY',
    'openai-image': 'OPENAI_API_KEY',
    seedream: 'ARK_API_KEY',
  };
  const hasInvalidPlaceholder =
    isInvalidKey(keyByProvider[provider]);
  if (hasInvalidPlaceholder) {
    throw new ApiError(
      'AI_PROVIDER_NOT_CONFIGURED',
      `${envNameByProvider[provider]} 未配置为有效值，无法执行真实插画生成。`,
      500,
    );
  }
}

function extensionFromContentType(contentType: string | null): string {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  return 'png';
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

async function fetchImageBlob(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; contentType: string }> {
  const response = await fetchWithOptionalProxy(imageUrl, { signal });
  if (!response.ok) {
    throw new ApiError(
      'IMAGE_DOWNLOAD_FAILED',
      `下载生成图片失败: ${response.status} ${response.statusText}`,
      502,
    );
  }
  const contentType = response.headers.get('content-type') ?? 'image/png';
  return { blob: await response.blob(), contentType };
}

export class IllustrationGenerateService {
  async generateSingle(
    params: GenerateSingleParams,
    onProgress?: ProgressCallback,
  ): Promise<GenerateResult> {
    const providerName = normalizeProvider(params.model);
    assertRealImageProviderConfigured(providerName);

    const supabase = this.getAdminClient();
    const asset = await this.getAssetForGeneration(supabase, params.scriptId, params.assetId);
    const provider = getProvider(providerName);

    onProgress?.(10, '准备生成');
    await this.markAssetActive(supabase, params.assetId);

    try {
      onProgress?.(35, '调用图像模型');
      const result = await provider.illustrate(params.prompt, {
        model: resolveProviderModel(providerName),
        size: mapRatioToSize(params.ratio, providerName),
        n: Math.max(1, Math.min(params.count, 4)),
        output_format: 'png',
        signal: params.signal,
      });

      onProgress?.(70, '上传图片');
      const storedUrl = await this.storeGeneratedImage(supabase, {
        scriptId: params.scriptId,
        assetId: params.assetId,
        sourceImageUrl: result.imageUrl,
        signal: params.signal,
      });

      onProgress?.(90, '写入版本');
      const version = await this.createVersionAndUpdateAsset(supabase, {
        assetId: params.assetId,
        imageUrl: storedUrl,
        model: result.model,
        seed: result.seed,
        params: {
          prompt: params.prompt,
          requestedModel: params.model,
          provider: providerName,
          ratio: params.ratio,
          count: params.count,
          assetTitle: asset.title,
          assetSub: asset.sub,
        },
      });

      onProgress?.(100, '生成完成');
      return {
        id: version.id,
        imageUrl: version.image_url,
        model: version.model,
        seed: version.seed,
      };
    } catch (error) {
      if (isAbortError(error)) {
        await this.markAssetCancelled(supabase, params.assetId);
      } else {
        await this.markAssetFailed(supabase, params.assetId);
      }
      throw error;
    }
  }

  private getAdminClient(): SupabaseClient {
    return createAdminClient() as unknown as SupabaseClient;
  }

  private async getAssetForGeneration(
    supabase: SupabaseClient,
    scriptId: string,
    assetId: string,
  ): Promise<AssetRow> {
    const { data, error } = await supabase
      .from('illustration_assets')
      .select('id, script_id, title, sub, locked')
      .eq('id', assetId)
      .eq('script_id', scriptId)
      .maybeSingle();

    if (error) {
      throw new ApiError('DB_QUERY_ERROR', `读取插画资产失败: ${error.message}`, 500);
    }
    if (!data) {
      throw new ApiError('NOT_FOUND', '插画资产不存在', 404);
    }
    const asset = data as unknown as AssetRow;
    if (asset.locked) {
      throw new ApiError('ASSET_LOCKED', '该插画资产已锁定，不能重新生成。', 409);
    }
    return asset;
  }

  private async markAssetActive(supabase: SupabaseClient, assetId: string): Promise<void> {
    const { error } = await supabase
      .from('illustration_assets')
      .update({
        status: 'active',
        progress: 10,
        sub: '生成中',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', assetId);

    if (error) {
      throw new ApiError('DB_UPDATE_ERROR', `更新插画资产状态失败: ${error.message}`, 500);
    }
  }

  private async markAssetFailed(supabase: SupabaseClient, assetId: string): Promise<void> {
    await supabase
      .from('illustration_assets')
      .update({
        status: 'pending',
        progress: 0,
        sub: '生成失败，请重试',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', assetId);
  }

  private async markAssetCancelled(supabase: SupabaseClient, assetId: string): Promise<void> {
    await supabase
      .from('illustration_assets')
      .update({
        status: 'pending',
        progress: 0,
        sub: '生成已停止',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', assetId);
  }

  private async storeGeneratedImage(
    supabase: SupabaseClient,
    args: { scriptId: string; assetId: string; sourceImageUrl: string; signal?: AbortSignal },
  ): Promise<string> {
    await this.ensureImageBucket(supabase);
    const { blob, contentType } = await fetchImageBlob(args.sourceImageUrl, args.signal);
    const ext = extensionFromContentType(contentType);
    const path = `${args.scriptId}/${args.assetId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, blob, { contentType, upsert: false });

    if (error) {
      throw new ApiError('STORAGE_UPLOAD_FAILED', `上传插画图片失败: ${error.message}`, 500);
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  private async ensureImageBucket(supabase: SupabaseClient): Promise<void> {
    const { error } = await supabase.storage.getBucket(IMAGE_BUCKET);
    if (!error) return;

    const { error: createError } = await supabase.storage.createBucket(IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });

    if (createError && !createError.message.toLowerCase().includes('already exists')) {
      throw new ApiError(
        'STORAGE_BUCKET_ERROR',
        `创建插画 Storage Bucket 失败: ${createError.message}`,
        500,
      );
    }
  }

  private async createVersionAndUpdateAsset(
    supabase: SupabaseClient,
    args: {
      assetId: string;
      imageUrl: string;
      model: string;
      seed: number;
      params: Json;
    },
  ): Promise<VersionRow> {
    const { data: version, error: versionError } = await supabase
      .from('illustration_versions')
      .insert({
        asset_id: args.assetId,
        image_url: args.imageUrl,
        model: args.model,
        seed: args.seed,
        params: args.params,
      } as never)
      .select('id, image_url, model, seed')
      .single();

    if (versionError) {
      throw new ApiError('DB_UPDATE_ERROR', `写入插画版本失败: ${versionError.message}`, 500);
    }

    const row = version as unknown as VersionRow;
    const { error: assetError } = await supabase
      .from('illustration_assets')
      .update({
        status: 'done',
        progress: 100,
        thumb: args.imageUrl,
        sub: '已生成',
        current_version_id: row.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', args.assetId);

    if (assetError) {
      throw new ApiError('DB_UPDATE_ERROR', `更新插画资产失败: ${assetError.message}`, 500);
    }

    return row;
  }
}

export const illustrationGenerateService = new IllustrationGenerateService();
