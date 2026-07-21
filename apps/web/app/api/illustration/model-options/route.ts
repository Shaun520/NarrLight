import { NextResponse } from 'next/server';
import { getImageProviderConfig } from '@/lib/services/ai-config-service';
import type { ImageProviderName } from '@narrlight/shared';

type ImageProviderOption = {
  id: string;
  label: string;
};

const UI_LABELS: Record<ImageProviderName, string> = {
  'openai-image': 'OpenAI Images',
  glm: 'GLM CogView',
  seedream: '豆包 Seedream',
};

const CONFIG_TO_UI_ID: Record<ImageProviderName, string> = {
  'openai-image': 'openai',
  glm: 'glm',
  seedream: 'seedream',
};

/**
 * GET /api/illustration/model-options
 *
 * 返回当前 admin 在「模型配置」中选择的主/备插画 provider。
 * 只要 provider 在供应商配置中 enabled = true 即显示，
 * 不再额外校验环境变量 API Key（Key 配置问题在生成时由服务端处理）。
 */
export async function GET() {
  try {
    const config = await getImageProviderConfig();

    // 仅展示 admin 选中的主/备模型
    const candidates = [config.primary, config.fallback].filter(
      (name): name is ImageProviderName => Boolean(name),
    );

    const options: ImageProviderOption[] = [];
    for (const providerName of candidates) {
      const runtime = config.providers[providerName];
      if (!runtime?.enabled) continue;
      options.push({
        id: CONFIG_TO_UI_ID[providerName],
        label: UI_LABELS[providerName],
      });
    }

    const defaultModel = CONFIG_TO_UI_ID[config.primary] ?? options[0]?.id ?? 'openai';

    return NextResponse.json({ options, defaultModel });
  } catch (error) {
    console.error('[illustration/model-options] 读取模型配置失败:', error);
    // 失败时返回默认选项，避免页面卡死
    return NextResponse.json({
      options: [
        { id: 'openai', label: 'OpenAI Images' },
        { id: 'glm', label: 'GLM CogView' },
        { id: 'seedream', label: '豆包 Seedream' },
      ],
      defaultModel: 'openai',
    });
  }
}
