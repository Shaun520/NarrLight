'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, Play, Sparkles } from 'lucide-react';
import { GenCard, type GenCardData } from './gen-card';
import type { IllustrationAsset } from './asset-list';

const MODEL_OPTIONS = [
  { id: 'openai', label: 'OpenAI Images' },
  { id: 'glm', label: 'GLM CogView' },
  { id: 'seedream', label: '豆包 Seedream' },
] as const;

const RATIO_OPTIONS = ['1:1', '16:9', '3:4'] as const;
const COUNT_OPTIONS = [1, 4] as const;

export interface GenerateConfig {
  prompt: string;
  model: string;
  ratio: string;
  count: number;
}

interface GalleryPanelProps {
  asset: IllustrationAsset | undefined;
  generatedPrompt?: string;
  visualTone?: string;
  onGenerate?: (config: GenerateConfig) => void;
  onAdopt?: (assetId: string) => void;
  onRegenerate?: (assetId: string) => void;
  onUpscale?: (assetId: string) => void;
}

function buildGalleryCards(asset: IllustrationAsset | undefined): GenCardData[] {
  if (!asset || asset.status === 'pending') return [];
  if (asset.status === 'active') {
    return [{
      status: 'loading',
      progress: asset.progress ?? 0,
      model: '生成中',
      eta: '请稍候',
    }];
  }
  if (!asset.thumb) return [{ status: 'empty' }];
  return [{
    status: 'done',
    image: asset.thumb,
    model: asset.sub || '已生成',
  }];
}

function defaultPrompt(asset: IllustrationAsset | undefined): string {
  if (!asset) return '';
  if (asset.type === 'char') {
    return '雨夜中的民国人物立绘，半身构图，冷暖对比，水墨质感，留白构图，悬疑氛围。';
  }
  return `${asset.title}，水墨古风，暗调暖光，留白构图，雨夜氛围，突出主体细节。`;
}

export function GalleryPanel({
  asset,
  generatedPrompt,
  visualTone,
  onGenerate,
  onAdopt,
  onRegenerate,
  onUpscale,
}: GalleryPanelProps) {
  const [prompt, setPrompt] = useState(defaultPrompt(asset));
  const [model, setModel] = useState<string>('openai');
  const [ratio, setRatio] = useState<string>('16:9');
  const [count, setCount] = useState<number>(1);

  const cards = buildGalleryCards(asset);
  const promptTitle = asset ? `PROMPT · ${asset.title}` : 'PROMPT';
  const assetId = asset?.id;

  useEffect(() => {
    setPrompt(generatedPrompt ?? defaultPrompt(asset));
  }, [asset, generatedPrompt]);

  const handleGenerate = () => {
    onGenerate?.({ prompt, model, ratio, count });
  };

  const cardActions = assetId
    ? {
        onAdopt: () => onAdopt?.(assetId),
        onRegenerate: () => onRegenerate?.(assetId),
        onUpscale: () => onUpscale?.(assetId),
      }
    : undefined;

  return (
    <div className="illust-main">
      {asset?.status === 'pending' ? (
        <div className="pending-asset-panel">
          <div className="pending-asset-icon">
            <ImagePlus size={30} />
          </div>
          <div className="pending-asset-copy">
            <div className="pending-asset-kicker">WAITING TASK</div>
            <h3>{asset.title}</h3>
            <p>{asset.sub || '线索插画任务已创建，完善 Prompt 后即可开始生成。'}</p>
          </div>
        </div>
      ) : asset ? (
        <div className={`gallery ${cards.length <= 1 ? 'single-result' : ''}`}>
          {cards.map((card, i) => (
            <GenCard key={i} card={card} actions={cardActions} />
          ))}
        </div>
      ) : (
        <div className="pending-asset-panel empty">
          <div className="pending-asset-icon">
            <ImagePlus size={30} />
          </div>
          <div className="pending-asset-copy">
            <div className="pending-asset-kicker">NO ASSET</div>
            <h3>暂无插画任务</h3>
            <p>从线索卡管理页选择“补全插画”，或新建生成任务。</p>
          </div>
        </div>
      )}

      <div className="prompt-box">
        <div className="pb-head">
          <Sparkles size={16} />
          <span className="pb-title">{promptTitle}</span>
        </div>
        <textarea
          className="prompt-input"
          placeholder="描述你想要的画面..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="prompt-controls">
          <div className="pc-group">
            <span className="pc-label">模型</span>
            {MODEL_OPTIONS.map((m) => (
              <div
                key={m.id}
                className={`pc-chip ${model === m.id ? 'active' : ''}`}
                onClick={() => setModel(m.id)}
                role="button"
                tabIndex={0}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="pc-group">
            <span className="pc-label">比例</span>
            {RATIO_OPTIONS.map((r) => (
              <div
                key={r}
                className={`pc-chip ${ratio === r ? 'active' : ''}`}
                onClick={() => setRatio(r)}
                role="button"
                tabIndex={0}
              >
                {r}
              </div>
            ))}
          </div>
          <div className="pc-group">
            <span className="pc-label">张数</span>
            {COUNT_OPTIONS.map((c) => (
              <div
                key={c}
                className={`pc-chip ${count === c ? 'active' : ''}`}
                onClick={() => setCount(c)}
                role="button"
                tabIndex={0}
              >
                {c}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={handleGenerate}
          >
            <Play size={14} />
            开始生成
          </button>
        </div>
        <div className="pb-inject">
          <span className="pb-inject-tag">AUTO-INJECT</span> · 系统已自动注入剧本视觉基调：
          {visualTone ?? '水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围'}
        </div>
      </div>
    </div>
  );
}

export default GalleryPanel;
