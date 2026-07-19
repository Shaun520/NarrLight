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

export interface AiPolishState {
  status: 'idle' | 'ready' | 'loading' | 'result' | 'error';
  sourceText: string;
  mode: string;
  resultText: string;
  error: string;
}

interface AiAdjustPanelProps {
  /** 执行调整回调，传入用户最终指令 */
  onExecute: (instruction: string) => void;
  polish: AiPolishState;
  onPolishModeChange: (mode: string) => void;
  onGeneratePolish: (mode: string, instruction: string) => void;
  onApplyPolishReplace: () => void;
  onApplyPolishInsert: () => void;
  onClearPolish: () => void;
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
export function AiAdjustPanel({
  onExecute,
  polish,
  onPolishModeChange,
  onGeneratePolish,
  onApplyPolishReplace,
  onApplyPolishInsert,
  onClearPolish,
}: AiAdjustPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [polishInstruction, setPolishInstruction] = useState('');

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

      {polish.status !== 'idle' && (
        <section className="ai-polish-card" aria-label="AI 润色建议">
          <div className="ai-polish-head">
            <span>润色建议</span>
            <button type="button" onClick={onClearPolish}>
              关闭
            </button>
          </div>

          <div className="ai-polish-label">原文</div>
          <div className="ai-polish-source">{polish.sourceText}</div>

          <div className="quick-prompt-grid compact">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                type="button"
                key={prompt}
                className={`quick-prompt ${polish.mode === prompt ? 'active' : ''}`}
                onClick={() => onPolishModeChange(prompt)}
                disabled={polish.status === 'loading'}
              >
                {prompt}
              </button>
            ))}
          </div>

          <textarea
            className="ai-adjust-textarea"
            placeholder="可补充润色要求，例如：更克制、减少现代词、保留第一人称…"
            value={polishInstruction}
            onChange={(e) => setPolishInstruction(e.target.value)}
            disabled={polish.status === 'loading'}
            aria-label="AI 润色补充要求"
          />

          <button
            type="button"
            className="ai-adjust-submit"
            onClick={() => onGeneratePolish(polish.mode, polishInstruction)}
            disabled={polish.status === 'loading'}
          >
            {polish.status === 'loading' ? '生成中...' : '生成建议'}
          </button>

          {polish.status === 'error' && <div className="ai-polish-error">{polish.error}</div>}

          {polish.status === 'result' && (
            <>
              <div className="ai-polish-label">建议稿</div>
              <div className="ai-polish-result">{polish.resultText}</div>
              <div className="ai-polish-actions">
                <button type="button" onClick={onApplyPolishReplace}>
                  替换原文
                </button>
                <button type="button" onClick={onApplyPolishInsert}>
                  插入到下方
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="quick-prompt-grid">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            type="button"
            key={prompt}
            className={`quick-prompt ${instruction === prompt ? 'active' : ''}`}
            onClick={() => handleQuickPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

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
        className="ai-adjust-submit"
        onClick={handleExecute}
        disabled={!instruction.trim()}
      >
        执行调整
      </button>
    </div>
  );
}
