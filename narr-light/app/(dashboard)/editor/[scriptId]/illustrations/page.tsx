'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Modal as AntModal, Progress } from 'antd';
import { Sparkles } from 'lucide-react';
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
  buildCharacterConsistencyPrompt,
  type CharacterConsistencyInput,
} from '@/lib/ai/prompts/illustration-style';
import {
  generateIllustrationAssetAction,
  getIllustrationCharactersAction,
  getIllustrationAssetsAction,
  type IllustrationCharacterView,
  type IllustrationAssetView,
} from './actions';
import './illustrations.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

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

function buildPrompt(asset: IllustrationAssetView, prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed) return trimmed;
  return `${asset.title}，水墨古风，暗调暖光，留白构图，悬疑氛围，突出线索主体细节。`;
}

function normalizeMatchText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function findCharacterForAsset(
  asset: IllustrationAssetView | undefined,
  characters: IllustrationCharacterView[],
): IllustrationCharacterView | undefined {
  if (!asset || asset.type !== 'char') return undefined;

  const sourceMatch = characters.find(
    (character) =>
      asset.sourceId === character.id &&
      (asset.sourceType === 'character' || asset.sourceType === 'char'),
  );
  if (sourceMatch) return sourceMatch;

  const normalizedTitle = normalizeMatchText(asset.title);
  return characters.find((character) =>
    normalizedTitle.includes(normalizeMatchText(character.name)),
  );
}

function buildAssetPrompt(
  asset: IllustrationAssetView,
  prompt: string,
  character?: CharacterConsistencyInput,
): string {
  const trimmed = prompt.trim();
  if (trimmed) return trimmed;
  if (asset.type === 'char' && character) {
    return buildCharacterConsistencyPrompt(character);
  }
  return buildPrompt(asset, prompt);
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assets, setAssets] = useState<IllustrationAssetView[]>([]);
  const [characters, setCharacters] = useState<IllustrationCharacterView[]>([]);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchPercent, setBatchPercent] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchMessage, setBatchMessage] = useState('');
  const [batchStatus, setBatchStatus] = useState<'running' | 'completed' | 'failed'>('running');

  const { counts, total, done } = useMemo(() => countAssetsByType(assets), [assets]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const selectedCharacter = useMemo(
    () => findCharacterForAsset(selectedAsset, characters),
    [characters, selectedAsset],
  );
  const selectedGeneratedPrompt = useMemo(() => {
    if (!selectedAsset || selectedAsset.type !== 'char' || !selectedCharacter) return undefined;
    return buildCharacterConsistencyPrompt(selectedCharacter);
  }, [selectedAsset, selectedCharacter]);

  useEffect(() => {
    setActiveType(normalizeAssetFilter(searchParams.get('type')));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getIllustrationAssetsAction(scriptId),
      getIllustrationCharactersAction(scriptId),
    ])
      .then(([items, characterItems]) => {
        if (cancelled) return;
        setAssets(items);
        setCharacters(characterItems);
        const sourceMatch = sourceId
          ? items.find((asset) => asset.sourceType === 'clue' && asset.sourceId === sourceId)
          : undefined;
        setSelectedAssetId(sourceMatch?.id ?? items[0]?.id ?? '');
      })
      .catch((error) => {
        console.error('Failed to load illustration assets:', error);
        message.error('读取插画资产失败');
      });

    return () => {
      cancelled = true;
    };
  }, [message, scriptId, sourceId]);

  const generateForAsset = async (
    assetId: string,
    config: GenerateConfig,
  ): Promise<void> => {
    if (generatingIds.has(assetId)) {
      message.warning('该资产正在生成中，请稍候');
      return;
    }

    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;

    setGeneratingIds((prev) => new Set(prev).add(assetId));
    setAssets((prev) =>
      prev.map((item) =>
        item.id === assetId
          ? { ...item, status: 'active', progress: 10, sub: '生成中' }
          : item,
      ),
    );

    try {
      const result = await generateIllustrationAssetAction({
        scriptId,
        assetId,
        prompt: buildAssetPrompt(
          asset,
          config.prompt,
          findCharacterForAsset(asset, characters),
        ),
        model: config.model,
        ratio: config.ratio,
        count: config.count,
      });

      setAssets((prev) =>
        prev.map((item) =>
          item.id === assetId
            ? {
                ...item,
                status: 'done',
                progress: 100,
                sub: `已生成 · ${result.model}`,
                thumb: result.imageUrl,
              }
            : item,
        ),
      );
      message.success(`「${asset.title}」生成完成`);
    } catch (error) {
      console.error('Generate illustration failed:', error);
      const errorMessage = error instanceof Error ? error.message : '生成失败，请重试';
      setAssets((prev) =>
        prev.map((item) =>
          item.id === assetId
            ? { ...item, status: 'pending', progress: 0, sub: '生成失败，请重试' }
            : item,
        ),
      );
      message.error(errorMessage);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  const handleGenerate = (config: GenerateConfig) => {
    if (!selectedAsset) {
      message.warning('请先在左侧选择一个插画任务');
      return;
    }
    void generateForAsset(selectedAsset.id, config);
  };

  const handleQuickGenerate = (asset: IllustrationAssetView) => {
    setSelectedAssetId(asset.id);
    void generateForAsset(asset.id, {
      prompt: '',
      model: 'openai',
      ratio: '16:9',
      count: 1,
    });
  };

  const handleAdopt = async (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    setAssets((prev) =>
      prev.map((item) =>
        item.id === assetId ? { ...item, status: 'done', progress: 100, sub: '已采用' } : item,
      ),
    );
    message.success(`已采用「${asset.title}」`);
  };

  const handleRegenerate = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    void generateForAsset(assetId, {
      prompt: '',
      model: 'openai',
      ratio: '16:9',
      count: 1,
    });
  };

  const handleUpscale = async () => {
    message.info('高清放大能力尚未接入真实模型');
  };

  const handleBatchRegenerate = async () => {
    const doneAssets = assets.filter((asset) => asset.status === 'done');
    if (doneAssets.length === 0) {
      message.warning('没有已完成的资产可重绘');
      return;
    }

    setBatchTotal(doneAssets.length);
    setBatchDone(0);
    setBatchPercent(0);
    setBatchMessage('开始批量重绘');
    setBatchStatus('running');
    setBatchOpen(true);

    try {
      for (let i = 0; i < doneAssets.length; i += 1) {
        const asset = doneAssets[i];
        setBatchDone(i);
        setBatchPercent(Math.round((i / doneAssets.length) * 100));
        setBatchMessage(`正在重绘 ${i + 1}/${doneAssets.length}`);
        await generateForAsset(asset.id, {
          prompt: '',
          model: 'openai',
          ratio: '16:9',
          count: 1,
        });
      }
      setBatchDone(doneAssets.length);
      setBatchPercent(100);
      setBatchStatus('completed');
      setBatchMessage('批量重绘完成');
      message.success(`批量重绘完成，共更新 ${doneAssets.length} 项资产`);
    } catch (error) {
      console.error('Batch regenerate failed:', error);
      setBatchStatus('failed');
      setBatchMessage('批量重绘失败');
      message.error('批量重绘失败，请重试');
    }
  };

  const handleTaskSubmit = (data: NewTaskFormData) => {
    void data;
  };

  return (
    <div className="illust-page">
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
          <button type="button" className="btn btn-ghost" onClick={handleBatchRegenerate}>
            批量重绘
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
          generatedPrompt={selectedGeneratedPrompt}
          onGenerate={handleGenerate}
          onAdopt={handleAdopt}
          onRegenerate={handleRegenerate}
          onUpscale={handleUpscale}
          visualTone="水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围"
        />
      </div>

      <NewTaskDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleTaskSubmit}
        visualTone="水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围"
      />

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
