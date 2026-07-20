'use server';

import { revalidatePath } from 'next/cache';
import { clueService, type ClueDTO } from '@/lib/services/clue-service';
import { illustrationService } from '@/lib/services/illustration-service';
import type { Clue } from '@/components/clue-card/clue-card';

export async function markClueDistractorAction(
  scriptId: string,
  clueId: string,
  isDistractor: boolean,
): Promise<ClueDTO> {
  const clue = await clueService.markDistractor(clueId, isDistractor);
  revalidatePath(`/editor/${scriptId}/clues`);
  revalidatePath(`/editor/${scriptId}/validation`);
  return clue;
}

export async function markClueKeyAction(
  scriptId: string,
  clueId: string,
  isKey: boolean,
): Promise<ClueDTO> {
  const clue = await clueService.markKeyClue(clueId, isKey);
  revalidatePath(`/editor/${scriptId}/clues`);
  revalidatePath(`/editor/${scriptId}/validation`);
  return clue;
}

export async function ensureClueIllustrationAssetAction(
  scriptId: string,
  clue: Clue,
): Promise<{ assetId: string }> {
  const asset = await illustrationService.ensureClueAsset(scriptId, clue);
  revalidatePath(`/editor/${scriptId}/illustrations`);
  return { assetId: asset.id };
}

export async function ensureClueIllustrationAssetsAction(
  scriptId: string,
  clues: Clue[],
): Promise<{ count: number }> {
  const assets = await illustrationService.ensureClueAssets(scriptId, clues);
  revalidatePath(`/editor/${scriptId}/illustrations`);
  return { count: assets.length };
}
