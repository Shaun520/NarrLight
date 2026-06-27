/**
 * 时间线提取器（T144 · 视图4 时间线校验）
 *
 * 从剧本的 characters / acts / scenes 表自动提取全角色时间线事件。
 *
 * 主要能力：
 *   1. parseTimeFromText(text)  —— 从自然语言文本中解析 HH:MM 时间点
 *   2. parseTimeRange(text)     —— 解析 "18:10–19:10" / "18:10-19:10" / "18:10 至 19:10" 等区间
 *   3. extract(scriptId)        —— 从 acts/scenes/characters 表提取 TimelineEvent[]
 *
 * 时间窗口与原型的 18:00–次日01:00 一致（共 7 小时 = 420 分钟），
 * 超出窗口的事件会被钳制到窗口内并保留原始时间字符串。
 *
 * 6 角色配色与编辑器保持一致：
 *   #8a1c1c 沈墨白 / #b08d57 沈墨尘 / #4a7c59 柳如烟
 *   #3a5a7a 陈守义 / #7a5c3a 小翠   / #6a4a8a 周半仙
 */
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

/** 角色固定配色（与编辑器一致） */
export const CHARACTER_COLORS: readonly string[] = [
  '#8a1c1c',
  '#b08d57',
  '#4a7c59',
  '#3a5a7a',
  '#7a5c3a',
  '#6a4a8a',
];

/** 时间窗口起点（分钟数，18:00 = 18*60 = 1080） */
export const TIMELINE_START_MIN = 18 * 60;
/** 时间窗口终点（次日 01:00 = 25*60 = 1500，跨日用 24+1 表示） */
export const TIMELINE_END_MIN = 25 * 60;
/** 时间窗口总跨度（分钟）—— 对应原型 8 个刻度 */
export const TIMELINE_TOTAL_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN;

/** 时间线事件（视图层模型） */
export interface TimelineEvent {
  id: string;
  scriptId: string;
  characterId: string;
  characterName: string;
  /** 角色配色 hex */
  characterColor: string;
  /** 事件简短名称（地点或动作摘要） */
  eventName: string;
  /** 起始时间字符串 HH:MM */
  startTime: string;
  /** 结束时间字符串 HH:MM */
  endTime: string;
  /** 起始分钟数（用于排序与位置计算） */
  startMinutes: number;
  /** 结束分钟数 */
  endMinutes: number;
  /** 地点 */
  location: string;
  /** 所属幕次（1-based） */
  actOrder: number;
  /** 幕内序号 */
  sortOrder: number;
  /** 是否为叙述性诡计 */
  isNarrativeTrick: boolean;
  /** 叙诡类型 */
  trickType: string;
  /** 原文片段（用于跳转修正时定位） */
  sourceText: string;
}

/** characters 表行 */
interface CharacterRow {
  id: string;
  script_id: string;
  name: string;
  role_identity: string;
  sort_order: number;
}

/** acts 表行 */
interface ActRow {
  id: string;
  script_id: string;
  title: string;
  sort_order: number;
  content: string;
}

/** scenes 表行 */
interface SceneRow {
  id: string;
  act_id: string;
  title: string;
  location: string;
  content: string;
  sort_order: number;
}

/** timeline_events 表行（若已存库则直接复用） */
interface TimelineEventRow {
  id: string;
  script_id: string;
  character_id: string | null;
  event_time: string;
  event_description: string;
  location: string;
  act_order: number | null;
  is_narrative_trick: boolean;
  trick_type: 'time' | 'identity' | 'perspective' | 'other' | '';
  sort_order: number;
}

/** HH:MM 正则（允许 24:00 用于跨日终点） */
const TIME_PATTERN = /([01]?\d|2[0-4]):([0-5]\d)/g;

/** 区间正则：18:10–19:10 / 18:10-19:10 / 18:10 至 19:10 / 18:10~19:10 */
const TIME_RANGE_PATTERN =
  /([01]?\d|2[0-4]):([0-5]\d)\s*[–\-~至到→]+\s*([01]?\d|2[0-4]):([0-5]\d)/g;

/**
 * 时间线提取器
 *
 * 当前实现采用「文本扫描 + 数据库 timeline_events 兜底」的混合策略：
 *   1. 优先从 characters 表的 role_identity/personality 字段、acts/scenes 的 content 字段
 *      中按角色名匹配并解析时间点
 *   2. 若 timeline_events 表已有结构化数据，则作为补充来源
 */
export class TimelineExtractor {
  /**
   * 从文本中解析所有 HH:MM 时间点。
   * 返回去重后的分钟数数组。
   */
  parseTimeFromText(text: string): number[] {
    if (!text) return [];
    const minutes = new Set<number>();
    TIME_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIME_PATTERN.exec(text)) !== null) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      // 跨日（00:00–01:00）视作 24+h
      const total = (h < 6 ? h + 24 : h) * 60 + min;
      minutes.add(total);
    }
    return Array.from(minutes).sort((a, b) => a - b);
  }

  /**
   * 从文本中解析时间区间 [startMin, endMin]。
   * 优先匹配 "18:10–19:10" 形式；若无区间则取首个时间点 ± 30 分钟。
   */
  parseTimeRange(text: string): { start: number; end: number } | null {
    if (!text) return null;
    TIME_RANGE_PATTERN.lastIndex = 0;
    const rangeMatch = TIME_RANGE_PATTERN.exec(text);
    if (rangeMatch) {
      const sh = parseInt(rangeMatch[1], 10);
      const sm = parseInt(rangeMatch[2], 10);
      const eh = parseInt(rangeMatch[3], 10);
      const em = parseInt(rangeMatch[4], 10);
      const start = (sh < 6 ? sh + 24 : sh) * 60 + sm;
      const end = (eh < 6 ? eh + 24 : eh) * 60 + em;
      if (end >= start) return { start, end };
    }
    // 退化为单点 ± 30 分钟
    const points = this.parseTimeFromText(text);
    if (points.length === 0) return null;
    const start = points[0];
    const end = points.length > 1 ? points[points.length - 1] : start + 60;
    return { start, end: Math.max(end, start + 30) };
  }

  /**
   * 从剧本自动提取全角色时间线事件。
   *
   * 策略：
   *   - 拉 characters/acts/scenes 三张表
   *   - 对每个角色，按幕次扫描 acts.content 与 scenes.content
   *   - 提取含角色名的段落，解析时间区间，生成 TimelineEvent
   *   - 若 timeline_events 表已有数据则合并去重
   */
  async extract(scriptId: string): Promise<TimelineEvent[]> {
    const supabase = await createClient();
    const events: TimelineEvent[] = [];

    // 1. 拉 characters
    const { data: charRows } = (await supabase
      .from('characters')
      .select('id, script_id, name, role_identity, sort_order')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true })) as {
      data: CharacterRow[] | null;
    };
    const characters = charRows ?? [];

    // 2. 拉 acts
    const { data: actRows } = (await supabase
      .from('acts')
      .select('id, script_id, title, sort_order, content')
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true })) as { data: ActRow[] | null };
    const acts = actRows ?? [];

    // 3. 拉 scenes（按 act_id 分组）
    const { data: sceneRows } = (await supabase
      .from('scenes')
      .select('id, act_id, title, location, content, sort_order')
      .in(
        'act_id',
        acts.map((a) => a.id),
      )) as { data: SceneRow[] | null };
    const scenes = sceneRows ?? [];

    // 4. 拉 timeline_events（兜底结构化数据）
    const { data: existingEvents } = (await supabase
      .from('timeline_events')
      .select(
        'id, script_id, character_id, event_time, event_description, location, act_order, is_narrative_trick, trick_type, sort_order',
      )
      .eq('script_id', scriptId)
      .order('sort_order', { ascending: true })) as {
      data: TimelineEventRow[] | null;
    };

    // 5. 为每个角色生成事件
    characters.forEach((char, charIdx) => {
      const color = CHARACTER_COLORS[charIdx % CHARACTER_COLORS.length];
      let sortOrder = 0;

      acts.forEach((act, actIdx) => {
        const actOrder = actIdx + 1;
        const actScenes = scenes
          .filter((s) => s.act_id === act.id)
          .sort((a, b) => a.sort_order - b.sort_order);

        // 5.1 扫描 act.content 中含角色名的段落
        this.scanTextForCharacter(
          act.content,
          char.name,
          (textSlice, range, location) => {
            const id = `tl-${char.id}-act${actOrder}-${sortOrder}`;
            events.push(
              this.buildEvent({
                id,
                scriptId,
                characterId: char.id,
                characterName: char.name,
                characterColor: color,
                text: textSlice,
                range,
                actOrder,
                sortOrder,
                location,
                sourceText: textSlice,
              }),
            );
            sortOrder += 1;
          },
        );

        // 5.2 扫描每个 scene.content
        actScenes.forEach((scene) => {
          this.scanTextForCharacter(
            scene.content,
            char.name,
            (textSlice, range, location) => {
              const id = `tl-${char.id}-act${actOrder}-s${scene.sort_order}-${sortOrder}`;
              events.push(
                this.buildEvent({
                  id,
                  scriptId,
                  characterId: char.id,
                  characterName: char.name,
                  characterColor: color,
                  text: textSlice,
                  range,
                  actOrder,
                  sortOrder,
                  location: location || scene.location || scene.title,
                  sourceText: textSlice,
                }),
              );
              sortOrder += 1;
            },
            scene.location || scene.title,
          );
        });
      });
    });

    // 6. 合并 timeline_events 表中已存的结构化数据
    if (existingEvents && existingEvents.length > 0) {
      const charById = new Map(characters.map((c) => [c.id, c]));
      existingEvents.forEach((row, idx) => {
        if (!row.character_id) return;
        const char = charById.get(row.character_id);
        if (!char) return;
        const charIdx = characters.findIndex((c) => c.id === char.id);
        const color = CHARACTER_COLORS[charIdx % CHARACTER_COLORS.length];
        const range = this.parseTimeRange(row.event_time) ??
          this.parseTimeRange(row.event_description);
        if (!range) return;

        const id = `tl-db-${row.id}`;
        if (events.some((e) => e.id === id)) return;

        events.push(
          this.buildEvent({
            id,
            scriptId,
            characterId: char.id,
            characterName: char.name,
            characterColor: color,
            text: row.event_description || row.event_time,
            range,
            actOrder: row.act_order ?? 1,
            sortOrder: row.sort_order ?? idx,
            location: row.location,
            sourceText: row.event_description,
            isNarrativeTrick: row.is_narrative_trick,
            trickType: row.trick_type,
          }),
        );
      });
    }

    // 7. 排序：角色 → 幕次 → 起始时间
    events.sort((a, b) => {
      if (a.characterId !== b.characterId) {
        const ai = characters.findIndex((c) => c.id === a.characterId);
        const bi = characters.findIndex((c) => c.id === b.characterId);
        return ai - bi;
      }
      if (a.actOrder !== b.actOrder) return a.actOrder - b.actOrder;
      return a.startMinutes - b.startMinutes;
    });

    return events;
  }

  /**
   * 在文本中按段落扫描含角色名的内容，对每段尝试解析时间区间。
   * 命中后调用 emit 回调。
   */
  private scanTextForCharacter(
    text: string,
    charName: string,
    emit: (slice: string, range: { start: number; end: number }, location: string) => void,
    defaultLocation = '',
  ): void {
    if (!text || !charName) return;
    // 按换行或句号分段
    const paragraphs = text.split(/[\n。！？]/).filter((p) => p.trim().length > 0);
    paragraphs.forEach((para) => {
      if (!para.includes(charName)) return;
      const range = this.parseTimeRange(para);
      if (!range) return;
      const location = this.extractLocation(para) || defaultLocation;
      const trimmed = para.trim().slice(0, 80);
      emit(trimmed, range, location);
    });
  }

  /** 从段落中粗略提取地点（"在XXX" / "于XXX" / "至XXX"） */
  private extractLocation(text: string): string {
    const m = text.match(/[在于至去赴]\s*([\u4e00-\u9fa5]{2,8})/);
    return m ? m[1] : '';
  }

  /** 构造 TimelineEvent */
  private buildEvent(args: {
    id: string;
    scriptId: string;
    characterId: string;
    characterName: string;
    characterColor: string;
    text: string;
    range: { start: number; end: number };
    actOrder: number;
    sortOrder: number;
    location: string;
    sourceText: string;
    isNarrativeTrick?: boolean;
    trickType?: string;
  }): TimelineEvent {
    const { range, text } = args;
    // 钳制到时间窗口
    const start = Math.max(TIMELINE_START_MIN, Math.min(TIMELINE_END_MIN, range.start));
    const end = Math.max(start + 15, Math.min(TIMELINE_END_MIN, range.end));
    return {
      id: args.id,
      scriptId: args.scriptId,
      characterId: args.characterId,
      characterName: args.characterName,
      characterColor: args.characterColor,
      eventName: this.deriveEventName(text, args.location),
      startTime: this.minutesToHHMM(start),
      endTime: this.minutesToHHMM(end),
      startMinutes: start,
      endMinutes: end,
      location: args.location,
      actOrder: args.actOrder,
      sortOrder: args.sortOrder,
      isNarrativeTrick: args.isNarrativeTrick ?? false,
      trickType: args.trickType ?? '',
      sourceText: args.sourceText,
    };
  }

  /** 从文本中派生事件名：优先用地点，否则截取前 6 字 */
  private deriveEventName(text: string, location: string): string {
    if (location && location.length >= 2) return location.slice(0, 8);
    const clean = text.replace(TIME_PATTERN, '').trim();
    return clean.length > 0 ? clean.slice(0, 8) : '事件';
  }

  /** 分钟数 → HH:MM（跨日用 00:00/01:00 表示） */
  private minutesToHHMM(minutes: number): string {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }
}

/** 数据库行类型导出（供 Edge Function 复用） */
export type { CharacterRow, ActRow, SceneRow, TimelineEventRow };
export type { Database };
