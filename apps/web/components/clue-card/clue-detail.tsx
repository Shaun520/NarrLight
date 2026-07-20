/**
 * 线索详情与关联展示（T168）
 *
 * 展示线索完整信息及跨模块关联：关联人物 / 搜证地点 / 关联真相复盘。
 * 在右侧抽屉中呈现，内部复用 TruthLink 提供真相复盘双向跳转。
 *
 * 对齐 FR-012：自动关联线索对应的人物、地点、真相信息。
 */
'use client';

import { Download, ImagePlus, MapPin, Users, FileText, Tag, Hash, X } from 'lucide-react';
import {
  ACT_LABELS,
  CLUE_TYPE_LABELS,
  PHASE_LABELS,
  type Clue,
} from './clue-card';
import { TruthLink } from './truth-link';

export interface ClueIllustrationPreview {
  imageUrl: string;
  status: 'done' | 'active' | 'pending';
  model?: string;
}

interface ClueDetailProps {
  /** 当前线索 */
  clue: Clue;
  /** 关闭抽屉 */
  onClose?: () => void;
  /** 跳转真相复盘 */
  onJumpToTruth?: (clue: Clue) => void;
  /** 为当前线索创建/打开插画任务 */
  onGenerateIllustration?: (clue: Clue) => void;
  /** 导出当前线索的插画线索卡 PNG */
  onExportPng?: (clue: Clue) => void;
  illustration?: ClueIllustrationPreview | null;
}

/**
 * 线索详情抽屉
 */
export function ClueDetail({
  clue,
  onClose,
  onJumpToTruth,
  onGenerateIllustration,
  onExportPng,
  illustration,
}: ClueDetailProps) {
  return (
    <div className="clue-detail">
      <div className="cd-head">
        <div className="cd-head-main">
          <span className="cd-code">{clue.code}</span>
          <h3 className="cd-title">{clue.title}</h3>
          <div className="cd-tags">
            <span className="cd-chip">{ACT_LABELS[clue.act]}</span>
            <span className="cd-chip">{PHASE_LABELS[clue.phase]}</span>
            <span className="cd-chip">{CLUE_TYPE_LABELS[clue.type]}</span>
            {clue.isKey && <span className="cd-chip key">关键线索</span>}
            {clue.isDistractor && <span className="cd-chip trap">干扰项</span>}
          </div>
        </div>
        {onClose && (
          <button type="button" className="cd-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="cd-body">
        {(onGenerateIllustration || onExportPng) && (
          <section className="cd-section">
            <div className="cd-action-row">
              {onGenerateIllustration && (
                <button
                  type="button"
                  className="truth-link"
                  onClick={() => onGenerateIllustration(clue)}
                >
                  <ImagePlus size={13} />
                  <span>生成线索插画</span>
                </button>
              )}
              {onExportPng && (
                <button
                  type="button"
                  className="truth-link cd-export-action"
                  onClick={() => onExportPng(clue)}
                >
                  <Download size={13} />
                  <span>导出 PNG</span>
                </button>
              )}
            </div>
          </section>
        )}

        {illustration?.imageUrl && (
          <section className="cd-section">
            <div className="cd-illustration-preview">
              <img src={illustration.imageUrl} alt={`${clue.title} 插画`} />
              <div className="cd-illustration-meta">
                <ImagePlus size={13} />
                <span>{illustration.model ?? '已生成插画'}</span>
              </div>
            </div>
          </section>
        )}

        <section className="cd-section">
          <div className="cd-section-title">
            <FileText size={13} /> 线索正文
          </div>
          <p className="cd-text">{clue.text}</p>
        </section>

        <section className="cd-section">
          <div className="cd-section-title">
            <MapPin size={13} /> 搜证地点
          </div>
          <div className="cd-location">
            <span className="cd-loc-name">{clue.location}</span>
            {clue.owner && <span className="cd-owner">归属：{clue.owner}</span>}
          </div>
        </section>

        <section className="cd-section">
          <div className="cd-section-title">
            <Users size={13} /> 关联人物
          </div>
          {clue.relatedCharacters && clue.relatedCharacters.length > 0 ? (
            <div className="cd-chars">
              {clue.relatedCharacters.map((name) => (
                <span key={name} className="cd-char">{name}</span>
              ))}
            </div>
          ) : (
            <div className="cd-empty-inline">暂无关联人物</div>
          )}
        </section>

        <section className="cd-section">
          <div className="cd-section-title">
            <Tag size={13} /> 编号与标识
          </div>
          <div className="cd-meta-row">
            <span className="cd-meta-item"><Hash size={12} /> {clue.code}</span>
            {typeof clue.unlockLevel === 'number' && clue.unlockLevel > 0 && (
              <span className="cd-meta-item unlock">解锁层级 L{clue.unlockLevel}</span>
            )}
          </div>
        </section>

        {clue.relatedTruth && (
          <section className="cd-section">
            <div className="cd-section-title">
              <FileText size={13} /> 关联真相复盘
            </div>
            <TruthLink clue={clue} onJump={onJumpToTruth} />
          </section>
        )}
      </div>
    </div>
  );
}

export default ClueDetail;
