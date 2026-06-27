/**
 * 时间轴组件（T147 · 视图4）
 *
 * 严格对齐原型 workbench2.html #view-timeline 的 .tl-axis 结构：
 *   - .tl-axis（grid: 140px 1fr）
 *   - .tl-time-header（8 个时间刻度 18:00 → 次日 01:00）
 *   - 每角色一行：.tl-char（角色名 + 色块）+ .tl-track（轨道，含 .tl-event）
 *
 * .tl-event 使用 absolute 定位，left% / width% 由分钟数映射到时间窗口。
 * 冲突事件加 .conflict 类，触发 conflictPulse 动画。
 *
 * 实现选型：原型本身使用 HTML+CSS（repeating-linear-gradient 网格线），
 * 此处保持一致，未引入 D3/SVG，以最小代价对齐原型视觉。
 */
'use client';

import { useMemo } from 'react';
import type { TimelineEvent } from '@/lib/validation/timeline/extractor';

/**
 * 时间窗口常量（与 lib/validation/timeline/extractor.ts 保持一致）。
 * 此处本地定义以避免从 extractor.ts 进行运行时导入——该模块依赖
 * next/headers（服务端 API），不能进入客户端 bundle。
 */
const TIMELINE_START_MIN = 18 * 60; // 18:00 = 1080
const TIMELINE_TOTAL_MIN = 25 * 60 - 18 * 60; // 18:00→次日01:00 = 420

/** 时间刻度标签（原型 8 个） */
const TIME_TICKS: readonly string[] = [
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
  '00:00',
  '01:00',
];

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
}

/**
 * 时间轴组件
 */
export function TimelineChart({
  lanes,
  conflictEventIds,
  onlyConflicts = false,
  onSelectEvent,
}: TimelineChartProps) {
  // 计算每个事件的位置百分比
  const positionedLanes = useMemo(() => {
    return lanes.map((lane) => ({
      ...lane,
      events: lane.events
        .map((event) => {
          const leftPct =
            ((event.startMinutes - TIMELINE_START_MIN) / TIMELINE_TOTAL_MIN) * 100;
          const widthPct =
            ((event.endMinutes - event.startMinutes) / TIMELINE_TOTAL_MIN) * 100;
          return { event, leftPct, widthPct };
        })
        .filter((item) => {
          if (!onlyConflicts) return true;
          return conflictEventIds.has(item.event.id);
        }),
    }));
  }, [lanes, onlyConflicts, conflictEventIds]);

  return (
    <div className="timeline-wrap">
      <div className="tl-axis">
        {/* 左上角占位 */}
        <div className="tl-corner" />
        {/* 时间刻度表头 */}
        <div className="tl-time-header">
          {TIME_TICKS.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>

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
              <span className="ev-name">{event.eventName}</span>
              <span className="ev-time">
                {event.startTime}–{event.endTime}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
