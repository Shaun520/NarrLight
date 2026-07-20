'use client';

import { use, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { App as AntdApp } from 'antd';
import { ArrowLeft, Image as ImageIcon, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ASSET_TYPE_TABS,
  type AssetFilter,
  type AssetType,
} from '@/components/illust/asset-list';
import {
  createIllustrationTaskFromMarketAction,
  getIllustrationWorkspaceAction,
  type IllustrationWorkspaceView,
} from '../../../../../(dashboard)/editor/[scriptId]/illustrations/actions';
import '../../../../../(dashboard)/editor/[scriptId]/illustrations/illustrations.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

type MarketItemView = IllustrationWorkspaceView['marketItems'][number];
type MarketAssetType = Exclude<AssetFilter, 'all'>;

const MARKET_TYPE_TABS = ASSET_TYPE_TABS.filter(
  (tab): tab is { type: MarketAssetType; label: string } => tab.type !== 'all',
);

const TYPE_ACCENTS: Record<MarketAssetType, { from: string; to: string; label: string }> = {
  cover: { from: 'rgba(138, 28, 28, 0.58)', to: 'rgba(26, 18, 11, 0.78)', label: 'COVER' },
  scene: { from: 'rgba(58, 90, 122, 0.5)', to: 'rgba(26, 20, 16, 0.78)', label: 'SCENE' },
  clue: { from: 'rgba(176, 141, 87, 0.58)', to: 'rgba(42, 26, 20, 0.8)', label: 'CLUE' },
  public: { from: 'rgba(54, 112, 104, 0.52)', to: 'rgba(26, 20, 16, 0.78)', label: 'PUBLIC' },
  char: { from: 'rgba(92, 66, 120, 0.5)', to: 'rgba(26, 20, 16, 0.78)', label: 'CHAR' },
  poster: { from: 'rgba(122, 58, 42, 0.56)', to: 'rgba(26, 20, 16, 0.82)', label: 'POSTER' },
};

function isMarketAssetType(value: string | null | undefined): value is MarketAssetType {
  return (
    value === 'cover' ||
    value === 'scene' ||
    value === 'clue' ||
    value === 'public' ||
    value === 'char' ||
    value === 'poster'
  );
}

function normalizeMarketType(value: string | null): MarketAssetType {
  return isMarketAssetType(value) ? value : 'cover';
}

function countMarketItems(items: MarketItemView[]): Record<MarketAssetType, number> {
  const counts = MARKET_TYPE_TABS.reduce(
    (next, tab) => ({ ...next, [tab.type]: 0 }),
    {} as Record<MarketAssetType, number>,
  );
  for (const item of items) {
    if (isMarketAssetType(item.taskType)) counts[item.taskType] += 1;
  }
  return counts;
}

function buildMarketThumbStyle(item: MarketItemView): CSSProperties {
  const type = isMarketAssetType(item.taskType) ? item.taskType : 'scene';
  const accent = TYPE_ACCENTS[type];
  const seed = encodeURIComponent(item.id || item.title);
  const fallbackUrl = `https://picsum.photos/seed/narr-market-${seed}/720/520?grayscale`;
  const imageUrl = item.thumbUrl || fallbackUrl;
  return {
    backgroundImage: `linear-gradient(135deg, ${accent.from}, ${accent.to}), url("${imageUrl}")`,
  };
}

export default function IllustrationMarketPage({ params }: PageProps) {
  const { scriptId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = AntdApp.useApp();

  const [workspace, setWorkspace] = useState<IllustrationWorkspaceView | null>(null);
  const [activeType, setActiveType] = useState<MarketAssetType>(() =>
    normalizeMarketType(searchParams.get('type')),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creatingItemId, setCreatingItemId] = useState('');

  const marketItems = useMemo(() => workspace?.marketItems ?? [], [workspace]);
  const counts = useMemo(() => countMarketItems(marketItems), [marketItems]);
  const visibleItems = useMemo(
    () => marketItems.filter((item) => item.taskType === activeType),
    [activeType, marketItems],
  );
  const activeLabel = MARKET_TYPE_TABS.find((tab) => tab.type === activeType)?.label ?? '插画';

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getIllustrationWorkspaceAction(scriptId);
      setWorkspace(data);
    } catch (error) {
      console.error('Failed to load illustration market:', error);
      setLoadError(error instanceof Error ? error.message : '读取素材市场失败');
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (loading || marketItems.length === 0 || counts[activeType] > 0) return;
    const firstAvailable = MARKET_TYPE_TABS.find((tab) => counts[tab.type] > 0);
    if (firstAvailable) setActiveType(firstAvailable.type);
  }, [activeType, counts, loading, marketItems.length]);

  const handleCreateFromMarket = async (item: MarketItemView) => {
    if (creatingItemId) return;
    setCreatingItemId(item.id);
    try {
      const task = await createIllustrationTaskFromMarketAction(scriptId, item.id);
      message.success(`已加入任务：${task.title}`);
      const type = isMarketAssetType(item.taskType) ? item.taskType : (task.taskType as AssetType);
      router.push(`/editor/${scriptId}/illustrations?type=${type}`);
    } catch (error) {
      console.error('Create task from market failed:', error);
      message.error(error instanceof Error ? error.message : '创建市场任务失败');
    } finally {
      setCreatingItemId('');
    }
  };

  return (
    <div className="illust-page market-page">
      <div className="page-head market-page-head">
        <div>
          <Link href={`/editor/${scriptId}/illustrations`} className="market-back-link">
            <ArrowLeft size={15} />
            返回插画生成
          </Link>
          <h1 className="page-title">
            素材市场 <span className="seal">{marketItems.length}</span>
          </h1>
          <div className="page-desc">
            {workspace?.script.title ?? '当前剧本'} / {activeLabel} / 统一风格素材
            <span className="page-desc-style">
              统一风格：{workspace?.styleProfile.styleName ?? '读取中'}
            </span>
          </div>
        </div>
      </div>

      <div className="market-category-strip" aria-label="素材分类">
        {MARKET_TYPE_TABS.map((tab) => (
          <button
            key={tab.type}
            type="button"
            className={`market-category-tab ${activeType === tab.type ? 'active' : ''}`}
            onClick={() => setActiveType(tab.type)}
          >
            <span>{tab.label}</span>
            <span className="market-category-count">{counts[tab.type] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="market-state">
          <Loader2 size={24} className="market-state-spin" />
          <span>素材读取中</span>
        </div>
      ) : loadError ? (
        <div className="market-state market-state-error">
          <ImageIcon size={24} />
          <span>{loadError}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadWorkspace()}>
            重新读取
          </button>
        </div>
      ) : (
        <div className="market-gallery-grid">
          {visibleItems.length === 0 ? (
            <div className="market-state market-state-empty">
              <ImageIcon size={24} />
              <span>当前分类暂无素材</span>
            </div>
          ) : null}
          {visibleItems.map((item) => {
            const type = isMarketAssetType(item.taskType) ? item.taskType : 'scene';
            const accent = TYPE_ACCENTS[type];
            const isCreating = creatingItemId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="market-gallery-card"
                onClick={() => void handleCreateFromMarket(item)}
                disabled={Boolean(creatingItemId)}
              >
                <span className="market-gallery-thumb" style={buildMarketThumbStyle(item)}>
                  <span className="market-gallery-code">{accent.label}</span>
                </span>
                <span className="market-gallery-body">
                  <span className="market-gallery-type">{activeLabel}</span>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  <small>{item.promptHint}</small>
                </span>
                <span className="market-gallery-action">
                  {isCreating ? <Loader2 size={14} className="market-state-spin" /> : <Plus size={14} />}
                  {isCreating ? '加入中' : '加入任务'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
