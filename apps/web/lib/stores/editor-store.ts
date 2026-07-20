/**
 * 编辑器状态管理 - useEditorStore
 *
 * 维护当前节点、当前幕次索引、编辑态及未保存变更标记。
 * isDirty 用于指示是否存在未保存的内容变更。
 */

import { create } from 'zustand';

interface EditorState {
  /** 当前选中的节点 ID */
  currentNodeId: string | null;
  /** 当前幕次索引 */
  currentActIdx: number;
  /** 是否处于编辑模式 */
  isEditing: boolean;
  /** 是否有未保存变更 */
  isDirty: boolean;
  setCurrentNode: (nodeId: string) => void;
  setActIdx: (idx: number) => void;
  enterEditMode: () => void;
  exitEditMode: () => void;
  markDirty: () => void;
  markSaved: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  currentNodeId: null,
  currentActIdx: 0,
  isEditing: false,
  isDirty: false,
  setCurrentNode: (nodeId) => set({ currentNodeId: nodeId }),
  setActIdx: (idx) => set({ currentActIdx: idx }),
  enterEditMode: () => set({ isEditing: true }),
  exitEditMode: () => set({ isEditing: false }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false }),
}));
