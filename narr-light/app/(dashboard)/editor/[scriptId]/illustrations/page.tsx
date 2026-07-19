'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Modal as AntModal, Progress } from 'antd';
import { Library, Play, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
  AssetList,
  ASSET_TYPE_TABS,
  countAssetsByType,
  type AssetFilter,
} from '@/components/illust/asset-list';
import { GalleryPanel, type GenerateConfig } from '@/components/illust/gallery-panel';
import { NewTaskDrawer, type NewTaskFormData } from '@/components/illust/new-task-drawer';
import {
  createCustomIllustrationTaskAction,
  createIllustrationTaskFromMarketAction,
  getIllustrationWorkspaceAction,
  type IllustrationAssetView,
  type IllustrationWorkspaceView,
} from './actions';
import './illustrations.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

type MarketItemView = IllustrationWorkspaceView['marketItems'][number];
type TaskView = IllustrationWorkspaceView['tasks'][number];

function normalizeAssetFilter(value: string | null): AssetFilter {
  if (
    value === 'cover' ||
    value === 'scene' ||
    value === 'clue' ||
    value === 'public' ||
    value === 'char' ||
    value === 'poster'
  ) {
    return value;
  }
  return 'all';
}

function taskToAsset(task: TaskView): IllustrationAssetView {
  return {
    id: task.id,
    type: task.taskType,
    title: task.title,
    sub: task.subtitle || (task.status === 'completed' ? '已生成' : '待生成'),
    status: task.assetStatus,
    thumb: task.thumb,
    progress: task.progressPercent,
    sourceType: task.sourceType,
    sourceId: task.sourceId,
    taskId: task.id,
    taskPrompt: task.prompt,
  };
}

function replaceTask(
  workspace: IllustrationWorkspaceView,
  task: TaskView,
): IllustrationWorkspaceView {
  return {
    ...workspace,
    tasks: workspace.tasks.map((item) => (item.id === task.id ? task : item)),
    assets: workspace.assets.map((item) => (item.id === task.id ? taskToAsset(task) : item)),
  };
}

function markTaskRunning(
  workspace: IllustrationWorkspaceView,
  taskId: string,
  progressPercent = 12,
): IllustrationWorkspaceView {
  const tasks = workspace.tasks.map((task) =>
    task.id === taskId
      ? { ...task, status: 'running' as const, assetStatus: 'active' as const, progressPercent }
      : task,
  );
  return {
    ...workspace,
    tasks,
    assets: tasks.map(taskToAsset),
  };
}

function markTaskCancelled(
  workspace: IllustrationWorkspaceView,
  taskId: string,
): IllustrationWorkspaceView {
  const tasks = workspace.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: 'cancelled' as const,
          assetStatus: 'pending' as const,
          progressPercent: 0,
          errorMessage: '生成已停止',
        }
      : task,
  );
  return {
    ...workspace,
    tasks,
    assets: tasks.map(taskToAsset),
  };
}

function updateTaskProgress(
  workspace: IllustrationWorkspaceView,
  taskId: string,
  progressPercent: number,
): IllustrationWorkspaceView {
  const tasks = workspace.tasks.map((task) =>
    task.id === taskId && task.status === 'running'
      ? {
          ...task,
          assetStatus: 'active' as const,
          progressPercent: Math.max(task.progressPercent, progressPercent),
        }
      : task,
  );
  return {
    ...workspace,
    tasks,
    assets: tasks.map(taskToAsset),
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export default function IllustrationsPage({ params }: PageProps) {
  const { scriptId } = use(params);
  const searchParams = useSearchParams();
  const sourceId = searchParams.get('source');
  const { message } = AntdApp.useApp();

  const [activeType, setActiveType] = useState<AssetFilter>(() =>
    normalizeAssetFilter(searchParams.get('type')),
  );
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [workspace, setWorkspace] = useState<IllustrationWorkspaceView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const generationControllersRef = useRef<Map<string, AbortController>>(new Map());
  const progressTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchPercent, setBatchPercent] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchMessage, setBatchMessage] = useState('');
  const [batchStatus, setBatchStatus] = useState<'running' | 'completed' | 'failed'>('running');

  const assets = useMemo(() => workspace?.assets ?? [], [workspace]);
  const tasks = useMemo(() => workspace?.tasks ?? [], [workspace]);
  const marketItems = useMemo(() => workspace?.marketItems ?? [], [workspace]);
  const { counts, total, done } = useMemo(() => countAssetsByType(assets), [assets]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedTask = tasks.find((task) => task.id === selectedAssetId);
  const visualTone = workspace?.styleProfile.visualTone;

  const loadWorkspace = useCallback(async () => {
    const data = await getIllustrationWorkspaceAction(scriptId);
    setWorkspace(data);
    const sourceMatch = sourceId
      ? data.assets.find((asset) => asset.sourceType === 'clue' && asset.sourceId === sourceId)
      : undefined;
    setSelectedAssetId((prev) => prev || sourceMatch?.id || data.assets[0]?.id || '');
  }, [scriptId, sourceId]);

  const stopProgressTicker = useCallback((taskId: string) => {
    const timer = progressTimersRef.current.get(taskId);
    if (timer) {
      clearInterval(timer);
      progressTimersRef.current.delete(taskId);
    }
  }, []);

  const startProgressTicker = useCallback(
    (taskId: string) => {
      stopProgressTicker(taskId);
      const timer = setInterval(() => {
        setWorkspace((prev) => {
          if (!prev) return prev;
          const task = prev.tasks.find((item) => item.id === taskId);
          if (!task || task.status !== 'running') return prev;
          const current = task.progressPercent || 12;
          const step = current < 45 ? 6 : current < 75 ? 4 : 2;
          return updateTaskProgress(prev, taskId, Math.min(92, current + step));
        });
      }, 900);
      progressTimersRef.current.set(taskId, timer);
    },
    [stopProgressTicker],
  );

  useEffect(() => {
    const controllers = generationControllersRef.current;
    const timers = progressTimersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      timers.forEach((timer) => clearInterval(timer));
      controllers.clear();
      timers.clear();
    };
  }, []);

  useEffect(() => {
    setActiveType(normalizeAssetFilter(searchParams.get('type')));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    loadWorkspace().catch((error) => {
      if (cancelled) return;
      console.error('Failed to load illustration workspace:', error);
      message.error('读取插画任务失败');
    });
    return () => {
      cancelled = true;
    };
  }, [loadWorkspace, message]);

  const runTask = async (taskId: string, config?: GenerateConfig): Promise<void> => {
    if (generationControllersRef.current.has(taskId)) {
      message.warning('该任务正在生成中，请稍候');
      return;
    }

    const controller = new AbortController();
    generationControllersRef.current.set(taskId, controller);
    setGeneratingIds((prev) => new Set(prev).add(taskId));
    setWorkspace((prev) => (prev ? markTaskRunning(prev, taskId) : prev));
    startProgressTicker(taskId);

    try {
      const response = await fetch(`/api/illustrations/tasks/${encodeURIComponent(taskId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: config?.prompt,
          model: config?.model,
          ratio: config?.ratio,
          count: config?.count,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || '生成失败，请重试');
      }

      const result = (await response.json()) as TaskView;
      setWorkspace((prev) => (prev ? replaceTask(prev, result) : prev));
      message.success(`任务「${result.title}」生成完成`);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        setWorkspace((prev) => (prev ? markTaskCancelled(prev, taskId) : prev));
        return;
      }
      console.error('Generate illustration task failed:', error);
      await loadWorkspace();
      message.error(error instanceof Error ? error.message : '生成失败，请重试');
    } finally {
      generationControllersRef.current.delete(taskId);
      stopProgressTicker(taskId);
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const stopTask = useCallback(
    (taskId: string) => {
      const controller = generationControllersRef.current.get(taskId);
      if (!controller) return;
      controller.abort();
      generationControllersRef.current.delete(taskId);
      stopProgressTicker(taskId);
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      setWorkspace((prev) => (prev ? markTaskCancelled(prev, taskId) : prev));
      message.info('已停止生成');
    },
    [message, stopProgressTicker],
  );

  const handleGenerate = (config: GenerateConfig) => {
    if (!selectedTask) {
      message.warning('请先在左侧选择一个插画任务');
      return;
    }
    void runTask(selectedTask.id, config);
  };

  const handleQuickGenerate = (asset: IllustrationAssetView) => {
    setSelectedAssetId(asset.id);
    void runTask(asset.id, {
      prompt: asset.taskPrompt ?? '',
      model: 'openai',
      ratio: '16:9',
      count: 1,
    });
  };

  const handleBatchExecute = async () => {
    const pendingTasks = tasks.filter((task) => task.status === 'pending' || task.status === 'failed');
    if (pendingTasks.length === 0) {
      message.info('当前没有待执行的插画任务');
      return;
    }

    setBatchTotal(pendingTasks.length);
    setBatchDone(0);
    setBatchPercent(0);
    setBatchStatus('running');
    setBatchMessage('开始批量执行插画任务');
    setBatchOpen(true);

    let failed = 0;
    for (let i = 0; i < pendingTasks.length; i += 1) {
      const task = pendingTasks[i];
      setBatchDone(i);
      setBatchPercent(Math.round((i / pendingTasks.length) * 100));
      setBatchMessage(`正在生成 ${i + 1}/${pendingTasks.length}：${task.title}`);
      try {
        await runTask(task.id, {
          prompt: task.prompt,
          model: task.selectedModel,
          ratio: task.selectedRatio,
          count: task.selectedCount,
        });
      } catch {
        failed += 1;
      }
    }

    setBatchDone(pendingTasks.length);
    setBatchPercent(100);
    setBatchStatus(failed > 0 ? 'failed' : 'completed');
    setBatchMessage(failed > 0 ? `批量执行完成，失败 ${failed} 项` : '批量执行完成');
    if (failed > 0) {
      message.warning(`批量执行完成，失败 ${failed} 项`);
    } else {
      message.success(`批量执行完成，共生成 ${pendingTasks.length} 项`);
    }
  };

  const handleCreateFromMarket = async (item: MarketItemView) => {
    try {
      const task = await createIllustrationTaskFromMarketAction(scriptId, item.id);
      setWorkspace((prev) => {
        if (!prev) return prev;
        const exists = prev.tasks.some((old) => old.id === task.id);
        const tasksNext = exists
          ? prev.tasks.map((old) => (old.id === task.id ? task : old))
          : [...prev.tasks, task].sort((a, b) => a.sortOrder - b.sortOrder);
        return {
          ...prev,
          tasks: tasksNext,
          assets: tasksNext.map(taskToAsset),
        };
      });
      setSelectedAssetId(task.id);
      setMarketOpen(false);
      message.success(`已加入任务：${task.title}`);
    } catch (error) {
      console.error('Create task from market failed:', error);
      message.error(error instanceof Error ? error.message : '创建市场任务失败');
    }
  };

  const handleTaskSubmit = async (data: NewTaskFormData) => {
    try {
      const task = await createCustomIllustrationTaskAction(scriptId, {
        title: data.taskName,
        taskType: data.type,
        prompt: data.prompt,
        sourceLabel: data.bindTarget,
        ratio: data.ratio,
        count: data.count,
      });
      setWorkspace((prev) => {
        if (!prev) return prev;
        const tasksNext = [...prev.tasks, task].sort((a, b) => a.sortOrder - b.sortOrder);
        return {
          ...prev,
          tasks: tasksNext,
          assets: tasksNext.map(taskToAsset),
        };
      });
      setSelectedAssetId(task.id);
      message.success(`已创建任务：${task.title}`);
    } catch (error) {
      console.error('Create custom illustration task failed:', error);
      message.error(error instanceof Error ? error.message : '创建任务失败');
    }
  };

  const handleAdopt = async () => {
    message.info('采纳状态已由任务完成结果自动记录');
  };

  const handleRegenerate = (assetId: string) => {
    void runTask(assetId, {
      prompt: tasks.find((task) => task.id === assetId)?.prompt ?? '',
      model: 'openai',
      ratio: '16:9',
      count: 1,
    });
  };

  const handleUpscale = async () => {
    message.info('高清放大能力尚未接入真实模型');
  };

  return (
    <div className="illust-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            插画生成 <span className="seal">{done} / {total}</span>
          </h1>
          <div className="page-desc">
            {workspace?.script.title ?? '当前剧本'} / 自动任务 / 统一风格 / 市场素材 / 批量执行
            <span className="page-desc-style">
              统一风格：{workspace?.styleProfile.styleName ?? '读取中'}
            </span>
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setMarketOpen(true)}>
            <Library size={15} />
            素材市场
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleBatchExecute}>
            <Play size={15} />
            批量执行
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDrawerOpen(true)}>
            <Sparkles size={15} />
            新建生成任务
          </button>
        </div>
      </div>

      <div className="illust-filter">
        <span className="if-label">类型</span>
        {ASSET_TYPE_TABS.map((tab) => (
          <div
            key={tab.type}
            className={`if-tab ${activeType === tab.type ? 'active' : ''} ${counts[tab.type] === 0 ? 'is-empty' : ''}`}
            data-itype={tab.type}
            onClick={() => setActiveType(tab.type)}
            role="button"
            tabIndex={0}
          >
            {tab.label} <span className="if-count">{counts[tab.type]}</span>
          </div>
        ))}
      </div>

      <div className="illust-layout">
        <AssetList
          assets={assets}
          activeType={activeType}
          selectedAssetId={selectedAssetId}
          onSelect={(asset) => setSelectedAssetId(asset.id)}
          onGenerate={handleQuickGenerate}
        />
        <GalleryPanel
          asset={selectedAsset}
          generatedPrompt={selectedTask?.taskPromptSeed ?? selectedAsset?.taskPrompt}
          isGenerating={selectedTask ? generatingIds.has(selectedTask.id) : false}
          onGenerate={handleGenerate}
          onStopGenerate={() => {
            if (selectedTask) stopTask(selectedTask.id);
          }}
          onAdopt={handleAdopt}
          onRegenerate={handleRegenerate}
          onUpscale={handleUpscale}
          visualTone={visualTone}
        />
      </div>

      <NewTaskDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleTaskSubmit}
        visualTone={visualTone}
        scriptTitle={workspace?.script.title}
      />

      <AntModal
        open={marketOpen}
        title="插画市场"
        width={720}
        footer={null}
        onCancel={() => setMarketOpen(false)}
      >
        <div className="market-grid">
          {marketItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="market-card"
              onClick={() => void handleCreateFromMarket(item)}
            >
              <span className="market-type">{item.taskType}</span>
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              <small>{item.promptHint}</small>
            </button>
          ))}
        </div>
      </AntModal>

      <AntModal
        open={batchOpen}
        title="批量执行插画任务"
        width={420}
        footer={null}
        closable={batchStatus !== 'running'}
        onCancel={() => setBatchOpen(false)}
      >
        <Progress
          percent={batchPercent}
          status={
            batchStatus === 'failed'
              ? 'exception'
              : batchStatus === 'completed'
                ? 'success'
                : 'active'
          }
        />
        <div className="batch-progress-meta">
          <span>{batchMessage}</span>
          <span className="bpm-count">
            {batchDone} / {batchTotal}
          </span>
        </div>
      </AntModal>
    </div>
  );
}
