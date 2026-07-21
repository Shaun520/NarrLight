'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, Play, Sparkles, Square } from 'lucide-react';
import { getDefaultIllustrationRatio } from '@/lib/ai/prompts/illustration-style';
import { getTemplatesForType } from '@/lib/ai/prompts/illustration-reference-templates';
import { GenCard, type GenCardData } from './gen-card';
import type { AssetType, IllustrationAsset } from './asset-list';

const DEFAULT_MODEL_OPTIONS = [
  { id: 'openai', label: 'OpenAI Images' },
  { id: 'glm', label: 'GLM CogView' },
  { id: 'seedream', label: '豆包 Seedream' },
] as const;

const RATIO_OPTIONS = ['1:1', '4:3', '16:9', '3:4', '9:16'] as const;
const COUNT_OPTIONS = [1, 4] as const;

export interface GenerateConfig {
  prompt: string;
  model: string;
  ratio: string;
  count: number;
  templateIds?: string[];
}

interface GalleryPanelProps {
  asset: IllustrationAsset | undefined;
  generatedPrompt?: string;
  visualTone?: string;
  initialRatio?: string;
  initialCount?: number;
  qualityStatus?: 'unchecked' | 'passed' | 'warning';
  qualityMessage?: string;
  isGenerating?: boolean;
  modelOptions?: Array<{ id: string; label: string }>;
  defaultModel?: string;
  onGenerate?: (config: GenerateConfig) => void;
  onStopGenerate?: () => void;
  onAdopt?: (assetId: string) => void;
  onRegenerate?: (assetId: string) => void;
  onUpscale?: (assetId: string) => void;
}

function previewVariant(type: AssetType | undefined): Extract<GenCardData, { status: 'done' }>['variant'] {
  if (type === 'clue') return 'clue-card';
  if (type === 'cover' || type === 'poster') return 'cover';
  if (type === 'char') return 'character';
  return 'plain';
}

function defaultTemplateIds(type: AssetType | undefined): string[] {
  if (type === 'clue') return ['ref-clue-card-finished'];
  if (type === 'cover' || type === 'poster') return ['ref-cover-white-poster'];
  if (type === 'char') return ['ref-character-standee'];
  return [];
}

function buildGalleryCards(
  asset: IllustrationAsset | undefined,
  qualityStatus?: 'unchecked' | 'passed' | 'warning',
  qualityMessage?: string,
): GenCardData[] {
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
    variant: previewVariant(asset.type),
    title: asset.title,
    subtitle: asset.sub,
    qualityStatus,
    qualityMessage,
  }];
}

function defaultPrompt(asset: IllustrationAsset | undefined): string {
  if (!asset) return '';
  if (asset.type === 'clue') {
    return `${asset.title}，线索卡配图层，只生成证据物件或局部现场特写，不要文字、不要卡牌边框、不要说明正文，主体居中，四周留安全边距。`;
  }
  if (asset.type === 'cover') {
    return `${asset.title}，剧本封面视觉底图，竖版封面构图，大面积留白，预留标题和发行信息排版区域，不要生成文字。`;
  }
  if (asset.type === 'char') {
    return `${asset.title}，单人人物立绘，半身或全身，干净背景，清晰五官、发型和服饰，便于后续复用，不要复杂场景和文字。`;
  }
  if (asset.type === 'poster') {
    return `${asset.title}，宣传海报视觉底图，强冲击构图，预留标题和卖点文案区域，不要直接生成可读文字。`;
  }
  return `${asset.title}，场景插画，强调空间纵深、环境叙事和关键道具位置，不要卡牌边框、封面排版和说明文字。`;
}

export function GalleryPanel({
  asset,
  generatedPrompt,
  visualTone,
  initialRatio,
  initialCount,
  qualityStatus,
  qualityMessage,
  isGenerating = false,
  modelOptions,
  defaultModel,
  onGenerate,
  onStopGenerate,
  onAdopt,
  onRegenerate,
  onUpscale,
}: GalleryPanelProps) {
  const options = modelOptions ?? DEFAULT_MODEL_OPTIONS.slice();
  const effectiveDefault = defaultModel ?? options[0]?.id ?? 'openai';

  const [prompt, setPrompt] = useState(defaultPrompt(asset));
  const [model, setModel] = useState<string>(effectiveDefault);
  const [ratio, setRatio] = useState<string>(initialRatio ?? getDefaultIllustrationRatio(asset?.type ?? 'scene'));
  const [count, setCount] = useState<number>(initialCount ?? 1);
  const [templateIds, setTemplateIds] = useState<string[]>(() => defaultTemplateIds(asset?.type));

  const cards = buildGalleryCards(asset, qualityStatus, qualityMessage);
  const templates = getTemplatesForType(asset?.type ?? 'scene');
  const referenceTemplates = templates.filter((template) => template.kind === 'reference');
  const styleTemplates = templates.filter((template) => template.kind === 'style');
  const promptTitle = asset ? `PROMPT · ${asset.title}` : 'PROMPT';
  const assetId = asset?.id;
  const compactPreview = cards.length > 0;

  useEffect(() => {
    setPrompt(generatedPrompt ?? defaultPrompt(asset));
    setRatio(initialRatio ?? getDefaultIllustrationRatio(asset?.type ?? 'scene'));
    setCount(initialCount ?? 1);
    setTemplateIds(defaultTemplateIds(asset?.type));
    // 当 admin 配置变化导致可用模型改变时，同步默认模型并兜底到首个可用选项
    setModel((current) => {
      if (options.some((o) => o.id === current)) return current;
      return effectiveDefault;
    });
  }, [asset, generatedPrompt, initialCount, initialRatio, options, effectiveDefault]);

  const handleGenerate = () => {
    if (isGenerating) {
      onStopGenerate?.();
      return;
    }
    onGenerate?.({ prompt, model, ratio, count, templateIds });
  };

  const toggleTemplate = (templateId: string) => {
    setTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId],
    );
  };

  const cardActions = assetId
    ? {
        onAdopt: () => onAdopt?.(assetId),
        onRegenerate: () => onRegenerate?.(assetId),
        onUpscale: () => onUpscale?.(assetId),
      }
    : undefined;

  return (
    <div className={`illust-main ${compactPreview ? 'preview-compact' : ''}`}>
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
        {templates.length > 0 ? (
          <div className="template-market">
            {referenceTemplates.length > 0 ? (
              <div className="tm-group">
                <div className="tm-title">参考图</div>
                <div className="tm-list">
                  {referenceTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`tm-card ${templateIds.includes(template.id) ? 'active' : ''}`}
                      onClick={() => toggleTemplate(template.id)}
                    >
                      <span className="tm-swatch" style={{ background: template.swatch }} />
                      <span className="tm-copy">
                        <strong>{template.title}</strong>
                        <small>{template.subtitle}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {styleTemplates.length > 0 ? (
              <div className="tm-group">
                <div className="tm-title">风格模板</div>
                <div className="tm-list">
                  {styleTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={`tm-card ${templateIds.includes(template.id) ? 'active' : ''}`}
                      onClick={() => toggleTemplate(template.id)}
                    >
                      <span className="tm-swatch" style={{ background: template.swatch }} />
                      <span className="tm-copy">
                        <strong>{template.title}</strong>
                        <small>{template.subtitle}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="prompt-controls">
          <div className="pc-group">
            <span className="pc-label">模型</span>
            {options.length === 0 ? (
              <span className="pc-hint">当前无可用模型，请联系管理员配置</span>
            ) : (
              options.map((m) => (
                <div
                  key={m.id}
                  className={`pc-chip ${model === m.id ? 'active' : ''}`}
                  onClick={() => setModel(m.id)}
                  role="button"
                  tabIndex={0}
                >
                  {m.label}
                </div>
              ))
            )}
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
            {isGenerating ? <Square size={14} /> : <Play size={14} />}
            {isGenerating ? '停止生成' : '开始生成'}
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
