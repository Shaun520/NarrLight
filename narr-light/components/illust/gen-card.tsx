/**
 * 生成结果卡（T186）
 *
 * 单张插画生成结果展示，支持三种状态：
 *   - done    已生成：展示图片 + 模型 + seed + 采用/重绘/放大操作
 *   - loading 生成中：环形进度 + 预计耗时
 *   - empty   空状态：占位图标 + 等待生成
 *
 * 视觉与 class 命名对齐原型 workbench2.html #view-illust .gen-card
 */
import { ImagePlus } from 'lucide-react';

/** 生成结果卡数据（判别联合） */
export type GenCardData =
  | {
      /** 已生成 */
      status: 'done';
      /** 图片地址（支持渐变背景或 url） */
      image: string;
      /** 模型名，如 DeepSeek-V4 */
      model: string;
      /** 随机种子 */
      seed: number;
    }
  | {
      /** 生成中 */
      status: 'loading';
      /** 进度百分比 0-100 */
      progress: number;
      /** 模型/状态文案，如 "多模态 · 生成中" */
      model: string;
      /** 预计耗时文案，如 "预计 12s" */
      eta: string;
    }
  | {
      /** 空状态 */
      status: 'empty';
    };

/** 操作按钮回调（可选） */
export interface GenCardActions {
  /** 采用 → 锁定资产 */
  onAdopt?: () => void;
  /** 重绘 → 重新生成该资产 */
  onRegenerate?: () => void;
  /** 放大 → 高清放大 */
  onUpscale?: () => void;
}

interface GenCardProps {
  card: GenCardData;
  actions?: GenCardActions;
}

/**
 * 生成结果卡组件
 */
export function GenCard({ card, actions }: GenCardProps) {
  if (card.status === 'empty') {
    return (
      <div className="gen-card gen-empty">
        <div className="gen-img">
          <ImagePlus size={36} strokeWidth={1.5} />
        </div>
        <div className="gen-meta">
          <span className="gen-model">等待生成</span>
        </div>
      </div>
    );
  }

  if (card.status === 'loading') {
    return (
      <div className="gen-card gen-loading">
        <div className="gen-img">
          <div className="gen-progress">
            <div className="gp-ring" />
            <div className="gp-text">{card.progress}%</div>
          </div>
        </div>
        <div className="gen-meta">
          <span className="gen-model">{card.model}</span>
          <span className="gen-seed">{card.eta}</span>
        </div>
      </div>
    );
  }

  // done
  return (
    <div className="gen-card">
      <div className="gen-img" style={{ background: card.image }} />
      <div className="gen-meta">
        <span className="gen-model">{card.model}</span>
        <span className="gen-seed">seed {card.seed}</span>
      </div>
      <div className="gen-actions">
        <button type="button" className="ga-btn" onClick={actions?.onAdopt}>
          采用
        </button>
        <button type="button" className="ga-btn" onClick={actions?.onRegenerate}>
          重绘
        </button>
        <button type="button" className="ga-btn" onClick={actions?.onUpscale}>
          放大
        </button>
      </div>
    </div>
  );
}

export default GenCard;
