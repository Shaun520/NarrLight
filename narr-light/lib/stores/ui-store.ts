/**
 * UI 状态管理 - useUIStore
 *
 * 维护当前视图、侧栏折叠状态等全局 UI 配置。
 */

import { create } from 'zustand';

interface UIState {
  /** 当前视图标识 */
  currentView: string;
  /** 侧栏是否折叠 */
  sidebarCollapsed: boolean;
  setView: (view: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'editor',
  sidebarCollapsed: false,
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
