/**
 * 生成主区组件（T185）
 *
 * 右栏 `.illust-main`，包含：
 *   - `.gallery`：多模型对比卡（4 张 .gen-card），根据选中资产状态展示
 *     已生成 / 生成中环形进度 / 空状态
 *   - `.prompt-box`：prompt textarea + 模型/比例/张数 chip 选择 +
 *     AUTO-INJECT 视觉基调提示 + 开始生成按钮
 *
 * 客户端组件：管理 prompt 文本与 chip 选项的本地状态。
 * 视觉与 class 命名对齐原型 workbench2.html #view-illust .illust-main
 */
'use client';

import { useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { GenCard, type GenCardData } from './gen-card';
import type { IllustrationAsset } from './asset-list';

/** 模型选项 */
const MODEL_OPTIONS = [
  { id: 'deepseek', label: 'DeepSeek-V4' },
  { id: 'glm', label: 'GLM-5.1' },
  { id: 'fusion', label: '多模态融合' },
] as const;

/** 比例选项 */
const RATIO_OPTIONS = ['1:1', '16:9', '3:4'] as const;

/** 张数选项 */
const COUNT_OPTIONS = [1, 4] as const;

/** 生成配置（提交给父级） */
export interface GenerateConfig {
  prompt: string;
  model: string;
  ratio: string;
  count: number;
}

interface GalleryPanelProps {
  /** 当前选中的资产（驱动画廊内容与 prompt 标题） */
  asset: IllustrationAsset | undefined;
  /** AUTO-INJECT 视觉基调文案，如 "水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围" */
  visualTone?: string;
  /** 开始生成回调 */
  onGenerate?: (config: GenerateConfig) => void;
  /** 采用（锁定资产）回调，参数为资产 ID */
  onAdopt?: (assetId: string) => void;
  /** 重绘（重新生成）回调，参数为资产 ID */
  onRegenerate?: (assetId: string) => void;
  /** 放大（高清放大）回调，参数为资产 ID */
  onUpscale?: (assetId: string) => void;
}

/** 已生成卡片的预设背景（多模型对比，色调各异） */
const DONE_BACKGROUNDS = [
  "radial-gradient(circle at 30% 20%, rgba(176,141,87,0.28), transparent 55%), radial-gradient(circle at 70% 70%, rgba(138,28,28,0.25), transparent 60%), linear-gradient(135deg, rgba(26,20,16,0.35) 0%, rgba(42,26,20,0.45) 100%), url('https://picsum.photos/seed/narrGenDeepseek/480/300?grayscale') center/cover",
  "radial-gradient(circle at 50% 30%, rgba(74,124,89,0.25), transparent 60%), linear-gradient(180deg, rgba(26,20,16,0.35) 0%, rgba(15,26,20,0.45) 100%), url('https://picsum.photos/seed/narrGenGlm/480/300?grayscale') center/cover",
  "radial-gradient(circle at 40% 60%, rgba(58,90,122,0.28), transparent 55%), linear-gradient(135deg, rgba(26,20,16,0.35) 0%, rgba(20,26,42,0.45) 100%), url('https://picsum.photos/seed/narrGenFusion/480/300?grayscale') center/cover",
  "radial-gradient(circle at 60% 40%, rgba(138,28,28,0.22), transparent 60%), linear-gradient(135deg, rgba(26,20,16,0.35) 0%, rgba(42,26,42,0.45) 100%), url('https://picsum.photos/seed/narrGenAlt/480/300?grayscale') center/cover",
];

/**
 * 根据资产状态生成 4 张对比卡数据。
 *   - active（生成中）：2 已完成 + 1 生成中 + 1 空位
 *   - done（已生成）：4 张已完成结果
 *   - pending（待生成）：4 个空位
 */
function buildGalleryCards(asset: IllustrationAsset | undefined): GenCardData[] {
  if (!asset || asset.status === 'pending') {
    return [
      { status: 'empty' },
      { status: 'empty' },
      { status: 'empty' },
      { status: 'empty' },
    ];
  }
  if (asset.status === 'active') {
    return [
      { status: 'done', image: DONE_BACKGROUNDS[0], model: 'DeepSeek-V4', seed: 8421 },
      { status: 'done', image: DONE_BACKGROUNDS[1], model: 'GLM-5.1', seed: 3092 },
      {
        status: 'loading',
        progress: asset.progress ?? 68,
        model: '多模态 · 生成中',
        eta: '预计 12s',
      },
      { status: 'empty' },
    ];
  }
  // done
  return [
    { status: 'done', image: DONE_BACKGROUNDS[0], model: 'DeepSeek-V4', seed: 8421 },
    { status: 'done', image: DONE_BACKGROUNDS[1], model: 'GLM-5.1', seed: 3092 },
    { status: 'done', image: DONE_BACKGROUNDS[2], model: '多模态融合', seed: 5577 },
    { status: 'done', image: DONE_BACKGROUNDS[3], model: 'GLM-5.1', seed: 6628 },
  ];
}

/** 默认 prompt（按资产标题生成） */
function defaultPrompt(asset: IllustrationAsset | undefined): string {
  if (!asset) return '';
  if (asset.type === 'char') {
    return '雨夜中的民国女子，身着青色旗袍立于药铺后院檐下，手持油纸伞，伞沿滴落水珠。半身构图，侧脸回眸，神情忧郁。水墨质感，冷峻色调，留白构图，悬疑氛围。';
  }
  return '夜雨中的古镇药铺后院，柴房半掩，昏黄油灯透出。地面散落三包未贴标签的草药，一束微光打在草药上突出主体。水墨质感，冷峻色调，构图留白，悬疑氛围。';
}

/**
 * 画廊 + Prompt 主区组件
 */
export function GalleryPanel({
  asset,
  visualTone,
  onGenerate,
  onAdopt,
  onRegenerate,
  onUpscale,
}: GalleryPanelProps) {
  const [prompt, setPrompt] = useState(defaultPrompt(asset));
  const [model, setModel] = useState<string>('deepseek');
  const [ratio, setRatio] = useState<string>('16:9');
  const [count, setCount] = useState<number>(4);

  const cards = buildGalleryCards(asset);
  const promptTitle = asset ? `PROMPT · ${asset.title}` : 'PROMPT';
  const assetId = asset?.id;

  const handleGenerate = () => {
    onGenerate?.({ prompt, model, ratio, count });
  };

  // 画廊卡操作回调（仅在资产存在时触发，透传给已生成卡）
  const cardActions = assetId
    ? {
        onAdopt: () => onAdopt?.(assetId),
        onRegenerate: () => onRegenerate?.(assetId),
        onUpscale: () => onUpscale?.(assetId),
      }
    : undefined;

  return (
    <div className="illust-main">
      {/* 多模型对比画廊 */}
      <div className="gallery">
        {cards.map((card, i) => (
          <GenCard key={i} card={card} actions={cardActions} />
        ))}
      </div>

      {/* Prompt 输入 */}
      <div className="prompt-box">
        <div className="pb-head">
          <Sparkles size={16} />
          <span className="pb-title">{promptTitle}</span>
        </div>
        <textarea
          className="prompt-input"
          placeholder="描述你想要的画面…"
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
