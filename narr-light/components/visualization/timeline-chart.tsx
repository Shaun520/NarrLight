/**
 * 时间轴组件（T147 · 视图4）
 *
 * 严格对齐原型 workbench2.html #view-timeline 的 .tl-axis 结构：
 *   - .tl-axis（grid: 140px 1fr）
 *   - .tl-time-header（自适应 6–10 个时间刻度）
 *   - 每角色一行：.tl-char（角色名 + 色块）+ .tl-track（轨道，含 .tl-event）
 *
 * .tl-event 使用 absolute 定位，left% / width% 由分钟数映射到自适应时间窗口。
 * 冲突事件加 .conflict 类，触发 conflictPulse 动画。
 * 支持跨天显示：日界处渲染半透明竖带 + 「Day N」标签。
 * 事件块含事件类型图标与参与角色数量。
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

/** 已计算位置的事件（left% / width%） */
export interface PositionedEvent {
  event: TimelineEvent;
  leftPct: number;
  widthPct: number;
}

/** 带位置信息的轨道行 */
export type PositionedLane = Omit<TimelineLane, 'events'> & {
  events: PositionedEvent[];
};

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

/** 分钟数 → HH:MM 标签（跨天取模 1440） */
function minuteToLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

/** 根据时间窗口生成 6–10 个均匀刻度 */
function generateTimeTicks(
  startMin: number,
  endMin: number,
): { minute: number; label: string }[] {
  const totalMin = endMin - startMin;
  // 目标 6-10 个刻度
  const targetCount = Math.min(10, Math.max(6, Math.round(totalMin / 60)));
  const step = totalMin / targetCount;
  const ticks: { minute: number; label: string }[] = [];
  for (let i = 0; i <= targetCount; i++) {
    const minute = Math.round(startMin + step * i);
    ticks.push({ minute, label: minuteToLabel(minute) });
  }
  return ticks;
}

/** 事件类型 → 标记符号与颜色 */
function getEventTypeMark(eventType: string): { symbol: string; color: string } {
  switch (eventType) {
    case 'murder':
      return { symbol: '✕', color: '#dc2626' };
    case 'search':
      return { symbol: '?', color: '#2563eb' };
    case 'flashback':
      return { symbol: '«»', color: '#7c3aed' };
    case 'monologue':
      return { symbol: '…', color: '#9ca3af' };
    case 'revelation':
      return { symbol: '!', color: '#d4a017' };
    default:
      return { symbol: '', color: '' };
  }
}

/**
 * 时间轴组件
 */
export function TimelineChart({
  lanes,
  conflictEventIds,
  onlyConflicts = false,
  onSelectEvent,
  timeWindow,
}: TimelineChartProps) {
  // 汇总所有事件（用于自动计算时间窗口与日界）
  const allEvents = useMemo(
    () => lanes.flatMap((lane) => lane.events),
    [lanes],
  );

  // 计算时间窗口：优先用 props，否则从事件自动计算
  const window = useMemo(() => {
    if (timeWindow) return timeWindow;
    return computeTimeWindow(allEvents);
  }, [timeWindow, allEvents]);

  const windowSpan = window.end - window.start;

  // 生成时间刻度
  const ticks = useMemo(
    () => generateTimeTicks(window.start, window.end),
    [window],
  );

  // 计算日界位置（day > 1 的天，边界在 (day-1)*1440 分钟处）
  const dayBoundaries = useMemo(() => {
    const daySet = new Set<number>();
    allEvents.forEach((e) => {
      if (e.day && e.day > 1) daySet.add(e.day);
    });
    const boundaries: { day: number; leftPct: number }[] = [];
    daySet.forEach((day) => {
      const boundaryMin = (day - 1) * 1440;
      const leftPct = ((boundaryMin - window.start) / windowSpan) * 100;
      // 仅渲染窗口内的日界
      if (leftPct > 0 && leftPct < 100) {
        boundaries.push({ day, leftPct });
      }
    });
    return boundaries.sort((a, b) => a.leftPct - b.leftPct);
  }, [allEvents, window, windowSpan]);

  // 计算每个事件的位置百分比
  const positionedLanes = useMemo(() => {
    return lanes.map((lane) => ({
      ...lane,
      events: lane.events
        .map((event) => {
          const leftPct = ((event.startMinutes - window.start) / windowSpan) * 100;
          const widthPct =
            ((event.endMinutes - event.startMinutes) / windowSpan) * 100;
          return { event, leftPct, widthPct };
        })
        .filter((item) => {
          if (!onlyConflicts) return true;
          return conflictEventIds.has(item.event.id);
        }),
    }));
  }, [lanes, onlyConflicts, conflictEventIds, window, windowSpan]);

  return (
    <div className="timeline-wrap">
      <div className="tl-axis" style={{ position: 'relative' }}>
        {/* 左上角占位 */}
        <div className="tl-corner" />
        {/* 时间刻度表头 */}
        <div
          className="tl-time-header"
          style={{ gridTemplateColumns: `repeat(${ticks.length}, 1fr)` }}
        >
          {ticks.map((tick, i) => (
            <span key={i}>{tick.label}</span>
          ))}
        </div>

        {/* 日分隔带叠加层（覆盖轨道区域，不拦截鼠标事件）
            放在 lanes 之前，使事件块渲染在日界带之上 */}
        {dayBoundaries.length > 0 && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 140,
              top: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
            }}
          >
            {dayBoundaries.map((b) => (
              <div
                key={b.day}
                style={{
                  position: 'absolute',
                  left: `${b.leftPct}%`,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: 'rgba(138, 28, 28, 0.18)',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: 4,
                    fontSize: 10,
                    fontFamily: "'Courier Prime', monospace",
                    color: 'var(--sepia)',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Day {b.day}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 每角色一行 */}
        {positionedLanes.map((lane) => (
          <TimelineLaneRow
            key={lane.characterId}
            lane={lane}
            conflictEventIds={conflictEventIds}
            onSelectEvent={onSelectEvent}
          />
        ))}
      </div>
    </div>
  );
}

/** 单个角色轨道行 */
function TimelineLaneRow({
  lane,
  conflictEventIds,
  onSelectEvent,
}: {
  lane: PositionedLane;
  conflictEventIds: Set<string>;
  onSelectEvent?: (event: TimelineEvent) => void;
}) {
  return (
    <>
      <div className="tl-char">
        <span
          className="swatch"
          style={{ background: lane.characterColor }}
          aria-hidden
        />
        {lane.characterName}
      </div>
      <div className="tl-track">
        {lane.events.map(({ event, leftPct, widthPct }) => {
          const isConflict = conflictEventIds.has(event.id);
          const mark = getEventTypeMark(event.eventType);
          const extraParticipants = (event.participants?.length ?? 0) - 1;
          const tip = `${event.characterName} · ${event.eventName} · ${event.startTime}–${event.endTime}${isConflict ? '（存在冲突）' : ''}`;
          return (
            <div
              key={event.id}
              className={`tl-event${isConflict ? ' conflict' : ''}`}
              style={{
                background: lane.characterColor,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
              }}
              data-tip={tip}
              role="button"
              tabIndex={0}
              onClick={() => onSelectEvent?.(event)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectEvent?.(event);
                }
              }}
            >
              <span className="ev-name">
                {mark.symbol && (
                  <span
                    style={{
                      color: mark.color,
                      marginRight: 4,
                      fontWeight: 700,
                    }}
                  >
                    {mark.symbol}
                  </span>
                )}
                {event.eventName}
              </span>
              <span className="ev-time">
                {event.startTime}–{event.endTime}
                {extraParticipants > 0 && ` · +${extraParticipants}`}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
