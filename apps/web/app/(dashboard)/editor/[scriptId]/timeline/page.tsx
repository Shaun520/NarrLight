/**
 * 时间线校验页（T146 · 视图4）
 *
 * 路由：/editor/[scriptId]/timeline
 *
 * 严格参照原型 workbench2.html #view-timeline 结构：
 *   1. .page-head         页头（标题 + 印章 + 导出报告 / 重新校验）
 *   2. .timeline-toolbar  角色筛选 .filter-chip + 幕次筛选 + "仅看冲突"开关
 *   3. .timeline-wrap     时间轴（TimelineChart 组件，可横滚 min-width 760px）
 *   4. .conflict-list     冲突列表（TimelineConflictList 组件，含"前往修正"按钮）
 *
 * 数据加载：
 *   - 页面 mount 时 POST /api/validate { scriptId } 加载真实事件与冲突
 *   - 并行 fetch /api/editor/{scriptId} 获取剧本标题
 *   - 422 响应视为"内容不足"空状态，非 2xx 视为错误
 *
 * 手动修正（T150）：
 *   - 点击冲突项"前往修正"按钮 → 跳转到编辑器对应位置
 *     URL: /editor/[scriptId]?act=N&char=charId&event=eventId
 *   - 点击"重新校验"按钮 → 重新调用 Edge Function 拉取最新数据
 *
 * 客户端组件：管理 selectedChars / selectedAct / onlyConflicts 状态。
 */
'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Download, Sparkles, X, MapPin, Users, Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import {
  TimelineChart,
  type TimelineLane,
} from '@/components/visualization/timeline-chart';
import { TimelineConflictList } from '@/components/visualization/timeline-conflict-list';
import {
  ConflictDetector,
  type ConflictItem,
} from '@/lib/validation/timeline/conflict-detector';
import type { TimelineEvent } from '@/lib/validation/timeline/extractor';
import { computeTimeWindow } from '@/lib/validation/timeline/time-window';
import { exportTimelineReportPdf } from '@/lib/export/timeline-report-pdf';
import './timeline.css';

/** 时间线维度：按角色 / 按地点 / 按幕次 */
type TimelineDimension = 'character' | 'location' | 'act';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

/* =========================================================
 * 角色元信息（由 events 派生，不再硬编码）
 * ========================================================= */
interface CharacterMeta {
  id: string;
  name: string;
  color: string;
}

/** 幕次选项 */
const ACT_OPTIONS: readonly (number | 'all')[] = ['all', 1, 2, 3];

/** 幕次标签 */
function actLabel(act: number | 'all'): string {
  if (act === 'all') return '全部幕次';
  const labels = ['第一幕', '第二幕', '第三幕'];
  return labels[act - 1] ?? `第${act}幕`;
}

/** Toast 提示状态（对齐编辑器页 save-toast 模式） */
interface ToastState {
  visible: boolean;
  message: string;
  icon: string;
}

/** /api/validate 成功响应体 */
interface ValidateResponse {
  scriptId: string;
  events: TimelineEvent[];
  conflicts: ConflictItem[];
  stats: {
    totalEvents: number;
    totalConflicts: number;
    severeCount: number;
    warningCount: number;
    hintCount: number;
    narrativeTrickCount: number;
  };
  reportId: string | null;
  createdAt: string;
}

/** /api/validate 错误响应体（422 与 5xx 共用） */
interface ValidateErrorResponse {
  error: string;
  scriptId: string;
  events?: TimelineEvent[];
  conflicts?: ConflictItem[];
}

/** /api/editor/[scriptId] 响应体（仅关心 scriptTitle 字段） */
interface EditorBundleWithTitle {
  scriptTitle?: string;
  dataMap?: Record<string, unknown>;
  groups?: unknown[];
  labels?: Record<string, string>;
  defaultNodeId?: string;
}

/** loadTimeline 返回值：成功时携带最新 events 与 conflicts */
interface LoadTimelineResult {
  events: TimelineEvent[];
  conflicts: ConflictItem[];
}

/**
 * 从 events 派生角色列表（按 characterId 聚合去重）。
 * 保留 events 中的原始 characterColor（已由 TimelineExtractor 按 sort_order 取模生成）。
 */
function deriveCharacters(events: TimelineEvent[]): CharacterMeta[] {
  const map = new Map<string, CharacterMeta>();
  for (const e of events) {
    if (map.has(e.characterId)) continue;
    map.set(e.characterId, {
      id: e.characterId,
      name: e.characterName,
      color: e.characterColor,
    });
  }
  return Array.from(map.values());
}

/**
 * 时间线校验页
 */
export default function TimelinePage({ params }: PageProps) {
  const { scriptId } = use(params);
  const router = useRouter();

  // 状态：选中角色（多选）/ 选中幕次（单选）/ 仅看冲突 / 维度切换
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [selectedAct, setSelectedAct] = useState<number | 'all'>('all');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [dimension, setDimension] = useState<TimelineDimension>('character');

  // 事件数据 / 角色列表 / 剧本标题（由真实接口加载）
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [characters, setCharacters] = useState<CharacterMeta[]>([]);
  const [scriptTitle, setScriptTitle] = useState('');

  // 加载状态：loading=首次加载 / loadError=加载失败 / emptyHint=422 友好提示
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  // 重新校验中（按钮 loading）
  const [validating, setValidating] = useState(false);
  // 时间线结构重新生成中（422 空态时触发）
  const [regenerating, setRegenerating] = useState(false);

  // Toast 反馈
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    icon: '✓',
  });

  // 选中查看详情的事件
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  // ref 同步存储最新加载错误信息，供 handleRevalidate 即时读取
  const loadErrorRef = useRef<string | null>(null);

  // Toast 自动消失
  useEffect(() => {
    if (!toast.visible) return;
    const timer = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [toast.visible, toast.message]);

  /** 显示 Toast */
  const showToast = (message: string, icon = '✓') => {
    setToast({ visible: true, message, icon });
  };

  // 冲突检测
  const detector = useMemo(() => new ConflictDetector(), []);
  const conflicts: ConflictItem[] = useMemo(
    () => detector.detect(events),
    [detector, events],
  );
  const conflictEventIds = useMemo(
    () => new Set(conflicts.flatMap((c) => c.eventIds)),
    [conflicts],
  );

  // 筛选后的事件（按维度裁剪：角色维度应用角色+幕次筛选；地点维度仅幕次；幕次维度不筛选）
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // 按幕次维度：不应用任何筛选
      if (dimension === 'act') return true;
      // 按地点维度：只应用幕次筛选，忽略角色筛选
      if (dimension === 'location') {
        if (selectedAct !== 'all' && e.actOrder !== selectedAct) return false;
        return true;
      }
      // 按角色维度：应用角色 + 幕次筛选
      if (!selectedChars.has(e.characterId)) return false;
      if (selectedAct !== 'all' && e.actOrder !== selectedAct) return false;
      return true;
    });
  }, [events, dimension, selectedChars, selectedAct]);

  // 自适应时间窗口（从全量 events 计算，客户端安全）
  const timeWindow = useMemo(() => computeTimeWindow(events), [events]);

  // 按维度分组成轨道
  const lanes: TimelineLane[] = useMemo(() => {
    // 按地点分组：从 filteredEvents 提取唯一 location（非空）
    if (dimension === 'location') {
      const locationMap = new Map<string, TimelineEvent[]>();
      filteredEvents.forEach((e) => {
        if (!e.location) return;
        const arr = locationMap.get(e.location) ?? [];
        arr.push(e);
        locationMap.set(e.location, arr);
      });
      return Array.from(locationMap.entries()).map(([location, evts], idx) => ({
        characterId: `loc-${idx}`,
        characterName: location,
        characterColor: '#666',
        events: evts,
      }));
    }
    // 按幕次分组：从 filteredEvents 提取唯一 actOrder
    if (dimension === 'act') {
      const actMap = new Map<number, TimelineEvent[]>();
      filteredEvents.forEach((e) => {
        const arr = actMap.get(e.actOrder) ?? [];
        arr.push(e);
        actMap.set(e.actOrder, arr);
      });
      return Array.from(actMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([actOrder, evts]) => ({
          characterId: `act-${actOrder}`,
          characterName: `第${actOrder}幕`,
          characterColor: '#666',
          events: evts,
        }));
    }
    // 按角色分组（现有逻辑）
    return characters.filter((c) => selectedChars.has(c.id)).map((c) => ({
      characterId: c.id,
      characterName: c.name,
      characterColor: c.color,
      events: filteredEvents.filter((e) => e.characterId === c.id),
    }));
  }, [filteredEvents, characters, selectedChars, dimension]);

  /**
   * 加载时间线数据：POST /api/validate 携带 { scriptId }
   * 并行 fetch /api/editor/${scriptId} 获取剧本标题。
   *
   * - 422 响应：设置 emptyHint 友好提示，清空 events，不视为错误
   * - 非 2xx 响应：解析 error 字段，设置 loadError
   * - 成功：setEvents + 派生 characters，清空 loadError/emptyHint
   *
   * 返回最新的 { events, conflicts }，供调用方（如重新校验）即时使用；
   * 失败时返回 null（loadError 同步写入 loadErrorRef 供即时读取）。
   */
  const loadTimeline = async (id: string): Promise<LoadTimelineResult | null> => {
    loadErrorRef.current = null;

    // 并行：校验接口 + 编辑器接口（取 scriptTitle）
    const [validateRes, editorRes] = await Promise.all([
      fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: id }),
      }),
      fetch(`/api/editor/${id}`, { cache: 'no-store' }).catch(() => null),
    ]);

    // 解析剧本标题（容错：失败不影响时间线展示）
    if (editorRes && editorRes.ok) {
      try {
        const editorData = (await editorRes.json()) as EditorBundleWithTitle;
        if (editorData.scriptTitle) {
          setScriptTitle(editorData.scriptTitle);
        }
      } catch {
        // 忽略 JSON 解析失败
      }
    }

    // 解析校验响应
    let validateData: ValidateResponse | ValidateErrorResponse;
    try {
      validateData = (await validateRes.json()) as ValidateResponse | ValidateErrorResponse;
    } catch {
      const msg = '校验响应解析失败';
      setLoadError(msg);
      loadErrorRef.current = msg;
      setEvents([]);
      setCharacters([]);
      setLoading(false);
      return null;
    }

    // 422：内容不足，友好提示（不视为错误）
    if (validateRes.status === 422) {
      const errBody = validateData as ValidateErrorResponse;
      setEmptyHint(errBody.error || '未提取到时间线事件，请先在剧本中标注时间点');
      setEvents([]);
      setCharacters([]);
      setLoadError(null);
      setLoading(false);
      return { events: [], conflicts: [] };
    }

    // 非 2xx：错误
    if (!validateRes.ok) {
      const errBody = validateData as ValidateErrorResponse;
      const msg = errBody.error || `校验失败（${validateRes.status}）`;
      setLoadError(msg);
      loadErrorRef.current = msg;
      setEvents([]);
      setCharacters([]);
      setLoading(false);
      return null;
    }

    // 成功
    const okBody = validateData as ValidateResponse;
    const newEvents = okBody.events ?? [];
    const newConflicts = okBody.conflicts ?? detector.detect(newEvents);
    setEvents(newEvents);
    setCharacters(deriveCharacters(newEvents));
    setLoadError(null);
    setEmptyHint(null);
    setLoading(false);
    return { events: newEvents, conflicts: newConflicts };
  };

  // 页面 mount 时加载真实数据
  useEffect(() => {
    loadTimeline(scriptId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId]);

  // 角色列表派生后默认全选
  useEffect(() => {
    setSelectedChars(new Set(characters.map((c) => c.id)));
  }, [characters]);

  /* ===== 事件处理 ===== */

  /** 切换角色筛选 */
  const toggleChar = (charId: string) => {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) {
        next.delete(charId);
      } else {
        next.add(charId);
      }
      return next;
    });
  };

  /** 切换幕次筛选 */
  const selectAct = (act: number | 'all') => {
    setSelectedAct(act);
  };

  /** 切换仅看冲突 */
  const toggleOnlyConflicts = () => {
    setOnlyConflicts((prev) => !prev);
  };

  /** 跳转到编辑器对应位置（T150 手动修正） */
  const handleJumpToFix = (conflict: ConflictItem) => {
    const act = conflict.actOrders[0] ?? 1;
    const charId = conflict.characterIds[0] ?? '';
    const eventId = conflict.eventIds[0] ?? '';
    const params = new URLSearchParams({
      act: String(act),
      char: charId,
      event: eventId,
      from: 'timeline',
    });
    router.push(`/editor/${scriptId}?${params.toString()}`);
  };

  /** 重试加载（点击错误态重试按钮） */
  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    loadErrorRef.current = null;
    loadTimeline(scriptId);
  };

  /**
   * 重新校验：调用 loadTimeline 复用同一加载逻辑，
   * 成功后用返回值即时计算冲突数并显示 Toast。
   */
  const handleRevalidate = async () => {
    if (validating) return;
    setValidating(true);
    showToast('正在重新校验时间线…', '◌');

    try {
      const result = await loadTimeline(scriptId);
      if (result === null) {
        showToast(`校验失败：${loadErrorRef.current ?? '未知错误'}`, '✗');
      } else {
        const severeCount = result.conflicts.filter((c) => c.severity === 'severe').length;
        showToast(
          `校验完成 · 共 ${result.conflicts.length} 条冲突（严重 ${severeCount}）`,
          severeCount > 0 ? '!' : '✓',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      showToast(`校验失败：${msg}`, '✗');
    } finally {
      setValidating(false);
    }
  };

  /**
   * 重新生成时间线结构：当 /api/validate 返回 422（timeline_events 表为空且
   * acts/scenes 文本无 HH:MM 时间点）时，调用 /api/timeline/regenerate 触发
   * timeline-structure 阶段，把 truth_reviews.timeline_full 的自然语言时间描述
   * 结构化为 timeline_events 行；成功后自动重新校验。
   */
  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    showToast('正在生成时间线结构…', '◌');

    try {
      const res = await fetch('/api/timeline/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        eventCount?: number;
        mode?: string;
        error?: string;
      };

      if (!res.ok || !data.success) {
        const msg = data.error ?? `生成失败（${res.status}）`;
        showToast(`生成失败：${msg}`, '✗');
        setRegenerating(false);
        return;
      }

      showToast(
        `时间线结构生成完成 · ${data.eventCount} 条事件（${data.mode === 'real' ? 'AI' : '占位'}）`,
        '✓',
      );

      // 生成成功后清空 emptyHint 并重新校验
      setEmptyHint(null);
      setLoading(true);
      setRegenerating(false);
      await loadTimeline(scriptId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      showToast(`生成失败：${msg}`, '✗');
      setRegenerating(false);
    }
  };

  /**
   * 导出报告：通过隐藏 iframe 打印方案生成 PDF（浏览器打印对话框另存为 PDF）。
   * 内容包含时间线图、冲突列表、角色时间表。
   */
  const handleExport = () => {
    try {
      exportTimelineReportPdf({
        scriptId,
        scriptTitle: scriptTitle || '未命名剧本',
        events,
        conflicts,
        characters: characters.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        })),
        validatedAt: Date.now(),
      });
      showToast('已唤起打印对话框，选择"另存为 PDF"即可下载', '⤓');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      showToast(`导出失败：${msg}`, '✗');
    }
  };

  /** 点击事件块：打开详情弹窗 */
  const handleSelectEvent = (event: TimelineEvent) => {
    setSelectedEvent(event);
  };

  /** 从详情弹窗跳转到编辑器对应位置 */
  const handleEditEvent = (event: TimelineEvent) => {
    const params = new URLSearchParams({
      act: String(event.actOrder),
      char: event.characterId,
      event: event.id,
      from: 'timeline',
    });
    router.push(`/editor/${scriptId}?${params.toString()}`);
  };

  return (
    <div className="timeline-page">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            时间线校验 <span className="seal">P1</span>
          </h1>
          <div className="page-desc">
            全角色时间轴可视化 · 自动标注时序冲突 · 支持手动修正
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <Download size={15} />
            导出报告
          </button>
          <button
            type="button"
            className={`btn btn-primary ${validating ? 'is-loading' : ''}`}
            onClick={handleRevalidate}
            disabled={validating || loading || regenerating}
          >
            <RefreshCw size={15} />
            {validating ? '校验中…' : '重新校验'}
          </button>
        </div>
      </div>

      {/* ===== 工具栏 ===== */}
      <div className="timeline-toolbar">
        {/* 第一行：维度切换 */}
        <div className="tb-row">
          <span className="tb-label">视图</span>
          <div className="tl-dimension-switcher">
            {([
              { key: 'character', label: '按角色' },
              { key: 'location', label: '按地点' },
              { key: 'act', label: '按幕次' },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`filter-chip ${dimension === opt.key ? 'active' : ''}`}
                onClick={() => setDimension(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 第二行：角色筛选（仅按角色维度显示） */}
        {dimension === 'character' && characters.length > 0 && (
          <div className="tb-row">
            <span className="tb-label">角色</span>
            <div className="tl-char-filters">
              {characters.map((c) => (
                <div
                  key={c.id}
                  className={`filter-chip ${selectedChars.has(c.id) ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleChar(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleChar(c.id);
                    }
                  }}
                >
                  <span className="swatch" style={{ background: c.color }} aria-hidden />
                  {c.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 第三行：幕次筛选 + 仅看冲突 */}
        <div className="tb-row">
          <span className="tb-label">过滤</span>
          {/* 幕次筛选：按幕次维度下不显示 */}
          {dimension !== 'act' &&
            ACT_OPTIONS.map((act) => (
              <div
                key={String(act)}
                className={`filter-chip ${selectedAct === act ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => selectAct(act)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectAct(act);
                  }
                }}
              >
                {actLabel(act)}
              </div>
            ))}
          <div
            className={`filter-chip chip-conflict ${onlyConflicts ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={toggleOnlyConflicts}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleOnlyConflicts();
              }
            }}
          >
            仅看冲突
          </div>
        </div>
      </div>

      {/* ===== 主体：根据加载状态条件渲染 ===== */}
      {loading ? (
        <div
          className="timeline-wrap"
          style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--sepia, #7a5c3a)' }}
        >
          正在加载时间线…
        </div>
      ) : loadError ? (
        <div className="timeline-wrap" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: 'var(--blood, #8a1c1c)', marginBottom: '12px' }}>
            加载失败：{loadError}
          </p>
          <button type="button" className="btn btn-ghost" onClick={handleRetry}>
            <RefreshCw size={15} />
            重试
          </button>
        </div>
      ) : emptyHint ? (
        <div
          className="timeline-wrap"
          style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--sepia, #7a5c3a)' }}
        >
          <p style={{ marginBottom: 16 }}>◇ {emptyHint}</p>
          <button
            type="button"
            className={`btn btn-primary ${regenerating ? 'is-loading' : ''}`}
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            <Sparkles size={15} />
            {regenerating ? '生成中…' : '生成时间线结构'}
          </button>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            将从「真相复盘」的 timeline_full 中识别时间点并按角色拆分结构化事件
          </p>
        </div>
      ) : (
        <>
          {/* ===== 时间轴 ===== */}
          <TimelineChart
            lanes={lanes}
            conflictEventIds={conflictEventIds}
            onlyConflicts={onlyConflicts}
            onSelectEvent={handleSelectEvent}
            timeWindow={timeWindow}
          />

          {/* ===== 冲突列表 ===== */}
          <TimelineConflictList conflicts={conflicts} onJumpToFix={handleJumpToFix} />
        </>
      )}

      {/* ===== 事件详情弹窗 ===== */}
      {selectedEvent && (
        <div
          className="tl-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div className="tl-modal">
            <button
              type="button"
              className="tl-modal-close"
              onClick={() => setSelectedEvent(null)}
              aria-label="关闭"
            >
              <X size={16} />
            </button>

            <div className="tl-modal-head">
              <span
                className="tl-modal-color"
                style={{ background: selectedEvent.characterColor }}
              />
              <div>
                <h3>{selectedEvent.eventName}</h3>
                <p>
                  {selectedEvent.characterName} · 第{selectedEvent.actOrder}幕
                  {selectedEvent.day && selectedEvent.day > 1 ? ` · 第${selectedEvent.day}天` : ''}
                </p>
              </div>
            </div>

            <div className="tl-modal-body">
              <div className="tl-modal-row">
                <Clock size={14} />
                <span className="tl-modal-label">时间</span>
                <span className="tl-modal-value">
                  {selectedEvent.startTime} – {selectedEvent.endTime}
                </span>
              </div>

              {selectedEvent.location && (
                <div className="tl-modal-row">
                  <MapPin size={14} />
                  <span className="tl-modal-label">地点</span>
                  <span className="tl-modal-value">{selectedEvent.location}</span>
                </div>
              )}

              {selectedEvent.participants && selectedEvent.participants.length > 0 && (
                <div className="tl-modal-row">
                  <Users size={14} />
                  <span className="tl-modal-label">参与人</span>
                  <span className="tl-modal-value">
                    {selectedEvent.participants.join('、')}
                  </span>
                </div>
              )}

              {selectedEvent.thread && (
                <div className="tl-modal-row">
                  <AlertCircle size={14} />
                  <span className="tl-modal-label">线索线</span>
                  <span className="tl-modal-value">{selectedEvent.thread}</span>
                </div>
              )}

              {selectedEvent.description && (
                <div className="tl-modal-desc">
                  <span className="tl-modal-label">描述</span>
                  <p>{selectedEvent.description}</p>
                </div>
              )}

              {conflictEventIds.has(selectedEvent.id) && (
                <div className="tl-modal-conflict">
                  <AlertTriangle size={14} />
                  <span>该事件存在时间线冲突，请在下方冲突列表中查看详情。</span>
                </div>
              )}
            </div>

            <div className="tl-modal-foot">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedEvent(null)}
              >
                关闭
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleEditEvent(selectedEvent)}
              >
                前往编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      {toast.visible && (
        <div
          className={`tl-toast show ${toast.icon === '✗' ? 't-err' : toast.icon === '!' ? 't-warn' : ''}`}
          role="status"
        >
          <span className="toast-icon">{toast.icon}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
