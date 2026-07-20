/**
 * 漏洞项组件（T156）
 *
 * 对齐原型 workbench2.html #view-logic .vuln-item 结构：
 *   .vuln-item.sev-{err|warn|info|trick}
 *     .vuln-head        (.vuln-sev + .vuln-type)
 *     .vuln-title
 *     .vuln-desc
 *     .vuln-loc
 *     .vuln-suggest
 *     .vuln-actions     (一键修复 / 跳转原文 / 标记叙诡)
 *
 * 客户端组件：动作按钮通过 props 回调上抛，由父页面处理服务调用。
 * 叙诡（NARRATIVE_TRICK）项不显示建议与"一键修复 / 标记叙诡"按钮。
 */
'use client';

import { Bookmark, ExternalLink, Wrench } from 'lucide-react';
import type { ValidationIssue } from '@/lib/validation/logic/issue-classifier';
import {
  SEVERITY_BADGE_CSS,
  SEVERITY_CSS,
  SEVERITY_LABEL,
} from '@/lib/validation/logic/issue-classifier';

interface VulnItemProps {
  issue: ValidationIssue;
  /** 一键按建议修复 */
  onAutoFix?: (issue: ValidationIssue) => void;
  /** 跳转原文并高亮 */
  onLocate?: (issue: ValidationIssue) => void;
  /** 标记为叙诡（仅非叙诡项显示） */
  onMarkAsTrick?: (issue: ValidationIssue) => void;
  /** 修复中状态（按钮禁用 + loading） */
  fixing?: boolean;
  /** 已修复状态（展示"已修复"徽章 + 虚化） */
  fixed?: boolean;
}

/** 标签徽章文字（s-err / s-warn / s-info / s-trick） */
const SEVERITY_BADGE_TEXT: Record<ValidationIssue['severity'], string> = {
  CRITICAL: '严重缺陷',
  WARNING: '局部警告',
  SUGGESTION: '优化提示',
  NARRATIVE_TRICK: '叙诡识别',
};

export function VulnItem({
  issue,
  onAutoFix,
  onLocate,
  onMarkAsTrick,
  fixing = false,
  fixed = false,
}: VulnItemProps) {
  const isTrick = issue.severity === 'NARRATIVE_TRICK';

  const classNames = [
    'vuln-item',
    SEVERITY_CSS[issue.severity],
    fixed ? 'is-fixed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames}>
      <div className="vuln-head">
        <span className={`vuln-sev ${SEVERITY_BADGE_CSS[issue.severity]}`}>
          {SEVERITY_BADGE_TEXT[issue.severity]}
        </span>
        <span className="vuln-type">{issue.type}</span>
      </div>

      <div className="vuln-title">{issue.title}</div>
      <div className="vuln-desc">{issue.description}</div>
      <div className="vuln-loc">▸ {issue.location}</div>

      {!isTrick && issue.suggestion ? (
        <div className="vuln-suggest">{issue.suggestion}</div>
      ) : null}

      <div className="vuln-actions">
        {!isTrick && issue.autoFixable && !fixed ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={fixing}
            onClick={() => onAutoFix?.(issue)}
          >
            <Wrench size={13} />
            {fixing ? '修复中…' : '一键按建议修复'}
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onLocate?.(issue)}
        >
          <ExternalLink size={13} />
          跳转原文
        </button>

        {!isTrick && !fixed ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onMarkAsTrick?.(issue)}
          >
            <Bookmark size={13} />
            标记为叙诡
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** 等级标签便捷导出（页面 tab 文案） */
export { SEVERITY_LABEL };
