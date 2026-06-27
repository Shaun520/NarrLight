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
 * 手动修正（T150）：
 *   - 点击冲突项"前往修正"按钮 → 跳转到编辑器对应位置
 *     URL: /editor/[scriptId]?act=N&char=charId&event=eventId
 *   - 点击"重新校验"按钮 → 重新执行 ConflictDetector.detect(events)
 *   - 修正后冲突消除，剧本对应原文更新（在编辑器侧完成）
 *
 * 客户端组件：管理 selectedChars / selectedAct / onlyConflicts 状态。
 */
'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Download } from 'lucide-react';
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
import { exportTimelineReportPdf } from '@/lib/export/timeline-report-pdf';
import './timeline.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

/* =========================================================
 * 角色元信息（6 角色配色与编辑器一致）
 * ========================================================= */
interface CharacterMeta {
  id: string;
  name: string;
  color: string;
}

const CHARACTERS: readonly CharacterMeta[] = [
  { id: 'char-1', name: '沈墨白', color: '#8a1c1c' },
  { id: 'char-2', name: '沈墨尘', color: '#b08d57' },
  { id: 'char-3', name: '柳如烟', color: '#4a7c59' },
  { id: 'char-4', name: '陈守义', color: '#3a5a7a' },
  { id: 'char-5', name: '小翠', color: '#7a5c3a' },
  { id: 'char-6', name: '周半仙', color: '#6a4a8a' },
];

/** 幕次选项 */
const ACT_OPTIONS: readonly (number | 'all')[] = ['all', 1, 2, 3];

/** 幕次标签 */
function actLabel(act: number | 'all'): string {
  if (act === 'all') return '全部幕次';
  const labels = ['第一幕', '第二幕', '第三幕'];
  return labels[act - 1] ?? `第${act}幕`;
}

/**
 * 演示期剧本标题（与 validation 页 MOCK 一致）。
 * 真实场景下应从 scriptService.getScript(scriptId) 读取。
 */
const SCRIPT_TITLE = '沈府风云';

/** Toast 提示状态（对齐编辑器页 save-toast 模式） */
interface ToastState {
  visible: boolean;
  message: string;
  icon: string;
}

/** 重新校验的 Mock 延迟（ms），模拟 Edge Function 调用 */
const REVALIDATE_MOCK_DELAY = 2000;

/* =========================================================
 * 演示事件数据（基于原型 #view-timeline）
 * 时间窗口 18:00–次日01:00，分钟数 1080–1500
 * ========================================================= */
const DEMO_EVENTS: TimelineEvent[] = [
  // 沈墨白
  {
    id: 'tl-char-1-1', scriptId: 'demo', characterId: 'char-1', characterName: '沈墨白', characterColor: '#8a1c1c',
    eventName: '抵沈宅', startTime: '18:10', endTime: '19:10', startMinutes: 1090, endMinutes: 1150,
    location: '沈宅', actOrder: 2, sortOrder: 0, isNarrativeTrick: false, trickType: '', sourceText: '18:10 沈墨白抵达沈宅',
  },
  {
    id: 'tl-char-1-2', scriptId: 'demo', characterId: 'char-1', characterName: '沈墨白', characterColor: '#8a1c1c',
    eventName: '书房会墨尘', startTime: '19:25', endTime: '20:50', startMinutes: 1165, endMinutes: 1250,
    location: '书房', actOrder: 2, sortOrder: 1, isNarrativeTrick: false, trickType: '', sourceText: '19:25 沈墨白在书房与墨尘长谈',
  },
  {
    id: 'tl-char-1-3', scriptId: 'demo', characterId: 'char-1', characterName: '沈墨白', characterColor: '#8a1c1c',
    eventName: '独往祠堂', startTime: '20:40', endTime: '22:10', startMinutes: 1240, endMinutes: 1330,
    location: '祠堂', actOrder: 2, sortOrder: 2, isNarrativeTrick: false, trickType: '', sourceText: '20:40 沈墨白独自前往祠堂',
  },
  {
    id: 'tl-char-1-4', scriptId: 'demo', characterId: 'char-1', characterName: '沈墨白', characterColor: '#8a1c1c',
    eventName: '回房歇息', startTime: '23:00', endTime: '00:00', startMinutes: 1380, endMinutes: 1440,
    location: '卧房', actOrder: 2, sortOrder: 3, isNarrativeTrick: false, trickType: '', sourceText: '23:00 沈墨白回房歇息',
  },
  {
    id: 'tl-char-1-5', scriptId: 'demo', characterId: 'char-1', characterName: '沈墨白', characterColor: '#8a1c1c',
    eventName: '被发现身亡', startTime: '00:05', endTime: '00:55', startMinutes: 1445, endMinutes: 1495,
    location: '祠堂', actOrder: 2, sortOrder: 4, isNarrativeTrick: false, trickType: '', sourceText: '00:05 沈墨白被发现身亡',
  },
  // 沈墨尘
  {
    id: 'tl-char-2-1', scriptId: 'demo', characterId: 'char-2', characterName: '沈墨尘', characterColor: '#b08d57',
    eventName: '迎兄归', startTime: '18:10', endTime: '19:00', startMinutes: 1090, endMinutes: 1140,
    location: '门口', actOrder: 2, sortOrder: 0, isNarrativeTrick: false, trickType: '', sourceText: '18:10 沈墨尘迎兄归来',
  },
  {
    id: 'tl-char-2-2', scriptId: 'demo', characterId: 'char-2', characterName: '沈墨尘', characterColor: '#b08d57',
    eventName: '书房长谈', startTime: '19:10', endTime: '20:50', startMinutes: 1150, endMinutes: 1250,
    location: '书房', actOrder: 2, sortOrder: 1, isNarrativeTrick: false, trickType: '', sourceText: '19:10 沈墨尘在书房长谈',
  },
  {
    id: 'tl-char-2-3', scriptId: 'demo', characterId: 'char-2', characterName: '沈墨尘', characterColor: '#b08d57',
    eventName: '称病在卧房', startTime: '20:50', endTime: '22:00', startMinutes: 1250, endMinutes: 1320,
    location: '卧房', actOrder: 2, sortOrder: 2, isNarrativeTrick: false, trickType: '', sourceText: '20:50 沈墨尘称病在卧房不出',
  },
  {
    id: 'tl-char-2-4', scriptId: 'demo', characterId: 'char-2', characterName: '沈墨尘', characterColor: '#b08d57',
    eventName: '院中踱步', startTime: '20:30', endTime: '21:30', startMinutes: 1230, endMinutes: 1290,
    location: '院中', actOrder: 2, sortOrder: 3, isNarrativeTrick: false, trickType: '', sourceText: '20:30 沈墨尘在院中踱步',
  },
  {
    id: 'tl-char-2-5', scriptId: 'demo', characterId: 'char-2', characterName: '沈墨尘', characterColor: '#b08d57',
    eventName: '报官', startTime: '23:45', endTime: '00:50', startMinutes: 1425, endMinutes: 1490,
    location: '衙门', actOrder: 2, sortOrder: 4, isNarrativeTrick: false, trickType: '', sourceText: '23:45 沈墨尘前往报官',
  },
  // 柳如烟
  {
    id: 'tl-char-3-1', scriptId: 'demo', characterId: 'char-3', characterName: '柳如烟', characterColor: '#4a7c59',
    eventName: '茶楼候客', startTime: '18:25', endTime: '19:25', startMinutes: 1105, endMinutes: 1165,
    location: '茶楼', actOrder: 2, sortOrder: 0, isNarrativeTrick: false, trickType: '', sourceText: '18:25 柳如烟在茶楼候客',
  },
  {
    id: 'tl-char-3-2', scriptId: 'demo', characterId: 'char-3', characterName: '柳如烟', characterColor: '#4a7c59',
    eventName: '沈宅送药', startTime: '19:40', endTime: '21:30', startMinutes: 1180, endMinutes: 1290,
    location: '沈宅', actOrder: 2, sortOrder: 1, isNarrativeTrick: false, trickType: '', sourceText: '19:40 柳如烟前往沈宅送药',
  },
  {
    id: 'tl-char-3-3', scriptId: 'demo', characterId: 'char-3', characterName: '柳如烟', characterColor: '#4a7c59',
    eventName: '药铺后院', startTime: '21:20', endTime: '22:20', startMinutes: 1280, endMinutes: 1340,
    location: '药铺', actOrder: 2, sortOrder: 2, isNarrativeTrick: false, trickType: '', sourceText: '21:20 柳如烟在药铺后院取药',
  },
  {
    id: 'tl-char-3-4', scriptId: 'demo', characterId: 'char-3', characterName: '柳如烟', characterColor: '#4a7c59',
    eventName: '归家未出', startTime: '22:40', endTime: '23:55', startMinutes: 1360, endMinutes: 1435,
    location: '家', actOrder: 2, sortOrder: 3, isNarrativeTrick: false, trickType: '', sourceText: '22:40 柳如烟归家未出',
  },
  // 周半仙
  {
    id: 'tl-char-6-1', scriptId: 'demo', characterId: 'char-6', characterName: '周半仙', characterColor: '#6a4a8a',
    eventName: '药铺坐诊', startTime: '18:15', endTime: '19:40', startMinutes: 1095, endMinutes: 1180,
    location: '药铺', actOrder: 2, sortOrder: 0, isNarrativeTrick: false, trickType: '', sourceText: '18:15 周半仙在药铺坐诊',
  },
  {
    id: 'tl-char-6-2', scriptId: 'demo', characterId: 'char-6', characterName: '周半仙', characterColor: '#6a4a8a',
    eventName: '收摊打烊', startTime: '19:50', endTime: '20:55', startMinutes: 1190, endMinutes: 1255,
    location: '药铺', actOrder: 2, sortOrder: 1, isNarrativeTrick: false, trickType: '', sourceText: '19:50 周半仙收摊打烊',
  },
  {
    id: 'tl-char-6-3', scriptId: 'demo', characterId: 'char-6', characterName: '周半仙', characterColor: '#6a4a8a',
    eventName: '后院制草药', startTime: '21:05', endTime: '22:45', startMinutes: 1265, endMinutes: 1365,
    location: '后院', actOrder: 2, sortOrder: 2, isNarrativeTrick: false, trickType: '', sourceText: '21:05 周半仙在后院制草药',
  },
  {
    id: 'tl-char-6-4', scriptId: 'demo', characterId: 'char-6', characterName: '周半仙', characterColor: '#6a4a8a',
    eventName: '早歇', startTime: '22:55', endTime: '23:50', startMinutes: 1375, endMinutes: 1430,
    location: '卧房', actOrder: 2, sortOrder: 3, isNarrativeTrick: false, trickType: '', sourceText: '22:55 周半仙早歇',
  },
];

/**
 * 时间线校验页
 */
export default function TimelinePage({ params }: PageProps) {
  const { scriptId } = use(params);
  const router = useRouter();

  // 状态：选中角色（多选）/ 选中幕次（单选）/ 仅看冲突
  const [selectedChars, setSelectedChars] = useState<Set<string>>(
    new Set(CHARACTERS.map((c) => c.id)),
  );
  const [selectedAct, setSelectedAct] = useState<number | 'all'>('all');
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  // 事件数据（演示阶段直接使用 DEMO_EVENTS，后续可由 Edge Function 注入）
  // setEvents 用于"重新校验"后刷新冲突列表
  const [events, setEvents] = useState<TimelineEvent[]>(DEMO_EVENTS);

  // 重新校验中（loading）
  const [validating, setValidating] = useState(false);

  // Toast 反馈
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    icon: '✓',
  });

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

  // 筛选后的事件
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!selectedChars.has(e.characterId)) return false;
      if (selectedAct !== 'all' && e.actOrder !== selectedAct) return false;
      return true;
    });
  }, [events, selectedChars, selectedAct]);

  // 按角色分组成轨道
  const lanes: TimelineLane[] = useMemo(() => {
    return CHARACTERS.filter((c) => selectedChars.has(c.id)).map((c) => ({
      characterId: c.id,
      characterName: c.name,
      characterColor: c.color,
      events: filteredEvents.filter((e) => e.characterId === c.id),
    }));
  }, [filteredEvents, selectedChars]);

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

  /**
   * 重新校验：调用时间线校验 Edge Function 重新提取事件并检测冲突。
   *
   * 真实调用（部署后启用）：
   *   const res = await fetch('/functions/validate', {
   *     method: 'POST',
   *     headers: { 'Content-Type': 'application/json' },
   *     body: JSON.stringify({ scriptId }),
   *   });
   *   const data = await res.json();
   *   setEvents(data.events);
   *
   * 开发期 Mock：setTimeout 2 秒模拟异步，刷新 events 触发冲突重新计算。
   */
  const handleRevalidate = async () => {
    if (validating) return;
    setValidating(true);
    showToast('正在重新校验时间线…', '◌');

    try {
      // 开发期 Mock：模拟 Edge Function 异步返回
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, REVALIDATE_MOCK_DELAY),
      );

      // 真实场景下由 Edge Function 返回最新 events；此处刷新本地副本以触发 useMemo 重算
      setEvents((prev) => prev.slice());

      const newConflicts = detector.detect(events);
      const severeCount = newConflicts.filter((c) => c.severity === 'severe').length;
      showToast(
        `校验完成 · 共 ${newConflicts.length} 条冲突（严重 ${severeCount}）`,
        severeCount > 0 ? '!' : '✓',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      showToast(`校验失败：${msg}`, '✗');
    } finally {
      setValidating(false);
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
        scriptTitle: SCRIPT_TITLE,
        events,
        conflicts,
        characters: CHARACTERS.map((c) => ({
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

  /** 点击事件块 */
  const handleSelectEvent = (event: TimelineEvent) => {
    // 跳转到编辑器对应事件位置
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
            // 全角色时间轴可视化 · 自动标注时序冲突 · 支持手动修正
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
            disabled={validating}
          >
            <RefreshCw size={15} />
            {validating ? '校验中…' : '重新校验'}
          </button>
        </div>
      </div>

      {/* ===== 工具栏 ===== */}
      <div className="timeline-toolbar">
        <span className="tb-label">按角色筛选：</span>
        {CHARACTERS.map((c) => (
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
        <div className="tb-right">
          {ACT_OPTIONS.map((act) => (
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

      {/* ===== 时间轴 ===== */}
      <TimelineChart
        lanes={lanes}
        conflictEventIds={conflictEventIds}
        onlyConflicts={onlyConflicts}
        onSelectEvent={handleSelectEvent}
      />

      {/* ===== 冲突列表 ===== */}
      <TimelineConflictList conflicts={conflicts} onJumpToFix={handleJumpToFix} />

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
