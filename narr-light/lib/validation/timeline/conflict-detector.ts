/**
 * 时间线冲突检测算法（T145 · 视图4 时间线校验）
 *
 * 三类冲突：
 *   1. simultaneous —— 同一人物同时出现在两地（时间区间重叠且地点不同）
 *   2. reverse      —— 时序颠倒（后事件时间早于前事件）
 *   3. gap          —— 跨幕断层（幕间时间不连续，跳变超过阈值）
 *
 * 叙述性诡计（isNarrativeTrick=true）的事件不参与冲突判定，
 * 由作者显式标记后再校验流程中排除。
 */
import type { TimelineEvent } from './extractor';

/** 冲突类型 */
export type ConflictType = 'simultaneous' | 'reverse' | 'gap';

/** 冲突严重等级 */
export type ConflictSeverity = 'severe' | 'warning' | 'hint';

/** 冲突条目 */
export interface ConflictItem {
  /** 序号（1-based） */
  index: number;
  /** 冲突类型 */
  type: ConflictType;
  /** 严重等级 */
  severity: ConflictSeverity;
  /** 标题 */
  title: string;
  /** 描述 */
  desc: string;
  /** 位置说明 */
  loc: string;
  /** 涉及事件 ID */
  eventIds: string[];
  /** 涉及角色 ID（用于跳转筛选） */
  characterIds: string[];
  /** 涉及幕次（用于跳转定位） */
  actOrders: number[];
}

/** 幕间时间断层的阈值（分钟）—— 超过此值视为断层 */
const CROSS_ACT_GAP_THRESHOLD = 120;

/** 中文幕次名称 */
function actLabel(actOrder: number): string {
  const labels = ['第一幕', '第二幕', '第三幕', '第四幕', '第五幕', '第六幕'];
  return labels[actOrder - 1] ?? `第${actOrder}幕`;
}

/** 区间重叠判定（含端点） */
function overlaps(a: TimelineEvent, b: TimelineEvent): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/** 将分钟数转为 HH:MM */
function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

/**
 * 时间线冲突检测器
 */
export class ConflictDetector {
  /**
   * 检测所有冲突。
   * 输入事件需已按 角色 → 幕次 → 起始时间 排序。
   */
  detect(events: TimelineEvent[]): ConflictItem[] {
    // 排除叙诡事件
    const validEvents = events.filter((e) => !e.isNarrativeTrick);
    const conflicts: ConflictItem[] = [];

    conflicts.push(...this.detectSimultaneous(validEvents));
    conflicts.push(...this.detectReverse(validEvents));
    conflicts.push(...this.detectGap(validEvents));

    // 重新编号
    return conflicts
      .sort((a, b) => {
        // 严重缺陷 → 局部警告 → 优化提示
        const sv = { severe: 0, warning: 1, hint: 2 } as const;
        if (sv[a.severity] !== sv[b.severity]) return sv[a.severity] - sv[b.severity];
        return a.actOrders[0] - b.actOrders[0];
      })
      .map((c, idx) => ({ ...c, index: idx + 1 }));
  }

  /**
   * 1. 同一人物同时出现在两地（时间区间重叠且地点不同）
   */
  private detectSimultaneous(events: TimelineEvent[]): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const byChar = this.groupByCharacter(events);

    byChar.forEach((charEvents, characterId) => {
      if (charEvents.length < 2) return;
      const sorted = [...charEvents].sort((a, b) => a.startMinutes - b.startMinutes);

      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          if (!overlaps(a, b)) continue;
          // 地点不同才视为冲突
          if (
            a.location &&
            b.location &&
            a.location !== b.location
          ) {
            const name = a.characterName;
            conflicts.push({
              index: 0,
              type: 'simultaneous',
              severity: 'severe',
              title: `${name}同一时段分身两地`,
              desc: `${toHHMM(a.startMinutes)}-${toHHMM(Math.max(a.endMinutes, b.endMinutes))} 期间，${name}既被描述为"${a.eventName}"，又被描述为"${b.eventName}"。同一人物同时出现在${a.location || '前一地点'}与${b.location || '后一地点'}，构成绝对时间冲突。`,
              loc: `▸ ${actLabel(Math.max(a.actOrder, b.actOrder))} · ${name}剧本 第${a.sortOrder + 1}段 ↔ 第${b.sortOrder + 1}段`,
              eventIds: [a.id, b.id],
              characterIds: [characterId],
              actOrders: [Math.max(a.actOrder, b.actOrder)],
            });
          }
        }
      }
    });

    return conflicts;
  }

  /**
   * 2. 时序颠倒：同一角色，后事件时间早于前事件
   */
  private detectReverse(events: TimelineEvent[]): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const byChar = this.groupByCharacter(events);

    byChar.forEach((charEvents, characterId) => {
      if (charEvents.length < 2) return;
      // 按 actOrder + sortOrder 排序（剧本叙事顺序）
      const narrativeOrder = [...charEvents].sort((a, b) => {
        if (a.actOrder !== b.actOrder) return a.actOrder - b.actOrder;
        return a.sortOrder - b.sortOrder;
      });

      for (let i = 1; i < narrativeOrder.length; i++) {
        const prev = narrativeOrder[i - 1];
        const curr = narrativeOrder[i];
        // 同幕内或跨幕，只要后事件时间早于前事件就视为颠倒
        if (curr.startMinutes < prev.startMinutes - 1) {
          const name = curr.characterName;
          conflicts.push({
            index: 0,
            type: 'reverse',
            severity: 'warning',
            title: `${name}时序颠倒`,
            desc: `${name}在${actLabel(prev.actOrder)}第${prev.sortOrder + 1}段于 ${toHHMM(prev.startMinutes)} ${prev.eventName}，但${actLabel(curr.actOrder)}第${curr.sortOrder + 1}段时间 ${toHHMM(curr.startMinutes)} 早于前述事件，相对时序颠倒。`,
            loc: `▸ ${actLabel(prev.actOrder)} → ${actLabel(curr.actOrder)} · ${name}剧本 第${prev.sortOrder + 1}段 ↔ 第${curr.sortOrder + 1}段`,
            eventIds: [prev.id, curr.id],
            characterIds: [characterId],
            actOrders: [prev.actOrder, curr.actOrder],
          });
        }
      }
    });

    return conflicts;
  }

  /**
   * 3. 跨幕断层：相邻两幕时间跳变超过阈值
   */
  private detectGap(events: TimelineEvent[]): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const byChar = this.groupByCharacter(events);

    byChar.forEach((charEvents, characterId) => {
      if (charEvents.length < 2) return;
      const byAct = new Map<number, TimelineEvent[]>();
      charEvents.forEach((e) => {
        const arr = byAct.get(e.actOrder) ?? [];
        arr.push(e);
        byAct.set(e.actOrder, arr);
      });

      const actOrders = Array.from(byAct.keys()).sort((a, b) => a - b);
      for (let i = 1; i < actOrders.length; i++) {
        const prevAct = actOrders[i - 1];
        const currAct = actOrders[i];
        const prevLast = byAct
          .get(prevAct)!
          .reduce((max, e) => (e.endMinutes > max.endMinutes ? e : max));
        const currFirst = byAct
          .get(currAct)!
          .reduce((min, e) => (e.startMinutes < min.startMinutes ? e : min));

        const gap = currFirst.startMinutes - prevLast.endMinutes;
        if (gap > CROSS_ACT_GAP_THRESHOLD) {
          const name = currFirst.characterName;
          conflicts.push({
            index: 0,
            type: 'gap',
            severity: 'hint',
            title: `${name}跨幕时间断层`,
            desc: `${name}在${actLabel(prevAct)}于 ${toHHMM(prevLast.endMinutes)} 结束"${prevLast.eventName}"，但${actLabel(currAct)}开始时间 ${toHHMM(currFirst.startMinutes)} 与前幕相差 ${gap} 分钟，存在时间断层，建议补充过渡说明。`,
            loc: `▸ ${actLabel(prevAct)} → ${actLabel(currAct)} · ${name}剧本`,
            eventIds: [prevLast.id, currFirst.id],
            characterIds: [characterId],
            actOrders: [prevAct, currAct],
          });
        }
      }
    });

    return conflicts;
  }

  /** 按角色 ID 分组 */
  private groupByCharacter(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
    const map = new Map<string, TimelineEvent[]>();
    events.forEach((e) => {
      const arr = map.get(e.characterId) ?? [];
      arr.push(e);
      map.set(e.characterId, arr);
    });
    return map;
  }
}

/** 冲突严重等级 → 中文标签 */
export const SEVERITY_LABELS: Record<ConflictSeverity, string> = {
  severe: '严重缺陷',
  warning: '局部警告',
  hint: '优化提示',
};

/** 冲突类型 → 中文标签 */
export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  simultaneous: '分身冲突',
  reverse: '时序颠倒',
  gap: '跨幕断层',
};
