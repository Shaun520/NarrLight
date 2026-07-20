/**
 * 线索与复盘双向跳转（T175）
 *
 * 提供线索 → 真相复盘段落的双向跳转入口。
 * 点击后由父级路由跳转至复盘模块并定位到对应段落（FR：线索与复盘双向联动查看）。
 */
'use client';

import { ArrowRightLeft, ExternalLink } from 'lucide-react';
import type { Clue } from './clue-card';

interface TruthLinkProps {
  /** 当前线索（携带 relatedTruth 标识） */
  clue: Clue;
  /** 跳转回调 */
  onJump?: (clue: Clue) => void;
  /** 展示方向文案，默认 "跳转真相复盘" */
  label?: string;
  /** 是否为反向（复盘 → 线索），影响图标与文案 */
  reverse?: boolean;
}

/**
 * 真相复盘跳转按钮
 */
export function TruthLink({ clue, onJump, label, reverse = false }: TruthLinkProps) {
  const text = label ?? (reverse ? '返回线索卡' : '跳转真相复盘');
  return (
    <button
      type="button"
      className="truth-link"
      onClick={() => onJump?.(clue)}
      data-truth-id={clue.relatedTruth ?? ''}
    >
      <ArrowRightLeft size={13} />
      <span>{text}</span>
      <ExternalLink size={12} />
    </button>
  );
}

export default TruthLink;
