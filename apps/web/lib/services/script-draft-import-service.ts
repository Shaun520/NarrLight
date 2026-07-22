import { createClient } from '@/lib/supabase/server';
import type { ScriptDifficulty, ScriptGenre } from '@/types';

export interface DraftImportInput {
  authorId: string;
  title: string;
  genre: ScriptGenre;
  playerCount: number;
  durationHours: number;
  difficulty: ScriptDifficulty;
  backgroundSetting: string;
  coreTheme: string;
  sourceText: string;
}

export interface DraftImportResult {
  scriptId: string;
  sceneCount: number;
  wordCount: number;
}

const MAX_SOURCE_LENGTH = 120_000;
const MAX_SCENES = 24;

function countWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function buildSceneChunks(sourceText: string): Array<{ title: string; content: string }> {
  const blocks = normalizeText(sourceText)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks = (blocks.length ? blocks : [sourceText]).slice(0, MAX_SCENES);
  return chunks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0] ?? '';
    const looksLikeHeading = firstLine.length <= 32 && lines.length > 1;
    return {
      title: looksLikeHeading ? firstLine : `导入片段 ${index + 1}`,
      content: block,
    };
  });
}

function validateInput(input: DraftImportInput): string | null {
  if (!input.title.trim()) return '请填写剧本标题';
  if (input.title.trim().length > 80) return '剧本标题不能超过 80 个字';
  if (!input.sourceText.trim()) return '请粘贴需要导入的设计稿内容';
  if (input.sourceText.length > MAX_SOURCE_LENGTH) return '导入文本过长，请先拆分后再导入';
  if (!Number.isFinite(input.playerCount) || input.playerCount < 1 || input.playerCount > 12) {
    return '玩家人数需在 1-12 人之间';
  }
  if (!Number.isFinite(input.durationHours) || input.durationHours < 1 || input.durationHours > 12) {
    return '预计时长需在 1-12 小时之间';
  }
  return null;
}

export class ScriptDraftImportService {
  async importDraft(input: DraftImportInput): Promise<DraftImportResult> {
    const validationError = validateInput(input);
    if (validationError) throw new Error(validationError);

    const supabase = await createClient();
    const scriptId = crypto.randomUUID();
    const actId = crypto.randomUUID();
    const sourceText = normalizeText(input.sourceText);
    const wordCount = countWords(sourceText);
    const scenes = buildSceneChunks(sourceText);
    const now = new Date().toISOString();

    const { error: scriptError } = await supabase.from('scripts').insert({
      id: scriptId,
      author_id: input.authorId,
      title: input.title.trim(),
      description: '由已有设计稿导入生成的可编辑草稿',
      genre: input.genre,
      player_count: Math.floor(input.playerCount),
      duration_hours: Math.floor(input.durationHours),
      difficulty: input.difficulty === 'expert' ? 'advanced' : input.difficulty,
      background_setting: input.backgroundSetting.trim(),
      core_theme: input.coreTheme.trim(),
      status: 'draft',
      word_count: wordCount,
      created_at: now,
      updated_at: now,
    });
    if (scriptError) throw new Error(`创建导入剧本失败：${scriptError.message}`);

    const { error: actError } = await supabase.from('acts').insert({
      id: actId,
      script_id: scriptId,
      title: '导入原稿',
      sort_order: 1,
      content: '系统保留原始设计稿为可编辑草稿，后续可在编辑器中继续拆分、补齐人物、线索和真相复盘。',
      created_at: now,
    });
    if (actError) throw new Error(`写入导入幕失败：${actError.message}`);

    const { error: sceneError } = await supabase.from('scenes').insert(
      scenes.map((scene, index) => ({
        id: crypto.randomUUID(),
        act_id: actId,
        title: scene.title,
        location: '',
        content: scene.content,
        sort_order: index + 1,
        created_at: now,
      })),
    );
    if (sceneError) throw new Error(`写入导入片段失败：${sceneError.message}`);

    return {
      scriptId,
      sceneCount: scenes.length,
      wordCount,
    };
  }
}

export const scriptDraftImportService = new ScriptDraftImportService();
