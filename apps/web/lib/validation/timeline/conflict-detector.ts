/**
 * 时间线冲突检测算法（T145 · 视图4 时间线校验）
 *
 * 六类冲突：
 *   1. simultaneous        —— 同一人物同时出现在两地（时间区间重叠且地点不同）
 *   2. reverse             —— 时序颠倒（后事件时间早于前事件）
 *   3. gap                 —— 跨幕断层（幕间时间不连续，跳变超过阈值）
 *   4. location_conflict   —— 同人异地（同日同时段、不同地点的分身冲突）
 *   5. causality_break     —— 因果断裂（causes 引用缺失或时序颠倒）
 *   6. coverage_warning    —— 事件覆盖警告（推理/悬疑剧本缺少凶杀或搜证事件）
 *
 * 叙述性诡计（isNarrativeTrick=true）的事件默认不参与常规冲突判定，
 * 由作者显式标记后再校验流程中排除；但因果检测（causality_break）
 * 会将叙诡事件一并纳入，以便发现叙事线程断裂。
 */
import type { TimelineEvent } from './extractor';

/** 冲突类型 */
export type ConflictType =
  | 'simultaneous'
  | 'reverse'
  | 'gap'
  | 'location_conflict'
  | 'causality_break'
  | 'coverage_warning';

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
 * HH:MM 字符串 → 分钟数。
 * 与 extractor.parseTimeFromText 同口径：跨日 00–05 视作次日 24+h。
 * 解析失败返回 null。
 */
function parseHHMMToMinutes(time: string): number | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 24 || min > 59) return null;
  return (h < 6 ? h + 24 : h) * 60 + min;
}

/**
 * 时间线冲突检测器
 */
export class ConflictDetector {
  /**
   * 检测所有冲突。
   * 输入事件需已按 角色 → 幕次 → 起始时间 排序。
   *
   * @param events 全部时间线事件（含叙诡）
   * @param options.genre 剧本类型，用于触发覆盖警告（如 'mystery' / 'suspense'）
   */
  detect(events: TimelineEvent[], options?: { genre?: string }): ConflictItem[] {
    // 排除叙诡事件（仅对常规冲突判定）
    const validEvents = events.filter((e) => !e.isNarrativeTrick);
    const conflicts: ConflictItem[] = [];

    conflicts.push(...this.detectSimultaneous(validEvents));
    conflicts.push(...this.detectReverse(validEvents));
    conflicts.push(...this.detectGap(validEvents));
    conflicts.push(...this.detectLocationConflict(validEvents));
    // 因果检测不排除叙诡
    conflicts.push(...this.detectCausalityBreak(events));
    conflicts.push(...this.detectCoverageWarning(events, options?.genre));

    // 重新编号
    return conflicts.map((c, i) => ({ ...c, index: i + 1 }));
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

  /**
   * 4. 同人异地：同一角色在同一天、时间重叠但地点不同
   *    与 detectSimultaneous 相比，本方法显式约束 day 相同，
   *    用于跨天剧本中精确识别「同日分身」冲突。
   */
  private detectLocationConflict(events: TimelineEvent[]): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    const byChar = this.groupByCharacter(events);

    byChar.forEach((charEvents, characterId) => {
      if (charEvents.length < 2) return;
      const sorted = [...charEvents].sort((a, b) => a.startMinutes - b.startMinutes);

      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          // 同日才视为同人异地冲突
          if (a.day !== b.day) continue;
          if (!overlaps(a, b)) continue;
          if (!a.location || !b.location) continue;
          if (a.location === b.location) continue;

          const name = a.characterName;
          const start = Math.min(a.startMinutes, b.startMinutes);
          const end = Math.max(a.endMinutes, b.endMinutes);
          conflicts.push({
            index: 0,
            type: 'location_conflict',
            severity: 'severe',
            title: `同人异地：${name}`,
            desc: `${name} 在 ${toHHMM(start)}-${toHHMM(end)} 同时出现在「${a.location}」和「${b.location}」`,
            loc: `${a.location} / ${b.location}`,
            eventIds: [a.id, b.id],
            characterIds: [characterId],
            actOrders: Array.from(new Set([a.actOrder, b.actOrder])),
          });
        }
      }
    });

    return conflicts;
  }

  /**
   * 5. 因果断裂：事件的 causes 引用无法解析或时序颠倒
   *    causes 格式：`${day}-${time}-${characterName}`，如 "1-24:30-沈墨尘"
   *    叙诡事件也参与因果检测（不排除）
   */
  private detectCausalityBreak(events: TimelineEvent[]): ConflictItem[] {
    const conflicts: ConflictItem[] = [];

    events.forEach((event) => {
      if (!event.causes || event.causes.length === 0) return;

      event.causes.forEach((cause) => {
        const parsed = this.parseCauseRef(cause);

        // 引用格式本身无法解析 → 视为引用缺失
        if (!parsed) {
          conflicts.push({
            index: 0,
            type: 'causality_break',
            severity: 'warning',
            title: '因果断裂：引用缺失',
            desc: `事件「${event.eventName}」（${event.characterName}，${toHHMM(event.startMinutes)}）的因果引用 "${cause}" 格式无法解析，请检查 causes 字段。`,
            loc: `▸ ${actLabel(event.actOrder)} · ${event.characterName}剧本 第${event.sortOrder + 1}段`,
            eventIds: [event.id],
            characterIds: [event.characterId],
            actOrders: [event.actOrder],
          });
          return;
        }

        const { day, causeMinutes, characterName } = parsed;
        // 在事件列表中查找匹配：day 相同 + 时间区间包含 causeMinutes + 角色名相同
        const matched = events.find(
          (e) =>
            e.day === day &&
            e.characterName === characterName &&
            causeMinutes >= e.startMinutes &&
            causeMinutes <= e.endMinutes,
        );

        // 找不到匹配事件 → 引用缺失
        if (!matched) {
          conflicts.push({
            index: 0,
            type: 'causality_break',
            severity: 'warning',
            title: '因果断裂：引用缺失',
            desc: `事件「${event.eventName}」（${event.characterName}，${toHHMM(event.startMinutes)}）引用了因果 "${cause}"，但未能在时间线中找到匹配事件（day=${day}，time=${toHHMM(causeMinutes)}，character=${characterName}）。`,
            loc: `▸ ${actLabel(event.actOrder)} · ${event.characterName}剧本 第${event.sortOrder + 1}段`,
            eventIds: [event.id],
            characterIds: [event.characterId],
            actOrders: [event.actOrder],
          });
          return;
        }

        // 匹配事件起始时间晚于当前事件 → 时序颠倒
        if (matched.startMinutes > event.startMinutes) {
          conflicts.push({
            index: 0,
            type: 'causality_break',
            severity: 'severe',
            title: '因果断裂：时序颠倒',
            desc: `事件「${event.eventName}」（${event.characterName}，${toHHMM(event.startMinutes)}）引用了 "${cause}"，但匹配事件「${matched.eventName}」起始时间 ${toHHMM(matched.startMinutes)} 晚于当前事件，因果时序颠倒。`,
            loc: `▸ ${actLabel(event.actOrder)} → ${actLabel(matched.actOrder)} · ${event.characterName}剧本`,
            eventIds: [event.id, matched.id],
            characterIds: [event.characterId],
            actOrders: Array.from(new Set([event.actOrder, matched.actOrder])),
          });
        }
      });
    });

    return conflicts;
  }

  /**
   * 解析 cause 引用 `${day}-${time}-${characterName}`
   * 返回 day、causeMinutes（解析后的分钟数）、characterName。
   * 角色名本身可能含 "-"，因此用剩余部分拼接。解析失败返回 null。
   */
  private parseCauseRef(cause: string): {
    day: number;
    causeMinutes: number;
    characterName: string;
  } | null {
    const parts = cause.split('-');
    if (parts.length < 3) return null;
    const day = parseInt(parts[0], 10);
    if (!Number.isFinite(day) || day < 1) return null;
    const causeMinutes = parseHHMMToMinutes(parts[1]);
    if (causeMinutes === null) return null;
    const characterName = parts.slice(2).join('-').trim();
    if (!characterName) return null;
    return { day, causeMinutes, characterName };
  }

  /**
   * 6. 事件覆盖警告：根据剧本 genre 检测关键事件类型缺失
   *    - mystery / suspense 剧本应至少包含一次凶杀与一次搜证
   */
  private detectCoverageWarning(events: TimelineEvent[], genre?: string): ConflictItem[] {
    const conflicts: ConflictItem[] = [];
    if (!genre) return conflicts;
    const g = genre.toLowerCase();
    if (g !== 'mystery' && g !== 'suspense') return conflicts;

    const hasMurder = events.some((e) => e.eventType === 'murder');
    const hasSearch = events.some((e) => e.eventType === 'search');

    if (!hasMurder) {
      conflicts.push({
        index: 0,
        type: 'coverage_warning',
        severity: 'hint',
        title: '事件覆盖：缺少凶杀事件',
        desc: '推理剧本未识别到凶杀事件（eventType=murder），请检查时间线结构化结果。',
        loc: '全局',
        eventIds: [],
        characterIds: [],
        actOrders: [],
      });
    }

    if (!hasSearch) {
      conflicts.push({
        index: 0,
        type: 'coverage_warning',
        severity: 'hint',
        title: '事件覆盖：缺少搜证事件',
        desc: '推理剧本未识别到搜证事件（eventType=search），请检查时间线结构化结果。',
        loc: '全局',
        eventIds: [],
        characterIds: [],
        actOrders: [],
      });
    }

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
  location_conflict: '同人异地',
  causality_break: '因果断裂',
  coverage_warning: '事件覆盖',
};
