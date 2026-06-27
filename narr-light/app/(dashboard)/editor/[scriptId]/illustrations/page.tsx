/**
 * 插画生成页（T183 · 视图8）
 *
 * 路由：/dashboard/editor/[scriptId]/illustrations
 *
 * 严格参照原型 workbench2.html #view-illust 结构：
 *   1. .page-head      页头（标题 + 进度印章 + 批量重绘 / 新建生成任务）
 *   2. .illust-filter   类型 tab（all/cover/scene/clue/public/char/poster）+ 计数
 *   3. .illust-layout   左右双栏
 *      - 左：AssetList   资产列表（含头部 ASSET LIST · N / 已完成 N）
 *      - 右：GalleryPanel 画廊 + Prompt 输入
 *   4. NewTaskDrawer    新建任务抽屉（Portal 渲染为 .main 兄弟节点）
 *
 * 客户端组件：管理 activeType / selectedAssetId / drawerOpen 状态。
 */
'use client';

import { use, useState } from 'react';
import { App as AntdApp, Modal as AntModal, Progress } from 'antd';
import { Sparkles } from 'lucide-react';
import {
  AssetList,
  ASSET_TYPE_TABS,
  countAssetsByType,
  DEFAULT_ILLUST_ASSETS,
  type AssetFilter,
  type IllustrationAsset,
} from '@/components/illust/asset-list';
import { GalleryPanel, type GenerateConfig } from '@/components/illust/gallery-panel';
import { NewTaskDrawer, type NewTaskFormData } from '@/components/illust/new-task-drawer';
import { illustrationGenerateService } from '@/lib/services/illustration-generate-service';
import './illustrations.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

/**
 * 插画生成页
 */
export default function IllustrationsPage({ params }: PageProps) {
  const { scriptId } = use(params);

  // 状态：类型筛选 / 选中资产 / 抽屉开闭
  const [activeType, setActiveType] = useState<AssetFilter>('all');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('scene-5');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 资产数据（后续可由 IllustrationService.getAssets(scriptId) 注入）
  const [assets, setAssets] = useState<IllustrationAsset[]>(DEFAULT_ILLUST_ASSETS);
  // 正在生成中的资产 ID（防止重复触发）
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  // 批量重绘进度弹窗
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchPercent, setBatchPercent] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchMessage, setBatchMessage] = useState('');
  const [batchStatus, setBatchStatus] = useState<'running' | 'completed' | 'failed'>('running');

  // antd message（已由 RootLayout 的 AntdApp 注入上下文）
  const { message } = AntdApp.useApp();

  const { counts, total, done } = countAssetsByType(assets);
  const selectedAsset: IllustrationAsset | undefined = assets.find(
    (a) => a.id === selectedAssetId,
  );

  // ===== 单资产生成（复用于「开始生成」与「重绘」） =====
  const generateForAsset = async (
    assetId: string,
    config: GenerateConfig,
  ): Promise<void> => {
    if (generatingIds.has(assetId)) {
      message.warning('该资产正在生成中，请稍候');
      return;
    }
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;

    setGeneratingIds((prev) => new Set(prev).add(assetId));
    // 画廊新增「生成中」卡片：置为 active 并重置进度
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId ? { ...a, status: 'active', progress: 0, sub: '生成中 0%' } : a,
      ),
    );

    try {
      const result = await illustrationGenerateService.generateSingle(
        { scriptId, prompt: config.prompt, model: config.model, ratio: config.ratio, count: config.count },
        (percent) => {
          setAssets((prev) =>
            prev.map((a) =>
              a.id === assetId
                ? { ...a, progress: percent, sub: `生成中 ${percent}%` }
                : a,
            ),
          );
        },
      );
      // 完成后显示结果：置为 done 并更新缩略图
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId
            ? { ...a, status: 'done', progress: 100, sub: '已生成', thumb: result.imageUrl }
            : a,
        ),
      );
      message.success(`「${asset.title}」生成完成`);
    } catch {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, status: 'pending', progress: 0, sub: '生成失败' } : a,
        ),
      );
      message.error('生成失败，请重试');
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  // ===== 开始生成（画廊主区「开始生成」按钮） =====
  const handleGenerate = (config: GenerateConfig) => {
    if (!selectedAsset) {
      message.warning('请先在左侧选择一个资产');
      return;
    }
    void generateForAsset(selectedAsset.id, config);
  };

  // ===== 画廊卡：采用 → 锁定资产 =====
  // Mock：模拟 illustrationService.lockAsset(assetId)。
  // 真实接入时替换为：await illustrationService.lockAsset(assetId)
  const handleAdopt = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const hide = message.loading('正在锁定资产…', 0);
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId ? { ...a, status: 'done', progress: 100, sub: '已定稿锁定' } : a,
      ),
    );
    hide();
    message.success(`已采用并锁定「${asset.title}」`);
  };

  // ===== 画廊卡：重绘 → 重新生成该资产 =====
  const handleRegenerate = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    void generateForAsset(assetId, {
      prompt: '',
      model: 'glm',
      ratio: '16:9',
      count: 1,
    });
  };

  // ===== 画廊卡：放大 → 高清放大（Mock） =====
  const handleUpscale = async (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const hide = message.loading('正在高清放大…', 0);
    try {
      const result = await illustrationGenerateService.upscale(assetId);
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, thumb: result.imageUrl } : a)),
      );
      hide();
      message.success(`「${asset.title}」放大完成`);
    } catch {
      hide();
      message.error('放大失败，请重试');
    }
  };

  // ===== 批量重绘：对已完成资产批量重新生成 =====
  const handleBatchRegenerate = async () => {
    const doneAssets = assets.filter((a) => a.status === 'done');
    if (doneAssets.length === 0) {
      message.warning('没有已完成的资产可重绘');
      return;
    }
    const ids = doneAssets.map((a) => a.id);

    setBatchTotal(ids.length);
    setBatchDone(0);
    setBatchPercent(0);
    setBatchMessage('开始批量重绘…');
    setBatchStatus('running');
    setBatchOpen(true);

    // 标记所有目标资产为生成中
    setAssets((prev) =>
      prev.map((a) =>
        ids.includes(a.id) ? { ...a, status: 'active', progress: 0, sub: '批量重绘中' } : a,
      ),
    );

    try {
      const results = await illustrationGenerateService.batchRegenerate(
        { scriptId, assetIds: ids },
        (percent, msg) => {
          setBatchPercent(percent);
          setBatchMessage(msg);
          setBatchDone(Math.min(ids.length, Math.round((percent / 100) * ids.length)));
          setAssets((prev) =>
            prev.map((a) =>
              ids.includes(a.id) ? { ...a, progress: percent } : a,
            ),
          );
        },
      );
      // 完成：更新所有重绘资产的缩略图与状态
      setAssets((prev) =>
        prev.map((a) => {
          const r = results.find((x) => x.id === a.id);
          return r
            ? { ...a, status: 'done', progress: 100, sub: '已重绘', thumb: r.imageUrl }
            : a;
        }),
      );
      setBatchStatus('completed');
      setBatchPercent(100);
      setBatchMessage('批量重绘完成');
      message.success(`批量重绘完成，共更新 ${ids.length} 项资产`);
    } catch {
      setAssets((prev) =>
        prev.map((a) =>
          ids.includes(a.id) ? { ...a, status: 'done', sub: '重绘失败' } : a,
        ),
      );
      setBatchStatus('failed');
      setBatchMessage('批量重绘失败');
      message.error('批量重绘失败，请重试');
    }
  };

  const handleTaskSubmit = (data: NewTaskFormData) => {
    // TODO: 调用 IllustrationService 创建生成任务
    void data;
  };

  return (
    <div className="illust-page">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            插画生成 <span className="seal">{done} / {total}</span>
          </h1>
          <div className="page-desc">
            剧本封面 / 场景 / 线索卡 / 公共线 / 人物立绘 / 海报 · 多模型对比 · 自动套用视觉基调
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleBatchRegenerate}
          >
            批量重绘
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDrawerOpen(true)}
          >
            <Sparkles size={15} />
            新建生成任务
          </button>
        </div>
      </div>

      {/* ===== 类型筛选 ===== */}
      <div className="illust-filter">
        <span className="if-label">类型</span>
        {ASSET_TYPE_TABS.map((tab) => (
          <div
            key={tab.type}
            className={`if-tab ${activeType === tab.type ? 'active' : ''}`}
            data-itype={tab.type}
            onClick={() => setActiveType(tab.type)}
            role="button"
            tabIndex={0}
          >
            {tab.label} <span className="if-count">{counts[tab.type]}</span>
          </div>
        ))}
      </div>

      {/* ===== 双栏布局 ===== */}
      <div className="illust-layout">
        <AssetList
          assets={assets}
          activeType={activeType}
          selectedAssetId={selectedAssetId}
          onSelect={(asset) => setSelectedAssetId(asset.id)}
        />
        <GalleryPanel
          asset={selectedAsset}
          onGenerate={handleGenerate}
          onAdopt={handleAdopt}
          onRegenerate={handleRegenerate}
          onUpscale={handleUpscale}
          visualTone="水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围"
        />
      </div>

      {/* ===== 新建任务抽屉（Portal 渲染为 .main 兄弟节点） ===== */}
      <NewTaskDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleTaskSubmit}
        visualTone="水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围"
      />

      {/* ===== 批量重绘进度弹窗 ===== */}
      <AntModal
        open={batchOpen}
        title="批量重绘插画"
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
