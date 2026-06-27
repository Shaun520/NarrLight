/**
 * AI 智能调整面板组件（T139）
 *
 * 严格对齐原型 workbench2.html .ai-adjust-box（4302-4311 行）。
 * 含 5 个 .quick-prompt 快捷指令 + 自定义 textarea + "执行调整"按钮。
 *
 * 快捷指令：润色文采 / 增强悬疑 / 补充细节 / 调整节奏 / 统一风格
 */

'use client';

import { useState } from 'react';
import { Cpu } from 'lucide-react';

interface AiAdjustPanelProps {
  /** 执行调整回调，传入用户最终指令 */
  onExecute: (instruction: string) => void;
}

/** 5 个快捷指令（对齐任务说明） */
const QUICK_PROMPTS: string[] = [
  '润色文采',
  '增强悬疑',
  '补充细节',
  '调整节奏',
  '统一风格',
];

/**
 * AI 智能调整面板
 */
export function AiAdjustPanel({ onExecute }: AiAdjustPanelProps) {
  const [instruction, setInstruction] = useState('');

  const handleQuickPrompt = (prompt: string) => {
    setInstruction(prompt);
  };

  const handleExecute = () => {
    if (!instruction.trim()) return;
    onExecute(instruction.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className="ai-adjust-box">
      <h4>
        <Cpu />
        AI 智能调整
      </h4>

      {QUICK_PROMPTS.map((prompt) => (
        <div
          key={prompt}
          className="quick-prompt"
          role="button"
          tabIndex={0}
          onClick={() => handleQuickPrompt(prompt)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleQuickPrompt(prompt);
            }
          }}
        >
          {prompt}
        </div>
      ))}

      <textarea
        className="ai-adjust-textarea"
        placeholder="或输入自定义调整指令…"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="自定义调整指令"
      />

      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={handleExecute}
        disabled={!instruction.trim()}
        style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
      >
        执行调整
      </button>
    </div>
  );
}
