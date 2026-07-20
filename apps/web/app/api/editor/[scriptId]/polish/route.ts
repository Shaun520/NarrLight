import { NextResponse } from 'next/server';
import { DeepSeekProvider } from '@/lib/ai/providers/deepseek-provider';

interface PolishRequestBody {
  sourceText?: string;
  mode?: string;
  instruction?: string;
  nodeTitle?: string;
}

const MODE_HINTS: Record<string, string> = {
  润色文采: '增强文字质感、画面感和叙事流畅度。',
  增强悬疑: '增强不安感、伏笔感和误导性，但不要新增关键事实。',
  补充细节: '补充可感知的动作、环境和心理细节，但不要改变剧情事实。',
  调整节奏: '删去冗余表达，让句子更紧凑，推进更清晰。',
  统一风格: '统一为当前剧本的悬疑、冷峻、克制文风。',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  await params;

  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: 'AI 润色暂未配置模型密钥，无法生成真实建议' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as PolishRequestBody;
  const sourceText = String(body.sourceText ?? '').trim();
  const mode = String(body.mode ?? '润色文采').trim();
  const instruction = String(body.instruction ?? '').trim();
  const nodeTitle = String(body.nodeTitle ?? '').trim();

  if (!sourceText) {
    return NextResponse.json({ error: '缺少需要润色的原文' }, { status: 400 });
  }
  if (sourceText.length > 4000) {
    return NextResponse.json({ error: '单次润色文本过长，请缩小选区后重试' }, { status: 413 });
  }

  try {
    const provider = new DeepSeekProvider();
    const suggestion = await provider.generate({
      systemPrompt: [
        '你是一名剧本杀文本编辑，擅长悬疑叙事、人物视角和线索伏笔表达。',
        '你只能润色用户给出的片段，不得新增事实、改变凶手、改变线索结论、改变时间线。',
        '保留原文视角、人称、核心信息和剧情含义。',
        '只返回润色后的正文，不要解释，不要 markdown，不要标题。',
      ].join('\n'),
      prompt: [
        `所在模块：${nodeTitle || '剧本编辑器正文'}`,
        `润色模式：${mode}`,
        `模式要求：${MODE_HINTS[mode] ?? mode}`,
        instruction ? `补充要求：${instruction}` : '',
        '原文：',
        sourceText,
      ]
        .filter(Boolean)
        .join('\n\n'),
      temperature: 0.65,
      maxTokens: 1800,
    });

    const cleaned = suggestion.trim();
    if (!cleaned) {
      return NextResponse.json({ error: 'AI 未返回有效润色内容' }, { status: 502 });
    }

    return NextResponse.json({ suggestion: cleaned });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 润色生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
