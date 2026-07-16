/**
 * 时间轴组件（垂直时间线 · 创作者视图）
 *
 * 改为垂直卡片布局，彻底解决横向 swimlane 事件重叠、刻度不直观的问题。
 * 每条事件一张卡片，按时间顺序垂直排列；按天/幕次分组；支持角色色标识、
 * 事件类型标记、冲突标记。
 */
'use client';

import { useMemo } from 'react';
import type { TimelineEvent } from '@/lib/validation/timeline/extractor';
import { computeTimeWindow } from '@/lib/validation/timeline/time-window';

/** 时间线轨道行（角色 + 事件） */
export interface TimelineLane {
  characterId: string;
  characterName: string;
  characterColor: string;
  events: TimelineEvent[];
}

interface TimelineChartProps {
  /** 轨道列表（按角色顺序） */
  lanes: TimelineLane[];
  /** 冲突事件 ID 集合 */
  conflictEventIds: Set<string>;
  /** 仅显示冲突事件 */
  onlyConflicts?: boolean;
  /** 点击事件回调 */
  onSelectEvent?: (event: TimelineEvent) => void;
  /** 时间轴窗口（分钟）。可选，不传时从 events 自动计算 */
  timeWindow?: { start: number; end: number };
}

/** 分钟数 → HH:MM */
function minuteToLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

/** 事件类型 → 标记符号、颜色、中文名 */
function getEventTypeMeta(eventType: string): { symbol: string; color: string; label: string } {
  switch (eventType) {
    case 'murder':
      return { symbol: '✕', color: '#dc2626', label: '谋杀' };
    case 'search':
      return { symbol: '?', color: '#2563eb', label: '搜证' };
    case 'flashback':
      return { symbol: '«»', color: '#7c3aed', label: '闪回' };
    case 'monologue':
      return { symbol: '…', color: '#9ca3af', label: '独白' };
    case 'revelation':
      return { symbol: '!', color: '#d4a017', label: ' revelation' };
    default:
      return { symbol: '', color: '', label: '普通' };
  }
}

/** 线索线 → 中文名 */
function threadLabel(thread?: string): string {
  switch (thread) {
    case 'main':
      return '主线';
    case 'subplot':
      return '支线';
    case 'trick':
      return '诡计';
    default:
      return thread || '主线';
  }
}

/**
 * 垂直时间轴组件
 */
export function TimelineChart({
  lanes,
  conflictEventIds,
  onlyConflicts = false,
  onSelectEvent,
  timeWindow,
}: TimelineChartProps) {
  // 汇总所有事件
  const allEvents = useMemo(
    () => lanes.flatMap((lane) => lane.events),
    [lanes],
  );

  // 时间窗口（仅用于空状态提示，垂直布局不再需要位置计算）
  const window = useMemo(() => {
    if (timeWindow) return timeWindow;
    return computeTimeWindow(allEvents);
  }, [timeWindow, allEvents]);

  // 拍平、过滤、排序事件
  const items = useMemo(() => {
    const list = allEvents
      .filter((e) => !onlyConflicts || conflictEventIds.has(e.id))
      .map((event) => ({
        event,
        sortKey: (event.day ?? 1) * 1440 + event.startMinutes,
      }));
    list.sort((a, b) => a.sortKey - b.sortKey);
    return list;
  }, [allEvents, onlyConflicts, conflictEventIds]);

  // 按天分组
  const grouped = useMemo(() => {
    const map = new Map<number, typeof items>();
    for (const item of items) {
      const day = item.event.day ?? 1;
      const arr = map.get(day) ?? [];
      arr.push(item);
      map.set(day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="timeline-wrap timeline-empty">
        <div className="timeline-empty-content">
          <span className="timeline-empty-icon">◇</span>
          <p>当前筛选条件下没有时间线事件</p>
          <span className="timeline-empty-hint">
            时间窗口：{minuteToLabel(window.start)} – {minuteToLabel(window.end)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-wrap vertical-timeline">
      {grouped.map(([day, dayItems]) => (
        <section key={day} className="vt-day-section">
          <div className="vt-day-header">
            <span className="vt-day-badge">第 {day} 天</span>
            <span className="vt-day-line" />
          </div>

          <div className="vt-events">
            {dayItems.map(({ event }) => {
              const isConflict = conflictEventIds.has(event.id);
              const meta = getEventTypeMeta(event.eventType);
              const extraParticipants = Math.max(0, (event.participants?.length ?? 0) - 1);
              return (
                <TimelineEventCard
                  key={event.id}
                  event={event}
                  isConflict={isConflict}
                  typeMeta={meta}
                  extraParticipants={extraParticipants}
                  onClick={() => onSelectEvent?.(event)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 单个事件卡片 */
function TimelineEventCard({
  event,
  isConflict,
  typeMeta,
  extraParticipants,
  onClick,
}: {
  event: TimelineEvent;
  isConflict: boolean;
  typeMeta: { symbol: string; color: string; label: string };
  extraParticipants: number;
  onClick: () => void;
}) {
  return (
    <div
      className={`vt-event-card${isConflict ? ' conflict' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* 左侧时间轴线 + 节点 */}
      <div className="vt-event-axis">
        <div className="vt-axis-line" />
        <span
          className="vt-event-node"
          style={{ background: event.characterColor, borderColor: event.characterColor }}
        />
        <span className="vt-event-time">{event.startTime}</span>
      </div>

      {/* 右侧内容卡片 */}
      <div
        className="vt-event-body"
        style={{ borderLeftColor: event.characterColor }}
      >
        <div className="vt-event-main">
          <div className="vt-event-title-row">
            <span
              className="vt-char-dot"
              style={{ background: event.characterColor }}
              aria-hidden
            />
            <span className="vt-char-name">{event.characterName}</span>
            {typeMeta.symbol && (
              <span
                className="vt-type-tag"
                style={{ color: typeMeta.color, borderColor: typeMeta.color }}
                title={typeMeta.label}
              >
                {typeMeta.symbol} {typeMeta.label}
              </span>
            )}
            {isConflict && (
              <span className="vt-conflict-tag" title="存在时间线冲突">
                冲突
              </span>
            )}
          </div>

          <h4 className="vt-event-name">{event.eventName}</h4>

          <div className="vt-event-meta">
            <span className="vt-meta-item">
              {event.startTime} – {event.endTime}
            </span>
            {event.location && (
              <span className="vt-meta-item vt-location">📍 {event.location}</span>
            )}
            {extraParticipants > 0 && (
              <span className="vt-meta-item">+{extraParticipants} 人参与</span>
            )}
            {event.thread && event.thread !== 'main' && (
              <span className="vt-meta-item vt-thread">{threadLabel(event.thread)}</span>
            )}
          </div>
        </div>

        {event.description && (
          <p className="vt-event-desc">{event.description}</p>
        )}
      </div>
    </div>
  );
}
