/**
 * 插画资产列表组件（T184）
 *
 * 左栏资产列表 `.card`，包含头部计数（ASSET LIST · N / 已完成 N）与场景项。
 * 受控组件：由父级传入 activeType 与 selectedAssetId，本组件负责按类型筛选
 * （hidden-by-type）与状态展示（done ✓ / active ● / pending ○）。
 *
 * 视觉与 class 命名对齐原型 workbench2.html #view-illust .scene-item
 */
import { Plus, Search, X } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';

/** 插画资产类型（对齐 .if-tab[data-itype]） */
export type AssetType = 'cover' | 'scene' | 'clue' | 'public' | 'char' | 'poster';

/** 资产类型 + 全部，用于筛选 tab */
export type AssetFilter = AssetType | 'all';

/** 资产生成状态 */
export type AssetStatus = 'done' | 'active' | 'pending';

/** 插画资产 */
export interface IllustrationAsset {
  id: string;
  /** 资产类型 */
  type: AssetType;
  /** 标题，如 "药铺后院 · 柴房" */
  title: string;
  /** 副标题，如 "第二幕 · 生成中 68%" */
  sub: string;
  /** 生成状态 */
  status: AssetStatus;
  /** 缩略图背景（CSS background 简写，含渐变 + url） */
  thumb: string;
  /** 生成中进度（仅 active 状态有效） */
  progress?: number;
}

/** 类型 tab 展示配置（顺序对齐原型 .illust-filter） */
export const ASSET_TYPE_TABS: { type: AssetFilter; label: string }[] = [
  { type: 'all', label: '全部' },
  { type: 'cover', label: '剧本封面' },
  { type: 'scene', label: '场景插画' },
  { type: 'clue', label: '线索卡插画' },
  { type: 'public', label: '公共线插画' },
  { type: 'char', label: '人物立绘' },
  { type: 'poster', label: '宣传海报' },
];

/**
 * 按类型统计资产数量，返回 each type 的 count + 总数 + 已完成数。
 * 用于 .illust-filter 的 .if-count 与页头 seal。
 */
export function countAssetsByType(assets: IllustrationAsset[]): {
  counts: Record<AssetFilter, number>;
  total: number;
  done: number;
} {
  const counts: Record<AssetFilter, number> = {
    all: assets.length,
    cover: 0,
    scene: 0,
    clue: 0,
    public: 0,
    char: 0,
    poster: 0,
  };
  let done = 0;
  for (const a of assets) {
    counts[a.type] += 1;
    if (a.status === 'done') done += 1;
  }
  return { counts, total: assets.length, done };
}

/** 缩略图渐变调色板（按类型区分色调） */
const thumb = (seed: string, hue: string): string =>
  `linear-gradient(135deg, ${hue}), url('https://picsum.photos/seed/${seed}/80/80?grayscale') center/cover`;

/**
 * 默认插画资产数据（24 项，6 类）。
 * 类型分布：封面6 / 场景7 / 线索卡4 / 公共线2 / 人物立绘3 / 海报2
 * 状态分布：已完成12 · 生成中1 · 待生成11
 */
export const DEFAULT_ILLUST_ASSETS: IllustrationAsset[] = [
  // ===== 封面 cover（3 done / 3 pending） =====
  { id: 'cover-1', type: 'cover', title: '全本封面 · 雨夜古镇', sub: '封面 · 已生成', status: 'done', thumb: thumb('narrRainyTown', 'rgba(58,42,26,0.55),rgba(26,20,16,0.65)') },
  { id: 'cover-2', type: 'cover', title: '沈墨白 · 剧本封面', sub: '封面 · 已生成', status: 'done', thumb: thumb('narrCoverShenMobai', 'rgba(58,42,26,0.7),rgba(26,20,16,0.8)') },
  { id: 'cover-3', type: 'cover', title: '沈墨尘 · 剧本封面', sub: '封面 · 已生成', status: 'done', thumb: thumb('narrCoverShenMochen', 'rgba(42,42,58,0.7),rgba(26,20,16,0.8)') },
  { id: 'cover-4', type: 'cover', title: '柳如烟 · 剧本封面', sub: '封面 · 待生成', status: 'pending', thumb: thumb('narrCoverLiu', 'rgba(26,42,42,0.7),rgba(26,20,16,0.8)') },
  { id: 'cover-5', type: 'cover', title: '沈墨白 · 副封面', sub: '封面 · 待生成', status: 'pending', thumb: thumb('narrCoverSub', 'rgba(58,42,26,0.7),rgba(42,26,20,0.8)') },
  { id: 'cover-6', type: 'cover', title: '群像 · 六人封面', sub: '封面 · 待生成', status: 'pending', thumb: thumb('narrCoverGroup', 'rgba(42,26,42,0.7),rgba(26,20,16,0.8)') },

  // ===== 场景 scene（4 done / 1 active / 2 pending） =====
  { id: 'scene-1', type: 'scene', title: '沈宅书房 · 暗格', sub: '第二幕 · 已生成', status: 'done', thumb: thumb('narrStudy', 'rgba(42,26,42,0.55),rgba(26,20,16,0.65)') },
  { id: 'scene-2', type: 'scene', title: '祠堂厢房 · 族谱', sub: '第二幕 · 已生成', status: 'done', thumb: thumb('narrShrine', 'rgba(26,42,42,0.55),rgba(26,20,16,0.65)') },
  { id: 'scene-3', type: 'scene', title: '码头 · 夜泊', sub: '第一幕 · 已生成', status: 'done', thumb: thumb('narrDock', 'rgba(26,42,58,0.55),rgba(26,20,16,0.65)') },
  { id: 'scene-4', type: 'scene', title: '茶楼 · 雅间', sub: '第一幕 · 已生成', status: 'done', thumb: thumb('narrTeahouse', 'rgba(58,42,26,0.55),rgba(26,20,16,0.65)') },
  { id: 'scene-5', type: 'scene', title: '药铺后院 · 柴房', sub: '第二幕 · 生成中 68%', status: 'active', progress: 68, thumb: thumb('narrHerb', 'rgba(58,42,26,0.55),rgba(42,26,26,0.65)') },
  { id: 'scene-6', type: 'scene', title: '真相复盘 · 凶案现场', sub: '复盘 · 待生成', status: 'pending', thumb: thumb('narrCrime', 'rgba(42,26,26,0.7),rgba(26,20,16,0.8)') },
  { id: 'scene-7', type: 'scene', title: '沈宅 · 灵堂', sub: '第三幕 · 待生成', status: 'pending', thumb: thumb('narrMourning', 'rgba(26,26,42,0.7),rgba(26,20,16,0.8)') },

  // ===== 线索卡 clue（2 done / 2 pending） =====
  { id: 'clue-1', type: 'clue', title: '三张借据 · 道具特写', sub: '线索卡 · 已生成', status: 'done', thumb: thumb('narrIou', 'rgba(58,42,26,0.7),rgba(26,20,16,0.8)') },
  { id: 'clue-2', type: 'clue', title: '信件 · 邮戳', sub: '线索卡 · 已生成', status: 'done', thumb: thumb('narrLetter', 'rgba(42,42,26,0.7),rgba(26,20,16,0.8)') },
  { id: 'clue-3', type: 'clue', title: '族谱残页 · 道具特写', sub: '线索卡 · 待生成', status: 'pending', thumb: thumb('narrGenealogy', 'rgba(26,42,42,0.7),rgba(26,20,16,0.8)') },
  { id: 'clue-4', type: 'clue', title: '怀表 · 停滞', sub: '线索卡 · 待生成', status: 'pending', thumb: thumb('narrWatch', 'rgba(42,26,26,0.7),rgba(26,20,16,0.8)') },

  // ===== 公共线 public（1 done / 1 pending） =====
  { id: 'public-1', type: 'public', title: '公共线 · 雨夜街景', sub: '公共线 · 已生成', status: 'done', thumb: thumb('narrPublicRain', 'rgba(58,90,122,0.5),rgba(26,20,16,0.7)') },
  { id: 'public-2', type: 'public', title: '公共线 · 晨雾渡口', sub: '公共线 · 待生成', status: 'pending', thumb: thumb('narrPublicFog', 'rgba(58,90,122,0.5),rgba(26,20,16,0.8)') },

  // ===== 人物立绘 char（1 done / 2 pending） =====
  { id: 'char-1', type: 'char', title: '沈墨白 · 人物立绘', sub: '人物 · 已生成', status: 'done', thumb: thumb('narrShenMobai', 'rgba(58,42,26,0.7),rgba(26,20,16,0.8)') },
  { id: 'char-2', type: 'char', title: '柳如烟 · 人物立绘', sub: '人物 · 待生成', status: 'pending', thumb: thumb('narrLiuRuyan', 'rgba(58,42,26,0.7),rgba(26,20,16,0.8)') },
  { id: 'char-3', type: 'char', title: '沈墨尘 · 人物立绘', sub: '人物 · 待生成', status: 'pending', thumb: thumb('narrShenMochen', 'rgba(42,42,58,0.7),rgba(26,20,16,0.8)') },

  // ===== 海报 poster（1 done / 1 pending） =====
  { id: 'poster-1', type: 'poster', title: '主海报 · 招募', sub: '海报 · 已生成', status: 'done', thumb: thumb('narrPosterMain', 'rgba(106,74,138,0.5),rgba(26,20,16,0.8)') },
  { id: 'poster-2', type: 'poster', title: '横版海报 · 详情页', sub: '海报 · 待生成', status: 'pending', thumb: thumb('narrPosterWide', 'rgba(106,74,138,0.5),rgba(26,20,16,0.8)') },
];

interface AssetListProps {
  assets: IllustrationAsset[];
  /** 当前激活的类型筛选 */
  activeType: AssetFilter;
  /** 当前选中的资产 ID（高亮显示） */
  selectedAssetId?: string;
  /** 选中资产回调 */
  onSelect?: (asset: IllustrationAsset) => void;
  onGenerate?: (asset: IllustrationAsset) => void;
}

function buildThumbStyle(thumb: string): CSSProperties {
  if (thumb.startsWith('http') || thumb.startsWith('data:image/')) {
    return { backgroundImage: `url("${thumb}")` };
  }
  return { background: thumb };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isFuzzyMatch(source: string, keyword: string): boolean {
  if (!keyword) return true;

  const text = normalizeSearchText(source);
  if (text.includes(keyword)) return true;

  let cursor = 0;
  for (const char of keyword) {
    cursor = text.indexOf(char, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

/** 状态图标映射 */
/**
 * 资产列表组件
 */
function StatusIcon(props: { status: AssetStatus }) {
  void props;
  return null;
}

export function AssetList({
  assets,
  activeType,
  selectedAssetId,
  onSelect,
  onGenerate,
}: AssetListProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const normalizedKeyword = normalizeSearchText(searchKeyword);
  const visible = useMemo(
    () =>
      assets.filter((asset) => {
        const matchesType = activeType === 'all' || asset.type === activeType;
        if (!matchesType) return false;
        if (!normalizedKeyword) return true;
        return isFuzzyMatch(
          `${asset.title} ${asset.sub} ${asset.type} ${asset.id}`,
          normalizedKeyword,
        );
      }),
    [activeType, assets, normalizedKeyword],
  );
  const doneCount = visible.filter((a) => a.status === 'done').length;

  return (
    <div className="card illust-asset-card">
      <div className="illust-asset-head">
        <span>ASSET LIST · {visible.length}</span>
        <span className="iah-progress">已完成 {doneCount}</span>
      </div>
      <div className="illust-asset-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={searchKeyword}
          placeholder="搜索任务、类型、编号..."
          aria-label="搜索插画任务"
          onChange={(event) => setSearchKeyword(event.target.value)}
        />
        {searchKeyword ? (
          <button
            type="button"
            className="ias-clear"
            aria-label="清空搜索"
            onClick={() => setSearchKeyword('')}
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
      <div className="illust-asset-scroll">
        {visible.length === 0 ? (
          <div className="illust-asset-empty">没有匹配的插画任务</div>
        ) : null}
        {visible.map((asset) => {
          const isSelected = asset.id === selectedAssetId;
          const classNames = [
            'scene-item',
            asset.status === 'done' ? 'done' : '',
            asset.status === 'pending' ? 'pending' : '',
            asset.status === 'active' ? 'active' : '',
            isSelected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={asset.id}
              className={classNames}
              data-itype={asset.type}
              onClick={() => onSelect?.(asset)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(asset);
                }
              }}
            >
              <button
                type="button"
                className="si-thumb si-thumb-action"
                style={buildThumbStyle(asset.thumb)}
                title={asset.status === 'done' ? '重新生成' : '开始生成'}
                aria-label={`${asset.status === 'done' ? '重新生成' : '开始生成'}：${asset.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(asset);
                  onGenerate?.(asset);
                }}
              >
                <Plus size={16} />
              </button>
              <div className="si-info">
                <div className="si-title">{asset.title}</div>
                <div className="si-sub">{asset.sub}</div>
              </div>
              <button
                type="button"
                className="si-status-button"
                title="选择任务"
                aria-label={`选择任务：${asset.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(asset);
                }}
              >
                <StatusIcon status={asset.status} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AssetList;
