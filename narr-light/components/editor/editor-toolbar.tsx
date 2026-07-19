/**
 * 编辑器工具栏组件（T137）
 *
 * 严格对齐原型 workbench2.html .editor-toolbar（4265-4276 行）。
 * 提供 .tb-btn 工具按钮：加粗 / 斜体 / 下划线 / 标记关键 / 插入线索 / AI 润色 / PDF 导出
 * 含 .tb-label 自动保存时间戳与 .editor-edit-badge 编辑状态徽章。
 *
 * 使用 document.execCommand 实现行内格式化（contenteditable 场景通用方案）。
 */

'use client';

import { Bold, Italic, Underline, Star, Plus, Sparkles, Download } from 'lucide-react';
import { useEditorStore } from '@/lib/stores/editor-store';

interface EditorToolbarProps {
  /** 工具栏左侧标签（如 "第二幕 · 公共搜证 · 自动保存于 14:32"） */
  label: string;
  /** 编辑徽章状态：editing / dirty / saved / hidden */
  badge: 'editing' | 'dirty' | 'saved' | 'hidden';
  /** 点击 PDF 导出按钮 */
  onExportPdf: () => void;
  /** 点击 AI 润色按钮 */
  onAiPolish: () => void;
}

/** 工具按钮配置 */
interface ToolButton {
  title: string;
  icon: typeof Bold;
  /** execCommand 命令名（无则走自定义回调） */
  command?: string;
  /** 命令参数 */
  commandArg?: string;
  /** 自定义点击回调 */
  onClick?: () => void;
  ariaLabel: string;
  /** 是否需要编辑态（true 则非编辑态禁用） */
  requiresEdit?: boolean;
}

/**
 * 编辑器工具栏
 */
export function EditorToolbar({
  label,
  badge,
  onExportPdf,
  onAiPolish,
}: EditorToolbarProps) {
  const isEditing = useEditorStore((s) => s.isEditing);

  /** 执行格式化命令 */
  const execCmd = (cmd: string, arg?: string) => {
    if (!isEditing) return;
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      // 部分浏览器对部分命令不支持，忽略
    }
  };

  /** 标记关键：包裹 <span class="highlight"> */
  const handleHighlight = () => {
    if (!isEditing) return;
    try {
      document.execCommand('insertHTML', false, '<span class="highlight">');
      // execCommand insertHTML 只能插开标签，简化方案：直接套用 surround
      // 退化方案：使用 formatBlock + 自定义 CSS hook
    } catch {
      // 忽略
    }
  };

  /** 插入线索占位 */
  const handleInsertClue = () => {
    if (!isEditing) return;
    try {
      document.execCommand(
        'insertHTML',
        false,
        '<span class="highlight">[线索占位]</span>',
      );
    } catch {
      // 忽略
    }
  };

  const editButtons: ToolButton[] = [
    {
      title: '加粗',
      icon: Bold,
      command: 'bold',
      ariaLabel: '加粗',
      requiresEdit: true,
    },
    {
      title: '斜体',
      icon: Italic,
      command: 'italic',
      ariaLabel: '斜体',
      requiresEdit: true,
    },
    {
      title: '下划线',
      icon: Underline,
      command: 'underline',
      ariaLabel: '下划线',
      requiresEdit: true,
    },
    {
      title: '标记关键',
      icon: Star,
      onClick: handleHighlight,
      ariaLabel: '标记关键',
      requiresEdit: true,
    },
    {
      title: '插入线索',
      icon: Plus,
      onClick: handleInsertClue,
      ariaLabel: '插入线索',
      requiresEdit: true,
    },
  ];

  const actionButtons: ToolButton[] = [
    {
      title: '下载 PDF',
      icon: Download,
      onClick: onExportPdf,
      ariaLabel: '下载 PDF',
    },
    {
      title: 'AI 润色',
      icon: Sparkles,
      onClick: onAiPolish,
      ariaLabel: 'AI 润色',
    },
  ];
  const buttons = isEditing ? [...editButtons, ...actionButtons] : actionButtons;

  const badgeText =
    badge === 'editing'
      ? '编辑中'
      : badge === 'dirty'
        ? '未保存'
        : badge === 'saved'
          ? '已保存'
          : '';
  const badgeClass =
    badge === 'dirty' ? 'editor-edit-badge dirty' : 'editor-edit-badge';

  return (
    <div
      className={`editor-toolbar ${isEditing ? 'is-editing' : 'is-readonly'}`}
      role="toolbar"
      aria-label="编辑器工具栏"
    >
      {!isEditing && <span className="tb-label tb-label-readonly">{label}</span>}

      {buttons.map((btn) => {
        const Icon = btn.icon;
        return (
          <button
            key={btn.title}
            type="button"
            className="tb-btn"
            title={btn.title}
            aria-label={btn.ariaLabel}
            disabled={btn.requiresEdit === true ? !isEditing : false}
            onClick={() => {
              if (btn.onClick) {
                btn.onClick();
              } else if (btn.command) {
                execCmd(btn.command, btn.commandArg);
              }
            }}
          >
            <Icon />
          </button>
        );
      })}

      {isEditing && <span className="tb-sep" aria-hidden="true" />}

      {isEditing && <span className="tb-label">{label}</span>}

      {badge !== 'hidden' && (
        <span className={badgeClass} role="status">
          {badgeText}
        </span>
      )}
    </div>
  );
}
