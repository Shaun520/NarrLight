import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scriptDraftImportService } from '@/lib/services/script-draft-import-service';
import type { ScriptDifficulty, ScriptGenre } from '@/types';

const VALID_GENRES: ScriptGenre[] = ['hardcore', 'emotion', 'horror', 'funny', 'mechanism'];
const VALID_DIFFICULTIES: ScriptDifficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];

interface ImportRequestBody {
  title?: unknown;
  genre?: unknown;
  playerCount?: unknown;
  durationHours?: unknown;
  difficulty?: unknown;
  backgroundSetting?: unknown;
  coreTheme?: unknown;
  sourceText?: unknown;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: '请先登录后再导入设计稿' }, { status: 401 });
  }

  const genre =
    typeof body.genre === 'string' && VALID_GENRES.includes(body.genre as ScriptGenre)
      ? (body.genre as ScriptGenre)
      : 'hardcore';
  const difficulty =
    typeof body.difficulty === 'string' && VALID_DIFFICULTIES.includes(body.difficulty as ScriptDifficulty)
      ? (body.difficulty as ScriptDifficulty)
      : 'intermediate';

  try {
    const result = await scriptDraftImportService.importDraft({
      authorId: user.id,
      title: typeof body.title === 'string' ? body.title : '',
      genre,
      playerCount: toNumber(body.playerCount, 6),
      durationHours: toNumber(body.durationHours, 4),
      difficulty,
      backgroundSetting: typeof body.backgroundSetting === 'string' ? body.backgroundSetting : '',
      coreTheme: typeof body.coreTheme === 'string' ? body.coreTheme : '',
      sourceText: typeof body.sourceText === 'string' ? body.sourceText : '',
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
