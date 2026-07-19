import { NextResponse } from 'next/server';
import { illustrationWorkflowService } from '@/lib/services/illustration-workflow-service';

interface RunIllustrationTaskBody {
  prompt?: string;
  model?: string;
  ratio?: string;
  count?: number;
}

function normalizeBody(body: unknown): RunIllustrationTaskBody {
  if (!body || typeof body !== 'object') return {};
  const source = body as Record<string, unknown>;
  return {
    prompt: typeof source.prompt === 'string' ? source.prompt : undefined,
    model: typeof source.model === 'string' ? source.model : undefined,
    ratio: typeof source.ratio === 'string' ? source.ratio : undefined,
    count: typeof source.count === 'number' ? source.count : undefined,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await illustrationWorkflowService.runTask(taskId, {
      ...normalizeBody(body),
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isAbortError(error)) {
      return NextResponse.json({ error: '生成已停止' }, { status: 499 });
    }
    const message = error instanceof Error ? error.message : '生成失败，请重试';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
