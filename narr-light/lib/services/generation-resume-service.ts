/**
 * 生成任务中断续传服务
 *
 * 检测 status=running 但已超时的生成任务，并提供从中断处恢复的能力。
 * 依赖 generation_tasks 表与 GenerationTaskService 的状态机。
 */
import { createClient } from '@/lib/supabase/server';
import type { GenerationTask } from '@/types';
import type { Json } from '@/lib/supabase/types';

/** 运行中任务的超时阈值（毫秒），默认 10 分钟 */
const RUNNING_TIMEOUT_MS = 10 * 60 * 1000;

/** 可恢复状态 */
export interface ResumableState {
  taskId: string;
  scriptId: string;
  status: GenerationTask['status'];
  progressPercent: number;
  /** 已生成的中间内容（来自 result_data 或 params 缓存） */
  generatedContent: string;
  /** 是否可恢复 */
  resumable: boolean;
}

/** generation_tasks 原始行 */
interface TaskRow {
  id: string;
  script_id: string;
  task_type: GenerationTask['taskType'];
  status: GenerationTask['status'];
  params: Json;
  progress_percent: number;
  result_data: Json | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export class GenerationResumeService {
  /**
   * 检测未完成的生成任务：status=running 且 started_at 距今超过超时阈值。
   * @param scriptId 剧本 ID
   * @returns 超时的运行中任务列表（按 started_at 倒序）
   */
  async detectInterrupted(scriptId: string): Promise<GenerationTask[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('generation_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .eq('status', 'running')
      .order('started_at', { ascending: false });

    if (error) throw new Error(`检测中断任务失败: ${error.message}`);

    const rows = (data ?? []) as unknown as TaskRow[];
    const now = Date.now();
    const interrupted: GenerationTask[] = [];
    for (const row of rows) {
      if (!row.started_at) continue;
      const started = new Date(row.started_at).getTime();
      if (Number.isNaN(started)) continue;
      if (now - started > RUNNING_TIMEOUT_MS) {
        interrupted.push(this.mapRow(row));
      }
    }
    return interrupted;
  }

  /**
   * 从中断处继续生成。
   * 1. 读取任务当前状态与已生成内容；
   * 2. 将状态重置为 pending（等待生成器重新拉起并基于已有内容续写）；
   * 3. 实际续写由调用方（Edge Function / Route Handler）触发，此处仅恢复状态。
   * @param taskId 任务 ID
   */
  async resumeGeneration(taskId: string): Promise<GenerationTask> {
    const supabase = await createClient();

    const { data: current, error: curErr } = await supabase
      .from('generation_tasks')
      .select('status')
      .eq('id', taskId)
      .maybeSingle();
    if (curErr) throw new Error(`获取任务状态失败: ${curErr.message}`);
    if (!current) throw new Error(`任务 ${taskId} 不存在`);

    const from = (current as { status: GenerationTask['status'] }).status;
    if (from !== 'running' && from !== 'failed') {
      throw new Error(`任务 ${taskId} 状态为 ${from}，无需续传`);
    }

    const { data, error } = await supabase
      .from('generation_tasks')
      .update({
        status: 'pending',
        error_message: null,
        started_at: null,
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw new Error(`恢复任务失败: ${error.message}`);
    return this.mapRow(data as unknown as TaskRow);
  }

  /**
   * 获取可恢复状态：已生成内容、进度。
   * @param taskId 任务 ID
   */
  async getResumableState(taskId: string): Promise<ResumableState> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('generation_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (error) throw new Error(`获取任务失败: ${error.message}`);
    if (!data) throw new Error(`任务 ${taskId} 不存在`);

    const row = data as unknown as TaskRow;
    const resultData = (row.result_data ?? {}) as Record<string, unknown>;
    const generatedContent =
      typeof resultData.generatedContent === 'string' ? resultData.generatedContent : '';

    return {
      taskId: row.id,
      scriptId: row.script_id,
      status: row.status,
      progressPercent: row.progress_percent,
      generatedContent,
      resumable: row.status === 'running' || row.status === 'failed',
    };
  }

  /** 将数据库行映射为 GenerationTask */
  private mapRow(row: TaskRow): GenerationTask {
    return {
      id: row.id,
      scriptId: row.script_id,
      taskType: row.task_type,
      status: row.status,
      params: row.params,
      progressPercent: row.progress_percent,
      resultData: row.result_data,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    };
  }
}
