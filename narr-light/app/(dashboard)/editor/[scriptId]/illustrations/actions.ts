'use server';

import { createClient } from '@/lib/supabase/server';
import { illustrationService } from '@/lib/services/illustration-service';
import { illustrationGenerateService } from '@/lib/services/illustration-generate-service';
import type { IllustrationAsset } from '@/components/illust/asset-list';
import type { CharacterConsistencyInput } from '@/lib/ai/prompts/illustration-style';

export type IllustrationAssetView = IllustrationAsset & {
  sourceType?: string | null;
  sourceId?: string | null;
};

export async function getIllustrationAssetsAction(
  scriptId: string,
): Promise<IllustrationAssetView[]> {
  const assets = await illustrationService.getAssets(scriptId);
  return assets.map((asset) => ({
    id: asset.id,
    type: asset.type,
    title: asset.title,
    sub: asset.sub,
    status: asset.status,
    thumb: asset.thumb,
    progress: asset.progress,
    sourceType: asset.sourceType,
    sourceId: asset.sourceId,
  }));
}

export type IllustrationCharacterView = CharacterConsistencyInput & {
  id: string;
};

export async function getIllustrationCharactersAction(
  scriptId: string,
): Promise<IllustrationCharacterView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, role_identity, gender, age, personality, background_story, sort_order')
    .eq('script_id', scriptId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`读取人物设定失败: ${error.message}`);
  }

  return (data ?? []).map((character) => ({
    id: character.id,
    name: character.name,
    roleIdentity: character.role_identity,
    gender: character.gender,
    age: character.age,
    personality: character.personality,
    backgroundStory: character.background_story,
  }));
}

export interface GenerateIllustrationInput {
  scriptId: string;
  assetId: string;
  prompt: string;
  model: string;
  ratio: string;
  count: number;
}

export async function generateIllustrationAssetAction(
  input: GenerateIllustrationInput,
  _onProgress?: unknown,
): Promise<{ imageUrl: string; model: string; seed: number }> {
  void _onProgress;
  const result = await illustrationGenerateService.generateSingle(input);
  return {
    imageUrl: result.imageUrl,
    model: result.model,
    seed: result.seed,
  };
}
