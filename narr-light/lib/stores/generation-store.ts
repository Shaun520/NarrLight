/**
 * 生成任务状态管理 - useGenerationStore
 *
 * 维护当前生成任务、进度百分比、流式输出内容。
 * appendStream 用于追加流式片段；clearStream 用于清空缓冲区。
 */

import { create } from 'zustand';
import type { GenerationTask } from '@/types';

interface GenerationState {
  /** 当前生成任务 */
  currentTask: GenerationTask | null;
  /** 进度百分比 0-100 */
  progress: number;
  /** 流式输出累积内容 */
  streamContent: string;
  /** 是否正在生成 */
  isGenerating: boolean;
  setTask: (task: GenerationTask | null) => void;
  setProgress: (progress: number) => void;
  appendStream: (chunk: string) => void;
  clearStream: () => void;
  setGenerating: (isGenerating: boolean) => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  currentTask: null,
  progress: 0,
  streamContent: '',
  isGenerating: false,
  setTask: (task) => set({ currentTask: task }),
  setProgress: (progress) => set({ progress }),
  appendStream: (chunk) =>
    set((state) => ({ streamContent: state.streamContent + chunk })),
  clearStream: () => set({ streamContent: '' }),
  setGenerating: (isGenerating) => set({ isGenerating }),
}));
