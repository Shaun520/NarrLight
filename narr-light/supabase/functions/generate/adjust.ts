/**
 * 局部调整 Edge Function - 6 种调整类型（T204）
 *
 * 支持的调整类型：
 *   - CHARACTER_ADJUST  角色调整
 *   - CLUE_MODIFY       线索修改
 *   - TRICK_REPLACE     诡计替换
 *   - STYLE_CHANGE      风格转换
 *   - COMPRESS          压缩
 *   - COMPLIANCE        合规整改
 *
 * 接收 POST 请求，参数为：
 *   {
 *     scriptId: string;
 *     taskType: 'CHARACTER_ADJUST' | 'CLUE_MODIFY' | 'TRICK_REPLACE' |
 *               'STYLE_CHANGE' | 'COMPRESS' | 'COMPLIANCE';
 *     targetId: string;   // 目标实体 ID（角色/线索/诡计等）
 *     instruction: string;  // 调整指令（TRICK_REPLACE 时为新诡计描述）
 *     options?: Record<string, unknown>;  // 额外参数（targetStyle / targetWords）
 *   }
 *
 * 流程：
 *   1. 根据 taskType 调用对应的 Prompt 构建器（lib/ai/prompts/script-adjust.ts）
 *   2. 调用 DeepSeekProvider.generateStream 流式生成
 *   3. 通过 SSE 推送调整进度和结果
 *   4. 调整完成后更新对应表（characters/clues/acts/scenes 等）
 *   5. 创建版本快照（VersionService）
 *   6. 返回 completed 事件
 *
 * 部署说明：本文件为 Supabase Edge Function，运行于 Deno 运行时。
 * 此处通过 `@/` 别名引用项目内模块以保证 TypeScript 类型检查一致；
 * 实际部署到 Deno Deploy 时，需将 service 层的 supabase 客户端
 * 由 @/lib/supabase/server（依赖 next/headers）替换为直接使用
 * @supabase/supabase-js 创建的匿名/服务端客户端。
 */
import { DeepSeekProvider, parseJSONWithTolerance } from '@/lib/ai/providers/deepseek-provider';
import {
  buildCharacterAdjustPrompt,
  buildClueModifyPrompt,
  buildTrickReplacePrompt,
  buildStyleChangePrompt,
  buildCompressPrompt,
  buildCompliancePrompt,
  type AdjustPromptResult,
} from '@/lib/ai/prompts/script-adjust';
import { VersionService } from '@/lib/services/version-service';
import type { OperationType } from '@/types';

/** 支持的调整类型 */
type AdjustTaskType =
  | 'CHARACTER_ADJUST'
  | 'CLUE_MODIFY'
  | 'TRICK_REPLACE'
  | 'STYLE_CHANGE'
  | 'COMPRESS'
  | 'COMPLIANCE';

/** 入参体 */
interface AdjustRequestBody {
  scriptId: string;
  taskType: AdjustTaskType;
  targetId: string;
  instruction: string;
  options?: Record<string, unknown>;
}

/** 合法写作风格（与 WritingStyle 对齐） */
const VALID_STYLES = ['古风沉稳', '白描清雅', '悬疑冷峻', '诙谐明快'] as const;
type WritingStyle = (typeof VALID_STYLES)[number];

/** 合法 taskType 列表 */
const VALID_TASK_TYPES: readonly AdjustTaskType[] = [
  'CHARACTER_ADJUST',
  'CLUE_MODIFY',
  'TRICK_REPLACE',
  'STYLE_CHANGE',
  'COMPRESS',
  'COMPLIANCE',
];

/** taskType → 版本快照 OperationType 映射 */
const TASK_TO_OPERATION: Record<AdjustTaskType, OperationType> = {
  CHARACTER_ADJUST: 'EDIT_CHARACTER',
  CLUE_MODIFY: 'EDIT_CLUE',
  TRICK_REPLACE: 'REPLACE_TRICK',
  STYLE_CHANGE: 'STYLE_CHANGE',
  COMPRESS: 'COMPRESS',
  COMPLIANCE: 'COMPLIANCE_ADJUST',
};

/** SSE 单条事件编码 */
function encodeSse(
  encoder: TextEncoder,
  event: string,
  data: unknown,
): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return encoder.encode(payload);
}

/** 校验入参 */
function validateBody(body: unknown): body is AdjustRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.scriptId !== 'string' || !b.scriptId) return false;
  if (typeof b.targetId !== 'string' || !b.targetId) return false;
  if (typeof b.instruction !== 'string' || !b.instruction) return false;
  if (!VALID_TASK_TYPES.includes(b.taskType as AdjustTaskType)) return false;
  if (
    b.options !== undefined &&
    (typeof b.options !== 'object' || b.options === null || Array.isArray(b.options))
  ) {
    return false;
  }
  return true;
}

/**
 * 根据 taskType 调用对应的 Prompt 构建器。
 * STYLE_CHANGE 需从 options.targetStyle 读取目标风格；
 * COMPRESS 需从 options.targetWords 读取目标字数。
 */
function buildPromptForTask(body: AdjustRequestBody): AdjustPromptResult {
  const { taskType, targetId, instruction, options } = body;
  switch (taskType) {
    case 'CHARACTER_ADJUST':
      return buildCharacterAdjustPrompt(targetId, instruction);
    case 'CLUE_MODIFY':
      return buildClueModifyPrompt(targetId, instruction);
    case 'TRICK_REPLACE':
      // instruction 即为新诡计描述
      return buildTrickReplacePrompt(targetId, instruction);
    case 'STYLE_CHANGE': {
      const style = options?.targetStyle;
      if (
        typeof style !== 'string' ||
        !VALID_STYLES.includes(style as WritingStyle)
      ) {
        throw new Error(
          `options.targetStyle 必须为有效写作风格：${VALID_STYLES.join('/')}`,
        );
      }
      return buildStyleChangePrompt(body.scriptId, style as WritingStyle);
    }
    case 'COMPRESS': {
      const words = options?.targetWords;
      if (typeof words !== 'number' || !Number.isFinite(words) || words <= 0) {
        throw new Error('options.targetWords 必须为正数');
      }
      return buildCompressPrompt(body.scriptId, Math.floor(words));
    }
    case 'COMPLIANCE':
      return buildCompliancePrompt(body.scriptId);
  }
}

/**
 * 应用调整结果到数据库（best-effort，失败收集到 errors 不中断流程）。
 * - CHARACTER_ADJUST：更新 characters.background_story
 * - CLUE_MODIFY：更新 clues.content / is_distractor / is_key_clue
 * - TRICK_REPLACE：按 updatedClues 批量更新 clues.content
 * - STYLE_CHANGE / COMPRESS / COMPLIANCE：按 nodeId 更新 acts/scenes.content
 */
async function applyAdjustment(
  body: AdjustRequestBody,
  parsed: Record<string, unknown>,
  errors: string[],
): Promise<void> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { taskType, targetId } = body;

  if (taskType === 'CHARACTER_ADJUST') {
    const backgroundStory = parsed.backgroundStory;
    if (typeof backgroundStory === 'string') {
      const { error } = await supabase
        .from('characters')
        .update({ background_story: backgroundStory })
        .eq('id', targetId);
      if (error) errors.push(`更新人物失败: ${error.message}`);
    }
    return;
  }

  if (taskType === 'CLUE_MODIFY') {
    const update: Record<string, unknown> = {};
    if (typeof parsed.content === 'string') update.content = parsed.content;
    if (typeof parsed.isDistractor === 'boolean')
      update.is_distractor = parsed.isDistractor;
    if (typeof parsed.isKeyClue === 'boolean')
      update.is_key_clue = parsed.isKeyClue;
    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('clues')
        .update(update)
        .eq('id', targetId);
      if (error) errors.push(`更新线索失败: ${error.message}`);
    }
    return;
  }

  if (taskType === 'TRICK_REPLACE') {
    const updatedClues = parsed.updatedClues;
    if (Array.isArray(updatedClues)) {
      for (const c of updatedClues) {
        const clue = c as Record<string, unknown>;
        const clueId = clue.clueId;
        const content = clue.content;
        if (typeof clueId === 'string' && typeof content === 'string') {
          const { error } = await supabase
            .from('clues')
            .update({ content })
            .eq('id', clueId);
          if (error) errors.push(`更新线索 ${clueId} 失败: ${error.message}`);
        }
      }
    }
    return;
  }

  // STYLE_CHANGE / COMPRESS / COMPLIANCE：按 nodeId 更新 acts/scenes 内容
  const sectionsField =
    taskType === 'STYLE_CHANGE'
      ? 'rewrittenSections'
      : taskType === 'COMPRESS'
        ? 'compressedSections'
        : 'adjustedSections';
  const sections = parsed[sectionsField];
  if (!Array.isArray(sections)) return;
  for (const s of sections) {
    const section = s as Record<string, unknown>;
    const nodeId = section.nodeId;
    // COMPLIANCE 的内容字段为 adjusted，其余为 content
    const content = taskType === 'COMPLIANCE' ? section.adjusted : section.content;
    if (typeof nodeId !== 'string' || typeof content !== 'string') continue;
    // UUID 跨表唯一，先尝试 acts 再尝试 scenes，未命中不会报错
    const { error: actErr } = await supabase
      .from('acts')
      .update({ content })
      .eq('id', nodeId);
    if (actErr) errors.push(`更新幕次 ${nodeId} 失败: ${actErr.message}`);
    const { error: sceneErr } = await supabase
      .from('scenes')
      .update({ content })
      .eq('id', nodeId);
    if (sceneErr) errors.push(`更新场景 ${nodeId} 失败: ${sceneErr.message}`);
  }
}

/** 主处理函数 */
async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!validateBody(body)) {
    return new Response(
      JSON.stringify({ error: 'Invalid parameters: scriptId / taskType / targetId / instruction 必填' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let prompt: AdjustPromptResult;
  try {
    prompt = buildPromptForTask(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid options';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { scriptId, taskType } = body;
  const provider = new DeepSeekProvider();
  const versionService = new VersionService();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = '';

      try {
        controller.enqueue(
          encodeSse(encoder, 'start', { scriptId, taskType, stage: 'init' }),
        );

        // 1 + 2. 流式生成并推送 chunk / progress
        for await (const chunk of provider.generateStream({
          prompt: prompt.userPrompt,
          systemPrompt: prompt.systemPrompt,
          temperature: 0.7,
          onChunk: (c) => {
            accumulated += c;
          },
        })) {
          if (chunk.content) {
            controller.enqueue(
              encodeSse(encoder, 'chunk', { content: chunk.content }),
            );
          }
          if (typeof chunk.progress === 'number') {
            controller.enqueue(
              encodeSse(encoder, 'progress', {
                percent: Math.round(chunk.progress * 100),
              }),
            );
          }
          if (chunk.done) break;
        }

        // 3. 解析 JSON 结果
        controller.enqueue(
          encodeSse(encoder, 'progress', { percent: 100, stage: 'parsing' }),
        );
        const rawParsed = parseJSONWithTolerance<unknown>(accumulated);
        const parsed: Record<string, unknown> =
          rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)
            ? (rawParsed as Record<string, unknown>)
            : {};

        // 4. 更新对应表（best-effort，失败不中断）
        const dbErrors: string[] = [];
        try {
          await applyAdjustment(body, parsed, dbErrors);
        } catch (err) {
          dbErrors.push(err instanceof Error ? err.message : '数据库更新失败');
        }

        // 5. 创建版本快照（best-effort）
        let snapshotVersion: number | null = null;
        try {
          const snapshot = await versionService.createSnapshot(
            scriptId,
            `${taskType} 局部调整`,
            TASK_TO_OPERATION[taskType],
            {
              result: parsed,
              targetId: body.targetId,
              instruction: body.instruction,
            },
          );
          snapshotVersion = snapshot.versionNumber;
        } catch (err) {
          dbErrors.push(
            `版本快照创建失败: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        }

        // 6. 返回 completed 事件
        controller.enqueue(
          encodeSse(encoder, 'completed', {
            scriptId,
            taskType,
            result: parsed,
            snapshotVersion,
            warnings: dbErrors.length > 0 ? dbErrors : undefined,
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encodeSse(encoder, 'error', { message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// @ts-expect-error - Deno 全局仅在 Supabase Edge Function (Deno) 运行时可用
Deno.serve(handleRequest);

export type { AdjustRequestBody, AdjustTaskType };
