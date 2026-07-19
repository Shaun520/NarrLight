'use server';

import { createClient } from '@/lib/supabase/server';
import type { CharacterConsistencyInput } from '@/lib/ai/prompts/illustration-style';
import { illustrationGenerateService } from '@/lib/services/illustration-generate-service';
import {
  illustrationWorkflowService,
  type IllustrationTaskView,
} from '@/lib/services/illustration-workflow-service';
import type { IllustrationAsset } from '@/components/illust/asset-list';
import type { IllustrationTaskType } from '@/types';

export type IllustrationAssetView = IllustrationAsset & {
  sourceType?: string | null;
  sourceId?: string | null;
  taskId?: string;
  taskPrompt?: string;
};

export type IllustrationCharacterView = CharacterConsistencyInput & {
  id: string;
};

export interface IllustrationWorkspaceView {
  script: {
    id: string;
    title: string;
  };
  styleProfile: {
    id: string;
    styleName: string;
    visualTone: string;
    masterPrompt: string;
    referenceNotes: string;
  };
  assets: IllustrationAssetView[];
  tasks: IllustrationTaskView[];
  marketItems: Array<{
    id: string;
    title: string;
    taskType: string;
    subtitle: string;
    promptHint: string;
    visualTone: string;
    thumbUrl: string;
    sortOrder: number;
  }>;
  characters: IllustrationCharacterView[];
}

export async function getIllustrationWorkspaceAction(
  scriptId: string,
): Promise<IllustrationWorkspaceView> {
  const workspace = await illustrationWorkflowService.getWorkspace(scriptId);
  return {
    script: {
      id: workspace.script.id,
      title: workspace.script.title,
    },
    styleProfile: {
      id: workspace.styleProfile.id,
      styleName: workspace.styleProfile.styleName,
      visualTone: workspace.styleProfile.visualTone,
      masterPrompt: workspace.styleProfile.masterPrompt,
      referenceNotes: workspace.styleProfile.referenceNotes,
    },
    assets: workspace.tasks.map((task) => ({
      id: task.id,
      type: task.taskType,
      title: task.title,
      sub: task.subtitle,
      status: task.assetStatus,
      thumb: task.thumb,
      progress: task.progressPercent,
      sourceType: task.sourceType,
      sourceId: task.sourceId,
      taskId: task.id,
      taskPrompt: task.prompt,
    })),
    tasks: workspace.tasks,
    marketItems: workspace.marketItems.map((item) => ({
      id: item.id,
      title: item.title,
      taskType: item.taskType,
      subtitle: item.subtitle,
      promptHint: item.promptHint,
      visualTone: item.visualTone,
      thumbUrl: item.thumbUrl,
      sortOrder: item.sortOrder,
    })),
    characters: await getIllustrationCharactersAction(scriptId),
  };
}

export async function getIllustrationAssetsAction(
  scriptId: string,
): Promise<IllustrationAssetView[]> {
  const workspace = await illustrationWorkflowService.getWorkspace(scriptId);
  return workspace.tasks.map((task) => ({
    id: task.id,
    type: task.taskType,
    title: task.title,
    sub: task.subtitle,
    status: task.assetStatus,
    thumb: task.thumb,
    progress: task.progressPercent,
    sourceType: task.sourceType,
    sourceId: task.sourceId,
    taskId: task.id,
    taskPrompt: task.prompt,
  }));
}

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

export async function runIllustrationTaskAction(
  taskId: string,
  config?: { prompt?: string; model?: string; ratio?: string; count?: number },
) {
  const result = await illustrationWorkflowService.runTask(taskId, config);
  return result;
}

export async function runIllustrationBatchAction(scriptId: string, taskIds?: string[]) {
  return illustrationWorkflowService.runBatch(scriptId, taskIds);
}

export async function createIllustrationTaskFromMarketAction(scriptId: string, marketItemId: string) {
  return illustrationWorkflowService.createTaskFromMarket(scriptId, marketItemId);
}

export async function createCustomIllustrationTaskAction(
  scriptId: string,
  input: {
    title: string;
    taskType: IllustrationTaskType;
    prompt: string;
    sourceLabel?: string;
    ratio?: string;
    count?: number;
  },
) {
  return illustrationWorkflowService.createCustomTask(scriptId, input);
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
