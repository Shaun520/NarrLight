/**
 * 关系编辑面板组件（T180）
 *
 * 双击连线时弹出，支持新增 / 删除 / 修改关系类型与标签。
 * 采用 Modal 形式（受控组件），由父组件控制 open 状态。
 *
 * 字段：
 *   - 关系类型（family/friend/lover/enemy/colleague/conspiracy/other）
 *   - 明线标签 / 暗线标签
 *   - 是否明线 / 是否暗线（可同时存在）
 *   - 强度（strong/medium/fatal）
 *
 * 对齐数据库 character_relations 表字段。
 */
'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import {
  RELATION_TYPE_LABEL,
  RELATION_STRENGTH_LABEL,
  type RelationEdge,
  type RelationNode,
  type RelationType,
  type RelationStrength,
} from '@/lib/services/relation-extractor';

export interface RelationEditorProps {
  /** 是否打开 */
  open: boolean;
  /** 编辑中的边（null=新增模式） */
  edge: RelationEdge | null;
  /** 模式：新增 / 编辑 */
  mode: 'create' | 'edit';
  /** 当前剧本的全部节点（用于 source/target 选择器） */
  nodes: RelationNode[];
  /** 关闭回调 */
  onClose: () => void;
  /** 保存回调（提交一个 edge 对象，新增时 id 可由父组件生成） */
  onSubmit: (edge: RelationEdge) => void;
  /** 删除回调（仅 edit 模式可见） */
  onDelete?: (edgeId: string) => void;
}

/** 表单初始值 */
function buildInitialForm(edge: RelationEdge | null): RelationEdge {
  if (edge) return { ...edge };
  return {
    id: '',
    source: '',
    target: '',
    relationType: 'other',
    label: '',
    hiddenLabel: '',
    isVisible: true,
    isHiddenRelation: false,
    strength: 'medium',
  };
}

/**
 * 关系编辑面板（Modal 弹窗）
 */
export default function RelationEditor({
  open,
  edge,
  mode,
  nodes,
  onClose,
  onSubmit,
  onDelete,
}: RelationEditorProps) {
  const [form, setForm] = useState<RelationEdge>(buildInitialForm(edge));

  // edge 变化时同步表单
  useEffect(() => {
    setForm(buildInitialForm(edge));
  }, [edge, open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  /** 更新表单字段 */
  const update = <K extends keyof RelationEdge>(key: K, value: RelationEdge[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** 提交表单 */
  const handleSubmit = () => {
    // 基本校验：source / target 必填且不能相同
    if (!form.source || !form.target) return;
    if (form.source === form.target) return;
    // 至少要有一条线（明线或暗线）
    if (!form.isVisible && !form.isHiddenRelation) return;
    onSubmit(form);
  };

  /** 删除当前关系 */
  const handleDelete = () => {
    if (mode === 'edit' && form.id && onDelete) {
      onDelete(form.id);
    }
  };

  const relationTypes = Object.keys(RELATION_TYPE_LABEL) as RelationType[];
  const strengths = Object.keys(RELATION_STRENGTH_LABEL) as RelationStrength[];

  return (
    <div
      className="relation-editor-mask"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? '新增关系' : '编辑关系'}
      onClick={onClose}
    >
      <div
        className="relation-editor-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="re-head">
          <h3>{mode === 'create' ? '新增关系' : '编辑关系'}</h3>
          <button
            type="button"
            className="re-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>

        <div className="re-body">
          {/* 起点 / 终点 */}
          <div className="re-row re-row-2">
            <div className="re-field">
              <label className="re-label">起点</label>
              <select
                className="re-select"
                value={form.source}
                onChange={(e) => update('source', e.target.value)}
              >
                <option value="">选择人物…</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}（{n.roleIdentity}）
                  </option>
                ))}
              </select>
            </div>
            <div className="re-field">
              <label className="re-label">终点</label>
              <select
                className="re-select"
                value={form.target}
                onChange={(e) => update('target', e.target.value)}
              >
                <option value="">选择人物…</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}（{n.roleIdentity}）
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 关系类型 */}
          <div className="re-field">
            <label className="re-label">关系类型</label>
            <div className="re-type-grid">
              {relationTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`re-type-chip ${form.relationType === t ? 'active' : ''}`}
                  onClick={() => update('relationType', t)}
                >
                  {RELATION_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* 明暗线开关 */}
          <div className="re-row re-toggles">
            <label className={`re-toggle ${form.isVisible ? 'on light' : ''}`}>
              <input
                type="checkbox"
                checked={form.isVisible}
                onChange={(e) => update('isVisible', e.target.checked)}
              />
              <span className="re-toggle-text">明线 · 玩家可见</span>
            </label>
            <label className={`re-toggle ${form.isHiddenRelation ? 'on dark' : ''}`}>
              <input
                type="checkbox"
                checked={form.isHiddenRelation}
                onChange={(e) => update('isHiddenRelation', e.target.checked)}
              />
              <span className="re-toggle-text">暗线 · 真相复盘</span>
            </label>
          </div>

          {/* 明线标签 */}
          {form.isVisible ? (
            <div className="re-field">
              <label className="re-label">明线标签（玩家可见）</label>
              <input
                type="text"
                className="re-input"
                placeholder="如：兄弟 / 主仆 / 旧识"
                value={form.label}
                onChange={(e) => update('label', e.target.value)}
                maxLength={50}
              />
            </div>
          ) : null}

          {/* 暗线标签 */}
          {form.isHiddenRelation ? (
            <div className="re-field">
              <label className="re-label">暗线标签（真相复盘）</label>
              <input
                type="text"
                className="re-input"
                placeholder="如：债主 / 共谋 / 灭口"
                value={form.hiddenLabel}
                onChange={(e) => update('hiddenLabel', e.target.value)}
                maxLength={50}
              />
            </div>
          ) : null}

          {/* 强度 */}
          <div className="re-field">
            <label className="re-label">强度</label>
            <div className="re-strength-row">
              {strengths.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`re-strength-chip ${form.strength === s ? `active ${s}` : ''}`}
                  onClick={() => update('strength', s)}
                >
                  {RELATION_STRENGTH_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="re-foot">
          {mode === 'edit' ? (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              <Trash2 size={14} />
              删除
            </button>
          ) : null}
          <div className="re-foot-right">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              <Save size={14} />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
