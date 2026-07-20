/**
 * AI 生成任务状态机与进度管理
 *
 * 管理 generation_tasks 表的完整生命周期：
 *   pending → running → completed / failed / cancelled
 *
 * - server 端方法通过动态导入 @/lib/supabase/server 获取客户端，避免
 *   next/headers 被打包进客户端 bundle；
 * - subscribeTaskProgress 为客户端方法，使用 Supabase Realtime 订阅任务进度。
 *
 * 状态转换合法性由 assertTransition 校验。
 */
import type { SupabaseClient, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/types';
import type { GenerationTask, TaskStatus, TaskType } from '@/types';

interface TaskRow {
  id: string;
  script_id: string;
  task_type: TaskType;
  status: TaskStatus;
  params: Json;
  progress_percent: number;
  result_data: Json | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** 合法的状态转换映射 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/** update + select + single 的返回结构（结构化子集） */
interface UpdateResult {
  data: unknown;
  error: { message: string } | null;
}

export class GenerationTaskService {
  /**
   * 创建 pending 任务
   * @param scriptId  剧本 ID
   * @param taskType  任务类型
   * @param params    任务输入参数
   */
  async createTask(scriptId: string, taskType: TaskType, params: Json): Promise<GenerationTask> {
    const supabase = await this.getServerClient();
    const id = crypto.randomUUID();

    const { data, error } = await supabase
      .from('generation_tasks')
      .insert({
        id,
        script_id: scriptId,
        task_type: taskType,
        status: 'pending',
        params: params as unknown as Json,
        progress_percent: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`创建生成任务失败: ${error.message}`);
    return this.mapRow(data as unknown as TaskRow);
  }

  /** 状态 pending → running，设置 startedAt */
  async startTask(taskId: string): Promise<GenerationTask> {
    return this.transition(taskId, 'running', async (supabase) => {
      const res = await supabase
        .from('generation_tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .single();
      return { data: res.data, error: res.error };
    });
  }

  /** 更新 progress_percent（限制在 0-100） */
  async updateProgress(taskId: string, progress: number): Promise<void> {
    const supabase = await this.getServerClient();
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    const { error } = await supabase
      .from('generation_tasks')
      .update({ progress_percent: clamped })
      .eq('id', taskId);
    if (error) throw new Error(`更新进度失败: ${error.message}`);
  }

  /** 状态 running → completed，设置 completedAt，写入结果数据 */
  async completeTask(taskId: string, resultData: Json): Promise<GenerationTask> {
    return this.transition(taskId, 'completed', async (supabase) => {
      const res = await supabase
        .from('generation_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_data: resultData as unknown as Json,
          progress_percent: 100,
        })
        .eq('id', taskId)
        .select()
        .single();
      return { data: res.data, error: res.error };
    });
  }

  /** 状态 running → failed，记录错误信息 */
  async failTask(taskId: string, errorMessage: string): Promise<GenerationTask> {
    return this.transition(taskId, 'failed', async (supabase) => {
      const res = await supabase
        .from('generation_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('id', taskId)
        .select()
        .single();
      return { data: res.data, error: res.error };
    });
  }

  /** 状态 pending/running → cancelled */
  async cancelTask(taskId: string): Promise<GenerationTask> {
    return this.transition(taskId, 'cancelled', async (supabase) => {
      const res = await supabase
        .from('generation_tasks')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();
      return { data: res.data, error: res.error };
    });
  }

  /** 获取任务详情 */
  async getTask(taskId: string): Promise<GenerationTask | null> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from('generation_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();
    if (error) throw new Error(`获取任务失败: ${error.message}`);
    return data ? this.mapRow(data as unknown as TaskRow) : null;
  }

  /** 获取剧本的所有任务（按创建时间倒序） */
  async getTasksByScript(scriptId: string): Promise<GenerationTask[]> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from('generation_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`获取任务列表失败: ${error.message}`);
    return (data ?? []).map((row) => this.mapRow(row as unknown as TaskRow));
  }

  /** 获取当前运行中的任务（用于中断续传） */
  async getRunningTask(scriptId: string): Promise<GenerationTask | null> {
    const supabase = await this.getServerClient();
    const { data, error } = await supabase
      .from('generation_tasks')
      .select('*')
      .eq('script_id', scriptId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`获取运行中任务失败: ${error.message}`);
    return data ? this.mapRow(data as unknown as TaskRow) : null;
  }

  /**
   * 订阅任务进度（客户端方法，使用 Supabase Realtime）
   * @returns 取消订阅函数
   */
  subscribeTaskProgress(taskId: string, callback: (task: GenerationTask) => void): () => void {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`generation_task:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload: RealtimePostgresChangesPayload<TaskRow>) => {
          const row = payload.new as unknown as TaskRow;
          callback(this.mapRow(row));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /** 动态导入服务端 Supabase Client（避免 next/headers 进入客户端 bundle） */
  private async getServerClient(): Promise<SupabaseClient> {
    const { createClient } = await import('@/lib/supabase/server');
    return createClient();
  }

  /**
   * 通用状态转换流程：读取当前状态 → 校验合法性 → 执行更新
   */
  private async transition(
    taskId: string,
    target: TaskStatus,
    apply: (supabase: SupabaseClient) => Promise<UpdateResult>,
  ): Promise<GenerationTask> {
    const supabase = await this.getServerClient();

    const { data: current, error: curErr } = await supabase
      .from('generation_tasks')
      .select('status')
      .eq('id', taskId)
      .maybeSingle();
    if (curErr) throw new Error(`获取任务状态失败: ${curErr.message}`);
    if (!current) throw new Error(`任务 ${taskId} 不存在`);

    const from = (current as { status: TaskStatus }).status;
    this.assertTransition(from, target);

    const { data, error } = await apply(supabase);
    if (error) throw new Error(`状态转换失败 (${from} → ${target}): ${error.message}`);
    return this.mapRow(data as unknown as TaskRow);
  }

  /** 校验状态转换合法性 */
  private assertTransition(current: TaskStatus, target: TaskStatus): void {
    const allowed = ALLOWED_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(`非法状态转换: ${current} → ${target}`);
    }
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
