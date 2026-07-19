import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildCharacterConsistencyPrompt,
  buildCoverPrompt,
  buildIllustrationPrompt,
  buildSceneStylePrompt,
  buildVisualTone,
  formatVisualTone,
  type ScriptVisualInput,
} from '@/lib/ai/prompts/illustration-style';
import { illustrationGenerateService } from '@/lib/services/illustration-generate-service';
import type {
  IllustrationMarketItem,
  IllustrationStyleProfile,
  IllustrationTask,
  IllustrationTaskStatus,
  IllustrationTaskType,
} from '@/types';

interface ScriptRow {
  id: string;
  title: string;
  genre: string;
  background_setting: string;
  core_theme: string;
  player_count: number;
  duration_hours: number;
  updated_at: string;
}

interface CharacterRow {
  id: string;
  script_id: string;
  name: string;
  role_identity: string;
  gender: 'male' | 'female' | 'unknown' | '';
  age: number | null;
  personality: string;
  background_story: string;
  sort_order: number;
}

interface ActRow {
  id: string;
  script_id: string;
  title: string;
  content: string;
  sort_order: number;
}

interface ClueRow {
  id: string;
  script_id: string;
  title: string;
  content: string;
  location: string;
  sort_order: number;
}

interface AssetRow {
  id: string;
  script_id: string;
  type: IllustrationTaskType;
  title: string;
  sub: string;
  thumb: string;
  status: 'done' | 'active' | 'pending';
  progress: number | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StyleProfileRow {
  id: string;
  script_id: string;
  style_name: string;
  visual_tone: string;
  master_prompt: string;
  reference_notes: string;
  market_item_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  script_id: string;
  style_profile_id: string;
  asset_id: string | null;
  market_item_id: string | null;
  task_key: string;
  task_type: IllustrationTaskType;
  source_type: string;
  source_id: string;
  title: string;
  subtitle: string;
  prompt: string;
  status: IllustrationTaskStatus;
  progress_percent: number;
  sort_order: number;
  selected_model: string;
  selected_ratio: string;
  selected_count: number;
  result_image_url: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MarketRow {
  id: string;
  title: string;
  task_type: IllustrationTaskType;
  subtitle: string;
  prompt_hint: string;
  visual_tone: string;
  thumb_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message?.includes('Could not find the table') ||
        error.message?.includes('schema cache')),
  );
}

export interface IllustrationTaskView extends IllustrationTask {
  thumb: string;
  sourceLabel: string;
  assetStatus: 'done' | 'active' | 'pending';
  taskPromptSeed: string;
}

export interface IllustrationWorkspace {
  script: ScriptRow;
  styleProfile: IllustrationStyleProfile;
  tasks: IllustrationTaskView[];
  marketItems: IllustrationMarketItem[];
}

interface TaskSpec {
  taskKey: string;
  taskType: IllustrationTaskType;
  title: string;
  subtitle: string;
  prompt: string;
  sourceType: string;
  sourceId: string;
  sortOrder: number;
  marketItemId?: string | null;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export class IllustrationWorkflowService {
  async ensureScriptWorkspace(scriptId: string): Promise<IllustrationWorkspace> {
    const supabase = this.getAdminClient();
    const [script, characters, acts, clues, marketItems] = await Promise.all([
      this.getScript(supabase, scriptId),
      this.getCharacters(supabase, scriptId),
      this.getActs(supabase, scriptId),
      this.getClues(supabase, scriptId),
      this.getMarketItems(supabase),
    ]);

    const styleProfile = await this.ensureStyleProfile(supabase, script, characters, marketItems);
    const taskSpecs = this.buildTaskSpecs(script, characters, acts, clues, styleProfile, marketItems);
    await this.upsertTasksAndAssets(supabase, script.id, styleProfile.id, taskSpecs);

    return this.getWorkspace(scriptId);
  }

  async getWorkspace(scriptId: string): Promise<IllustrationWorkspace> {
    const supabase = this.getAdminClient();
    const [script, characters, marketItems, taskRows, assetRows, persistedStyleProfile] = await Promise.all([
      this.getScript(supabase, scriptId),
      this.getCharacters(supabase, scriptId),
      this.getMarketItems(supabase),
      this.getTasks(supabase, scriptId),
      this.getAssets(supabase, scriptId),
      this.getStyleProfileOptional(supabase, scriptId),
    ]);
    const styleProfile =
      persistedStyleProfile ?? (await this.ensureStyleProfile(supabase, script, characters, marketItems));

    const assetById = new Map(assetRows.map((row) => [row.id, row]));
    const tasks =
      taskRows.length > 0
        ? taskRows.map((row) => this.mapTaskRow(row, assetById.get(row.asset_id ?? '') ?? null))
        : assetRows.map((row, index) => this.mapAssetFallbackTask(row, styleProfile, index));

    return {
      script,
      styleProfile,
      tasks,
      marketItems,
    };
  }

  async createTaskFromMarket(scriptId: string, marketItemId: string): Promise<IllustrationTaskView> {
    const supabase = this.getAdminClient();
    const [script, marketItems, characters, persistedStyleProfile] = await Promise.all([
      this.getScript(supabase, scriptId),
      this.getMarketItems(supabase),
      this.getCharacters(supabase, scriptId),
      this.getStyleProfileOptional(supabase, scriptId),
    ]);
    const styleProfile =
      persistedStyleProfile ?? (await this.ensureStyleProfile(supabase, script, characters, marketItems));

    const marketItem = marketItems.find((item) => item.id === marketItemId);
    if (!marketItem) {
      throw new Error('市场素材不存在');
    }

    const taskSpecs = this.buildTaskSpecs(script, characters, [], [], styleProfile, marketItems, marketItem);
    const [spec] = taskSpecs;
    if (!spec) throw new Error('市场素材未能生成任务');

    const { taskRow, assetRow } = await this.upsertSingleTaskAndAsset(supabase, script.id, styleProfile.id, spec);
    return this.mapTaskRow(taskRow, assetRow);
  }

  async createCustomTask(
    scriptId: string,
    input: {
      title: string;
      taskType: IllustrationTaskType;
      prompt: string;
      sourceLabel?: string;
      ratio?: string;
      count?: number;
    },
  ): Promise<IllustrationTaskView> {
    const supabase = this.getAdminClient();
    const [script, characters, marketItems, persistedStyleProfile] = await Promise.all([
      this.getScript(supabase, scriptId),
      this.getCharacters(supabase, scriptId),
      this.getMarketItems(supabase),
      this.getStyleProfileOptional(supabase, scriptId),
    ]);
    const styleProfile =
      persistedStyleProfile ?? this.buildStyleProfileSnapshot(script, characters, marketItems);
    const taskKey = `manual-${crypto.randomUUID()}`;
    const spec: TaskSpec = {
      taskKey,
      taskType: input.taskType,
      title: input.title.trim() || `${script.title} · 自定义插画`,
      subtitle: input.sourceLabel?.trim() || '当前剧本 · 手动创建',
      prompt: `${input.prompt.trim() || input.title}；${styleProfile.masterPrompt}`,
      sourceType: 'manual',
      sourceId: taskKey,
      sortOrder: 900 + Math.floor(Date.now() % 1000),
    };

    const { taskRow, assetRow } = await this.upsertSingleTaskAndAsset(supabase, script.id, styleProfile.id, spec);
    const updated = await this.updateTask(supabase, taskRow.id, {
      selected_ratio: input.ratio ?? taskRow.selected_ratio,
      selected_count: input.count ?? taskRow.selected_count,
    });
    return this.mapTaskRow(updated, assetRow);
  }

  async runTask(
    taskId: string,
    config?: { prompt?: string; model?: string; ratio?: string; count?: number; signal?: AbortSignal },
  ): Promise<IllustrationTaskView> {
    const supabase = this.getAdminClient();
    let task = await this.getTaskById(supabase, taskId);
    if (!task) throw new Error('插画任务不存在');
    if (!task.asset_id) throw new Error('插画任务缺少资源绑定');
    const assetId = task.asset_id;

    task = await this.updateTask(supabase, taskId, {
      status: 'running',
      progress_percent: 8,
      started_at: new Date().toISOString(),
      error_message: '',
      prompt: config?.prompt?.trim() || task.prompt,
      selected_model: config?.model || task.selected_model,
      selected_ratio: config?.ratio || task.selected_ratio,
      selected_count: config?.count || task.selected_count,
    });

    try {
      const result = await illustrationGenerateService.generateSingle(
        {
          scriptId: task.script_id,
          assetId,
          prompt: task.prompt,
          model: task.selected_model,
          ratio: task.selected_ratio,
          count: task.selected_count,
          signal: config?.signal,
        },
        async (percent) => {
          await this.updateTask(supabase, taskId, {
            progress_percent: Math.max(8, Math.min(95, Math.round(percent))),
          });
        },
      );

      const updated = await this.updateTask(supabase, taskId, {
        status: 'completed',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        result_image_url: result.imageUrl,
        error_message: '',
      });

      const asset = await this.getAssetById(supabase, assetId);
      return this.mapTaskRow(updated, asset);
    } catch (error) {
      if (isAbortError(error)) {
        await this.updateTask(supabase, taskId, {
          status: 'cancelled',
          progress_percent: 0,
          completed_at: new Date().toISOString(),
          error_message: '生成已停止',
        });
        throw error;
      }
      await this.updateTask(supabase, taskId, {
        status: 'failed',
        progress_percent: 0,
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async runBatch(scriptId: string, taskIds?: string[]): Promise<{ total: number; completed: number; failed: number }> {
    const supabase = this.getAdminClient();
    const taskRows = taskIds?.length
      ? await this.getTasksByIds(supabase, scriptId, taskIds)
      : await this.getPendingTasks(supabase, scriptId);

    let completed = 0;
    let failed = 0;
    for (const row of taskRows) {
      try {
        await this.runTask(row.id);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
    return { total: taskRows.length, completed, failed };
  }

  private getAdminClient(): SupabaseClient {
    return createAdminClient() as unknown as SupabaseClient;
  }

  private async getScript(supabase: SupabaseClient, scriptId: string): Promise<ScriptRow> {
    const { data, error } = await supabase
      .from('scripts')
      .select('id, title, genre, background_setting, core_theme, player_count, duration_hours, updated_at')
      .eq('id', scriptId)
      .maybeSingle();
    if (error) throw new Error(`读取剧本失败: ${error.message}`);
    if (!data) throw new Error('剧本不存在');
    return data as unknown as ScriptRow;
  }

  private async getCharacters(supabase: SupabaseClient, scriptId: string): Promise<CharacterRow[]> {
    const { data, error } = await supabase
      .from('characters')
      .select('id, script_id, name, role_identity, gender, age, personality, background_story, sort_order')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`读取角色失败: ${error.message}`);
    return (data ?? []) as unknown as CharacterRow[];
  }

  private async getActs(supabase: SupabaseClient, scriptId: string): Promise<ActRow[]> {
    const { data, error } = await supabase
      .from('acts')
      .select('id, script_id, title, content, sort_order')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`读取幕次失败: ${error.message}`);
    return (data ?? []) as unknown as ActRow[];
  }

  private async getClues(supabase: SupabaseClient, scriptId: string): Promise<ClueRow[]> {
    const { data, error } = await supabase
      .from('clues')
      .select('id, script_id, title, content, location, sort_order')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`读取线索失败: ${error.message}`);
    return (data ?? []) as unknown as ClueRow[];
  }

  private async getAssets(supabase: SupabaseClient, scriptId: string): Promise<AssetRow[]> {
    const { data, error } = await supabase
      .from('illustration_assets')
      .select('*')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`读取插画资源失败: ${error.message}`);
    return (data ?? []) as unknown as AssetRow[];
  }

  private async getAssetById(supabase: SupabaseClient, assetId: string): Promise<AssetRow | null> {
    const { data, error } = await supabase
      .from('illustration_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (error) throw new Error(`读取插画资源失败: ${error.message}`);
    return (data ?? null) as unknown as AssetRow | null;
  }

  private async getTasks(supabase: SupabaseClient, scriptId: string): Promise<TaskRow[]> {
    const { data, error } = await supabase
      .from('illustration_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return [];
      throw new Error(`读取插画任务失败: ${error.message}`);
    }
    return (data ?? []) as unknown as TaskRow[];
  }

  private async getTaskById(supabase: SupabaseClient, taskId: string): Promise<TaskRow | null> {
    const { data, error } = await supabase
      .from('illustration_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();
    if (error) throw new Error(`读取插画任务失败: ${error.message}`);
    return (data ?? null) as unknown as TaskRow | null;
  }

  private async getTaskByKey(
    supabase: SupabaseClient,
    scriptId: string,
    taskKey: string,
  ): Promise<TaskRow | null> {
    const { data, error } = await supabase
      .from('illustration_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .eq('task_key', taskKey)
      .maybeSingle();
    if (error) throw new Error(`读取插画任务失败: ${error.message}`);
    return (data ?? null) as unknown as TaskRow | null;
  }

  private async getTasksByIds(
    supabase: SupabaseClient,
    scriptId: string,
    taskIds: string[],
  ): Promise<TaskRow[]> {
    const { data, error } = await supabase
      .from('illustration_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .in('id', taskIds)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`读取插画任务失败: ${error.message}`);
    return (data ?? []) as unknown as TaskRow[];
  }

  private async getPendingTasks(supabase: SupabaseClient, scriptId: string): Promise<TaskRow[]> {
    const { data, error } = await supabase
      .from('illustration_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .eq('status', 'pending')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`读取待执行任务失败: ${error.message}`);
    return (data ?? []) as unknown as TaskRow[];
  }

  private async getMarketItems(supabase: SupabaseClient): Promise<IllustrationMarketItem[]> {
    const { data, error } = await supabase
      .from('illustration_market_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      if (isMissingTableError(error)) {
        return [
          {
            id: 'fallback-market-scene',
            title: '雨夜码头氛围',
            taskType: 'scene',
            subtitle: '适合港口、旧镇、潮湿夜景',
            promptHint: '雨夜中的码头与远处灯火，强调潮湿空气、木箱、反光水面和压迫感',
            visualTone: '水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围',
            thumbUrl: '',
            sortOrder: 1,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      throw new Error(`读取市场素材失败: ${error.message}`);
    }
    return (data ?? []).map((row) => this.mapMarketRow(row as unknown as MarketRow));
  }

  private async getStyleProfile(
    supabase: SupabaseClient,
    scriptId: string,
  ): Promise<IllustrationStyleProfile | null> {
    const { data, error } = await supabase
      .from('illustration_style_profiles')
      .select('*')
      .eq('script_id', scriptId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        return null;
      }
      throw new Error(`读取风格档案失败: ${error.message}`);
    }
    if (!data) throw new Error('插画风格档案不存在');
    return this.mapStyleRow(data as unknown as StyleProfileRow);
  }

  private async ensureStyleProfile(
    supabase: SupabaseClient,
    script: ScriptRow,
    characters: CharacterRow[],
    marketItems: IllustrationMarketItem[],
  ): Promise<IllustrationStyleProfile> {
    const existing = await this.getStyleProfileOptional(supabase, script.id);
    if (existing) return existing;

    const visualTone = buildVisualTone({
      title: script.title,
      genre: script.genre,
      backgroundSetting: script.background_setting,
      coreTheme: script.core_theme,
      writingStyle: '剧本统一插画风格',
    } satisfies ScriptVisualInput);

    const styleName = `${script.title} 统一风格`;
    const referenceNotes = [
      `角色数 ${script.player_count}`,
      `时长 ${script.duration_hours}h`,
      `角色样本 ${characters.slice(0, 3).map((item) => item.name).join(' / ')}`,
      marketItems[0]?.title ? `市场参考 ${marketItems[0].title}` : '',
    ]
      .filter(Boolean)
      .join('；');

    const masterPrompt = [
      `剧本：${script.title}`,
      `统一视觉基调：${formatVisualTone(visualTone)}`,
      `背景：${script.background_setting}`,
      script.core_theme ? `主题：${script.core_theme}` : '',
      '所有插画必须保持同一剧本风格、同一色调、同一笔触和角色一致性。',
    ]
      .filter(Boolean)
      .join('；');

    const payload = {
      id: script.id,
      scriptId: script.id,
      styleName,
      visualTone: formatVisualTone(visualTone),
      masterPrompt,
      referenceNotes,
      marketItemId: marketItems[0]?.id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('illustration_style_profiles')
      .insert({
        script_id: script.id,
        style_name: styleName,
        visual_tone: payload.visualTone,
        master_prompt: payload.masterPrompt,
        reference_notes: referenceNotes,
        market_item_id: marketItems[0]?.id ?? null,
      })
      .select('*')
      .single();
    if (error) {
      if (isMissingTableError(error)) {
        return payload;
      }
      throw new Error(`创建风格档案失败: ${error.message}`);
    }
    return this.mapStyleRow(data as unknown as StyleProfileRow);
  }

  private async getStyleProfileOptional(
    supabase: SupabaseClient,
    scriptId: string,
  ): Promise<IllustrationStyleProfile | null> {
    const { data, error } = await supabase
      .from('illustration_style_profiles')
      .select('*')
      .eq('script_id', scriptId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return null;
      throw new Error(`读取风格档案失败: ${error.message}`);
    }
    return data ? this.mapStyleRow(data as unknown as StyleProfileRow) : null;
  }

  private buildStyleProfileSnapshot(
    script: ScriptRow,
    characters: CharacterRow[],
    marketItems: IllustrationMarketItem[],
  ): IllustrationStyleProfile {
    const visualTone = buildVisualTone({
      title: script.title,
      genre: script.genre,
      backgroundSetting: script.background_setting,
      coreTheme: script.core_theme,
      writingStyle: '剧本统一插画风格',
    } satisfies ScriptVisualInput);

    const masterPrompt = [
      `剧本：${script.title}`,
      `统一视觉基调：${formatVisualTone(visualTone)}`,
      `背景：${script.background_setting}`,
      script.core_theme ? `主题：${script.core_theme}` : '',
      '所有插画必须保持同一剧本风格、同一色调、同一笔触和角色一致性。',
    ]
      .filter(Boolean)
      .join('；');

    const referenceNotes = [
      `角色数 ${script.player_count}`,
      `时长 ${script.duration_hours}h`,
      `角色样本 ${characters.slice(0, 3).map((item) => item.name).join(' / ')}`,
      marketItems[0]?.title ? `市场参考 ${marketItems[0].title}` : '',
    ]
      .filter(Boolean)
      .join('；');

    return {
      id: script.id,
      scriptId: script.id,
      styleName: `${script.title} 统一风格`,
      visualTone: formatVisualTone(visualTone),
      masterPrompt,
      referenceNotes,
      marketItemId: marketItems[0]?.id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private buildTaskSpecs(
    script: ScriptRow,
    characters: CharacterRow[],
    acts: ActRow[],
    clues: ClueRow[],
    styleProfile: IllustrationStyleProfile,
    marketItems: IllustrationMarketItem[],
    marketItem?: IllustrationMarketItem,
  ): TaskSpec[] {
    const visualTone = styleProfile.visualTone;
    const promptPrefix = styleProfile.masterPrompt;
    const refs = marketItems.slice(0, 2).map((item) => item.title);

    const specs: TaskSpec[] = [];

    specs.push({
      taskKey: 'cover',
      taskType: 'cover',
      title: `${script.title} · 剧本封面`,
      subtitle: `统一风格 · ${styleProfile.styleName}`,
      prompt: buildCoverPrompt(
        {
          title: script.title,
          genre: script.genre,
          backgroundSetting: script.background_setting,
          coreTheme: script.core_theme,
          writingStyle: promptPrefix,
        },
        {
          style: visualTone.split(' / ')[0] ?? '水墨古风',
          lighting: visualTone.split(' / ')[1] ?? '暗调暖光',
          composition: visualTone.split(' / ')[2] ?? '留白构图',
          mood: visualTone.split(' / ')[3] ?? '悬疑氛围',
        },
      ),
      sourceType: 'script',
      sourceId: script.id,
      sortOrder: 0,
    });

    acts.forEach((act, index) => {
      specs.push({
        taskKey: `act-${act.id}`,
        taskType: 'scene',
        title: act.title,
        subtitle: `第${index + 1}幕 · ${act.content.slice(0, 28)}`,
        prompt: buildSceneStylePrompt(
          {
            title: act.title,
            location: script.background_setting,
            content: act.content,
          },
          {
            style: visualTone.split(' / ')[0] ?? '水墨古风',
            lighting: visualTone.split(' / ')[1] ?? '暗调暖光',
            composition: visualTone.split(' / ')[2] ?? '留白构图',
            mood: visualTone.split(' / ')[3] ?? '悬疑氛围',
          },
        ),
        sourceType: 'act',
        sourceId: act.id,
        sortOrder: 10 + index,
      });
    });

    characters.forEach((character, index) => {
      specs.push({
        taskKey: `character-${character.id}`,
        taskType: 'char',
        title: `${character.name} · 人物立绘`,
        subtitle: character.role_identity,
        prompt: buildCharacterConsistencyPrompt({
          name: character.name,
          roleIdentity: character.role_identity,
          gender: character.gender,
          age: character.age,
          personality: character.personality,
          backgroundStory: character.background_story,
        }),
        sourceType: 'character',
        sourceId: character.id,
        sortOrder: 100 + index,
      });
    });

    clues.forEach((clue, index) => {
      specs.push({
        taskKey: `clue-${clue.id}`,
        taskType: 'clue',
        title: `${clue.title} · 线索插画`,
        subtitle: clue.location,
        prompt: buildIllustrationPrompt(
          {
            id: clue.id,
            type: 'clue',
            title: clue.title,
            description: clue.content,
          },
          {
            style: visualTone.split(' / ')[0] ?? '水墨古风',
            lighting: visualTone.split(' / ')[1] ?? '暗调暖光',
            composition: visualTone.split(' / ')[2] ?? '留白构图',
            mood: visualTone.split(' / ')[3] ?? '悬疑氛围',
          },
          refs.map((title, refIndex) => ({ id: `${refIndex + 1}`, title })),
        ),
        sourceType: 'clue',
        sourceId: clue.id,
        sortOrder: 200 + index,
      });
    });

    specs.push({
      taskKey: 'public',
      taskType: 'public',
      title: `${script.title} · 公共线索`,
      subtitle: '公共场景氛围图',
      prompt: buildIllustrationPrompt(
        {
          id: `${script.id}-public`,
          type: 'public',
          title: `${script.title} 公共线索`,
          description: `${script.background_setting}中的公共场景，保持与剧本其他插画一致的视觉基调`,
        },
        {
          style: visualTone.split(' / ')[0] ?? '水墨古风',
          lighting: visualTone.split(' / ')[1] ?? '暗调暖光',
          composition: visualTone.split(' / ')[2] ?? '留白构图',
          mood: visualTone.split(' / ')[3] ?? '悬疑氛围',
        },
      ),
      sourceType: 'script',
      sourceId: `${script.id}-public`,
      sortOrder: 300,
      marketItemId: marketItem?.id ?? null,
    });

    specs.push({
      taskKey: 'poster',
      taskType: 'poster',
      title: `${script.title} · 宣传海报`,
      subtitle: '剧本宣传素材',
      prompt: marketItem
        ? `${marketItem.promptHint}；${promptPrefix}`
        : buildCoverPrompt(
            {
              title: script.title,
              genre: script.genre,
              backgroundSetting: script.background_setting,
              coreTheme: script.core_theme,
              writingStyle: promptPrefix,
            },
            {
              style: visualTone.split(' / ')[0] ?? '水墨古风',
              lighting: visualTone.split(' / ')[1] ?? '暗调暖光',
              composition: visualTone.split(' / ')[2] ?? '留白构图',
              mood: visualTone.split(' / ')[3] ?? '悬疑氛围',
            },
          ),
      sourceType: 'script',
      sourceId: `${script.id}-poster`,
      sortOrder: 400,
      marketItemId: marketItem?.id ?? null,
    });

    return specs;
  }

  private async upsertTasksAndAssets(
    supabase: SupabaseClient,
    scriptId: string,
    styleProfileId: string,
    specs: TaskSpec[],
  ): Promise<void> {
    const { data: existingRows, error: existingError } = await supabase
      .from('illustration_tasks')
      .select('task_key, asset_id')
      .eq('script_id', scriptId);

    if (existingError) {
      if (isMissingTableError(existingError)) return;
      throw new Error(`读取插画任务失败: ${existingError.message}`);
    }

    const existingByKey = new Map(
      ((existingRows ?? []) as Array<{ task_key: string; asset_id: string | null }>).map((row) => [
        row.task_key,
        row.asset_id,
      ]),
    );
    const now = new Date().toISOString();
    const pairs = specs.map((spec) => ({
      spec,
      assetId: existingByKey.get(spec.taskKey) ?? crypto.randomUUID(),
    }));

    const assetRows = pairs.map(({ spec, assetId }) => ({
      id: assetId,
      script_id: scriptId,
      type: spec.taskType,
      title: spec.title,
      sub: spec.subtitle || '待生成',
      status: 'pending',
      thumb: '',
      progress: 0,
      locked: false,
      sort_order: spec.sortOrder,
      source_type: 'task',
      source_id: assetId,
      updated_at: now,
    }));

    const { error: assetError } = await supabase
      .from('illustration_assets')
      .upsert(assetRows, { onConflict: 'id' });
    if (assetError) {
      if (isMissingTableError(assetError)) return;
      throw new Error(`创建插画资源失败: ${assetError.message}`);
    }

    const taskRows = pairs.map(({ spec, assetId }) => ({
      script_id: scriptId,
      style_profile_id: styleProfileId,
      asset_id: assetId,
      market_item_id: spec.marketItemId ?? null,
      task_key: spec.taskKey,
      task_type: spec.taskType,
      source_type: spec.sourceType,
      source_id: spec.sourceId,
      title: spec.title,
      subtitle: spec.subtitle,
      prompt: spec.prompt,
      status: 'pending',
      progress_percent: 0,
      sort_order: spec.sortOrder,
      selected_model: 'openai',
      selected_ratio: '16:9',
      selected_count: 1,
      result_image_url: '',
      error_message: '',
      started_at: null,
      completed_at: null,
      updated_at: now,
    }));

    const { error: taskError } = await supabase
      .from('illustration_tasks')
      .upsert(taskRows, { onConflict: 'script_id,task_key' });
    if (taskError) {
      if (isMissingTableError(taskError)) return;
      throw new Error(`创建插画任务失败: ${taskError.message}`);
    }
  }

  private async upsertSingleTaskAndAsset(
    supabase: SupabaseClient,
    scriptId: string,
    styleProfileId: string,
    spec: TaskSpec,
  ): Promise<{ taskRow: TaskRow; assetRow: AssetRow }> {
    const existingTask = await this.getTaskByKey(supabase, scriptId, spec.taskKey);
    const assetId = existingTask?.asset_id ?? crypto.randomUUID();
    const assetPayload = {
      id: assetId,
      script_id: scriptId,
      type: spec.taskType,
      title: spec.title,
      sub: spec.subtitle || '待生成',
      status: 'pending',
      thumb: '',
      progress: 0,
      locked: false,
      sort_order: spec.sortOrder,
      source_type: 'task',
      source_id: assetId,
    };

    const { data: assetData, error: assetError } = await supabase
      .from('illustration_assets')
      .upsert(assetPayload, { onConflict: 'id' })
      .select('*')
      .single();
    if (assetError) throw new Error(`创建插画资源失败: ${assetError.message}`);

    const taskPayload = {
      script_id: scriptId,
      style_profile_id: styleProfileId,
      asset_id: assetData.id,
      market_item_id: spec.marketItemId ?? null,
      task_key: spec.taskKey,
      task_type: spec.taskType,
      source_type: spec.sourceType,
      source_id: spec.sourceId,
      title: spec.title,
      subtitle: spec.subtitle,
      prompt: spec.prompt,
      status: 'pending',
      progress_percent: 0,
      sort_order: spec.sortOrder,
      selected_model: 'openai',
      selected_ratio: '16:9',
      selected_count: 1,
      result_image_url: '',
      error_message: '',
      started_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data: taskData, error: taskError } = await supabase
      .from('illustration_tasks')
      .upsert(taskPayload, { onConflict: 'script_id,task_key' })
      .select('*')
      .single();
    if (taskError) throw new Error(`创建插画任务失败: ${taskError.message}`);

    return {
      taskRow: taskData as unknown as TaskRow,
      assetRow: assetData as unknown as AssetRow,
    };
  }

  private async updateTask(
    supabase: SupabaseClient,
    taskId: string,
    patch: Partial<TaskRow>,
  ): Promise<TaskRow> {
    const { data, error } = await supabase
      .from('illustration_tasks')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', taskId)
      .select('*')
      .single();
    if (error) throw new Error(`更新插画任务失败: ${error.message}`);
    return data as unknown as TaskRow;
  }

  private mapStyleRow(row: StyleProfileRow): IllustrationStyleProfile {
    return {
      id: row.id,
      scriptId: row.script_id,
      styleName: row.style_name,
      visualTone: row.visual_tone,
      masterPrompt: row.master_prompt,
      referenceNotes: row.reference_notes,
      marketItemId: row.market_item_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapMarketRow(row: MarketRow): IllustrationMarketItem {
    return {
      id: row.id,
      title: row.title,
      taskType: row.task_type,
      subtitle: row.subtitle,
      promptHint: row.prompt_hint,
      visualTone: row.visual_tone,
      thumbUrl: row.thumb_url,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAssetFallbackTask(
    row: AssetRow,
    styleProfile: IllustrationStyleProfile,
    index: number,
  ): IllustrationTaskView {
    const taskStatus =
      row.status === 'done' ? 'completed' : row.status === 'active' ? 'running' : 'pending';
    return {
      id: row.id,
      scriptId: row.script_id,
      styleProfileId: styleProfile.id,
      assetId: row.id,
      marketItemId: null,
      taskKey: row.source_id || row.id,
      taskType: row.type,
      sourceType: row.source_type || 'asset',
      sourceId: row.source_id || row.id,
      title: row.title,
      subtitle: row.sub,
      prompt: `${row.title}；${styleProfile.masterPrompt}`,
      status: taskStatus,
      progressPercent: row.progress ?? (row.status === 'done' ? 100 : 0),
      sortOrder: index,
      selectedModel: 'openai',
      selectedRatio: '16:9',
      selectedCount: 1,
      resultImageUrl: row.thumb,
      errorMessage: '',
      startedAt: null,
      completedAt: row.status === 'done' ? row.updated_at : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      thumb: row.thumb,
      sourceLabel: row.source_type || 'asset',
      assetStatus: row.status,
      taskPromptSeed: `${row.title}；${styleProfile.visualTone}`,
    };
  }

  private mapTaskRow(row: TaskRow, asset: AssetRow | null): IllustrationTaskView {
    return {
      id: row.id,
      scriptId: row.script_id,
      styleProfileId: row.style_profile_id,
      assetId: row.asset_id,
      marketItemId: row.market_item_id,
      taskKey: row.task_key,
      taskType: row.task_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      subtitle: row.subtitle,
      prompt: row.prompt,
      status: row.status,
      progressPercent: row.progress_percent,
      sortOrder: row.sort_order,
      selectedModel: row.selected_model,
      selectedRatio: row.selected_ratio,
      selectedCount: row.selected_count,
      resultImageUrl: row.result_image_url,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      thumb: asset?.thumb || row.result_image_url || '',
      sourceLabel: row.source_type || 'task',
      assetStatus: asset?.status ?? (row.status === 'completed' ? 'done' : row.status === 'running' ? 'active' : 'pending'),
      taskPromptSeed: row.prompt,
    };
  }
}

export const illustrationWorkflowService = new IllustrationWorkflowService();
