/**
 * 剧本状态管理 - useScriptStore
 *
 * 维护当前剧本、剧本列表及加载状态。
 * 通过 updateCurrentScript 支持局部更新当前剧本。
 */

import { create } from 'zustand';
import type { Script } from '@/types';

interface ScriptState {
  /** 当前正在编辑/查看的剧本 */
  currentScript: Script | null;
  /** 剧本列表 */
  scripts: Script[];
  /** 是否正在加载 */
  isLoading: boolean;
  setCurrentScript: (script: Script | null) => void;
  setScripts: (scripts: Script[]) => void;
  setLoading: (isLoading: boolean) => void;
  updateCurrentScript: (patch: Partial<Script>) => void;
}

export const useScriptStore = create<ScriptState>((set) => ({
  currentScript: null,
  scripts: [],
  isLoading: false,
  setCurrentScript: (script) => set({ currentScript: script }),
  setScripts: (scripts) => set({ scripts }),
  setLoading: (isLoading) => set({ isLoading }),
  updateCurrentScript: (patch) =>
    set((state) => ({
      currentScript: state.currentScript
        ? { ...state.currentScript, ...patch }
        : state.currentScript,
    })),
}));
