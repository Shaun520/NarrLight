/**
 * 时间线结构化（Timeline Structure）Prompt 模板
 *
 * 阶段 4 后处理：truth-review 完成后，把 truth_reviews.timeline_full 中的
 * 自然语言时间描述（「傍晚」「凌晨」「深夜」「Day1 夜」「Day2 凌晨」「第三天傍晚」等）
 * 转换为带日序的 HH:MM 结构化时间线事件，按角色拆分写入 timeline_events 表，
 * 供 TimelineExtractor 直接复用，绕过 acts/scenes 文本正则扫描的失败路径。
 *
 * 关键约束：
 *   - 跨天的时间用 24:MM/25:MM 表示当日次时段；多日剧本通过 day 字段区分
 *   - 每个时间点按涉及角色拆成独立事件
 *   - 必须标记叙述性诡计（isNarrativeTrick）与诡计类型（trickType）
 *   - 必须输出多维度建模字段：day / eventType / participants / thread / causes
 *   - 仅输出 JSON，不含 markdown 代码块或解释文本
 */

/** 叙述性诡计类型枚举 */
export type TimelineTrickType = 'time' | 'identity' | 'perspective' | 'other' | '';

/** 事件类型枚举 */
export type TimelineEventType =
  | 'murder'
  | 'search'
  | 'flashback'
  | 'monologue'
  | 'revelation'
  | 'normal';

/** 叙事线枚举 */
export type TimelineThread = 'main' | 'subplot' | 'trick';

/** 单个结构化时间线事件 */
export interface TimelineStructureEvent {
  /** 涉及角色姓名（需与 characters 表 name 字段对齐） */
  characterName: string;
  /** HH:MM 或 HH:MM-HH:MM 区间（跨日用 24:MM/25:MM 表示次日） */
  time: string;
  /** 事件简述 */
  description: string;
  /** 事件地点 */
  location: string;
  /** 所属幕次（1-based） */
  actOrder: number;
  /** 是否为叙述性诡计 */
  isNarrativeTrick: boolean;
  /** 诡计类型 */
  trickType: TimelineTrickType;
  /** 事件所属日（1=第一天，默认 1） */
  day?: number;
  /** 事件类型（默认 'normal'） */
  eventType?: TimelineEventType;
  /** 参与角色 name 数组（主角仍在 characterName） */
  participants?: string[];
  /** 叙事线（默认 'main'） */
  thread?: TimelineThread;
  /** 前置事件引用数组，格式 `${day}-${time}-${characterName}`；无因果关系时为空数组 */
  causes?: string[];
}

/** AI 返回的时间线结构化 JSON */
export interface TimelineStructureJson {
  /** 结构化事件列表 */
  events: TimelineStructureEvent[];
}

/** buildTimelineStructurePrompt 入参 */
export interface TimelineStructurePromptInput {
  /** truth_reviews.timeline_full 原文 */
  timelineFull: string;
  /** 角色清单（name + roleIdentity） */
  characters: Array<{ name: string; roleIdentity: string }>;
  /** 分幕清单（title + sortOrder） */
  acts: Array<{ title: string; sortOrder: number }>;
}

/**
 * 构造系统提示词：角色设定 + 时间换算规则 + 输出格式约束
 */
export function buildTimelineStructureSystemPrompt(): string {
  return `你是一名剧本杀时间线结构化专家，擅长把自然语言时间描述（「傍晚」「凌晨」「深夜」「Day1 夜」「Day2 凌晨」「第三天傍晚」等）精确转换为带日序的 HH:MM 结构化事件，并按涉及角色拆分。

任务：读取用户提供的 timeline_full 文本，识别其中每个时间点涉及的角色与所属日，把自然语言时间换算为 HH:MM，按角色拆分为独立事件，并补全事件类型、参与角色、叙事线、前置因果等维度。

你必须严格遵守以下要求：

1. 时间换算规则（不再限制时间窗口，可覆盖全天 24 小时）：
   - 当日次时段用 24:MM 或 25:MM 表示，例如 24:30 = 当日 24:30（即次日 00:30），25:00 = 当日 25:00（即次日 01:00）。
   - 自然语言时间换算参考：
     - 「傍晚」「黄昏」「日落」 → 18:00–18:30
     - 「入夜」「夜幕降临」 → 19:00–19:30
     - 「深夜」「午夜前」 → 22:00–23:30
     - 「凌晨」「午夜后」 → 24:00–25:00（即次日 00:00–01:00）
     - 「清晨」「早上」 → 07:00–09:00
     - 「中午」「正午」 → 12:00–13:00
     - 「下午」 → 14:00–17:00
     - 「Day1 夜」「当晚」 → 视上下文取 19:00–22:00 之间具体时点
     - 文本中已出现的 HH:MM 直接沿用
2. 跨天换算规则：当时间明确属于下一日或某指定日时，更新 day 字段并相应换算 time：
   - 「Day2 凌晨」 → day=2, time="24:30"
   - 「第三天傍晚」 → day=3, time="18:00"
   - 「次日清晨」「第二天早上」 → day=2, time="08:00"
   - 文本中已显式标注「第 N 天」「Day N」时，直接沿用该 day 值，并按上表换算 time。
   - 未显式跨天时 day 默认为 1。
3. 每个时间点按涉及角色拆成独立事件：若同一时段涉及 3 个角色，则输出 3 条事件，每条 characterName 不同。
4. actOrder 必须对应用户提供的分幕 sortOrder；若时间点明确属于某幕则填该幕序号，无法判断时填 1。
5. 标记叙述性诡计：
   - isNarrativeTrick=true 当且仅当该事件涉及时间叙诡、身份叙诡、视角叙诡或其他叙述性欺骗
   - trickType 取值：'time'（时间叙诡）/ 'identity'（身份叙诡）/ 'perspective'（视角叙诡）/ 'other'（其他叙诡）/ ''（非叙诡）
6. description 用一句话概括该角色在该时间点的动作或状态；location 尽量从文本中提取具体地点，无法判断时填「未指定」。
7. characterName 必须与用户提供的 characters 列表中 name 完全一致（区分大小写与汉字）。
8. day 字段：事件所属日，1-based 整数（1=第一天，2=第二天…）。未显式标注跨天时默认 day=1。
9. eventType 字段（事件类型）识别规则：
   - 'murder'：凶杀行为（投毒、刺杀、窒息等致死动作）
   - 'search'：搜证行为（搜查尸体、勘查现场、收集线索等）
   - 'flashback'：闪回叙事（回忆片段、过往事件重述）
   - 'monologue'：独白叙事（角色内心独白、自述）
   - 'revelation'：真相揭露（揭示身份、动机、真相的关键时刻）
   - 'normal'：普通行为（寒暄、用餐、移动等无特殊类型）
   - 无法判断时填 'normal'。
10. participants 字段（参与角色）：列出该事件中所有在场或参与的角色 name 数组。主角（动作发起者或事件主体）仍写入 characterName 字段，并同样出现在 participants 中。无其他参与者时，participants 只含主角本身。
11. thread 字段（叙事线）取值：
    - 'main'：主线（默认值，常规叙事推进）
    - 'subplot'：支线（次要情节、次要角色专属情节）
    - 'trick'：诡计线（涉及叙述性诡计的关键节点，通常与 isNarrativeTrick=true 同步）
12. causes 字段（前置事件引用）：当事件 B 在因果上依赖事件 A 时（例如发现尸体依赖凶杀、揭穿真相依赖搜证），在 B.causes 中包含 A 的引用键 \`\${A.day}-\${A.time}-\${A.characterName}\`。无因果关系时填空数组 []。

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或任何解释性文本。
JSON 结构如下：

{
  "events": [
    {
      "characterName": "沈墨白",
      "time": "18:30-19:00",
      "description": "抵达沈宅正厅，与族人寒暄并接受接风宴邀约。",
      "location": "沈宅正厅",
      "actOrder": 1,
      "day": 1,
      "eventType": "normal",
      "participants": ["沈墨白"],
      "thread": "main",
      "causes": [],
      "isNarrativeTrick": false,
      "trickType": ""
    },
    {
      "characterName": "沈墨尘",
      "time": "24:30",
      "description": "借敬酒之机将乌头碱溶入死者温酒，制造时间认知偏差。",
      "location": "宴席席间",
      "actOrder": 2,
      "day": 1,
      "eventType": "murder",
      "participants": ["沈墨尘", "死者"],
      "thread": "trick",
      "causes": [],
      "isNarrativeTrick": true,
      "trickType": "time"
    },
    {
      "characterName": "沈墨白",
      "time": "25:00",
      "description": "发现死者尸体并开始搜证。",
      "location": "宴席席间",
      "actOrder": 2,
      "day": 1,
      "eventType": "search",
      "participants": ["沈墨白", "沈墨尘"],
      "thread": "main",
      "causes": ["1-24:30-沈墨尘"],
      "isNarrativeTrick": false,
      "trickType": ""
    }
  ]
}

请确保 JSON 合法、字段完整、可被直接解析。events 可为空数组（当 timeline_full 无可识别时间点时）。`;
}

/**
 * 构造用户提示词：注入 timeline_full / characters / acts
 */
export function buildTimelineStructureUserPrompt(input: TimelineStructurePromptInput): string {
  const { timelineFull, characters, acts } = input;
  const lines: string[] = [];

  lines.push('分幕结构（actOrder 必须对齐以下 sortOrder）：');
  for (const act of acts) {
    lines.push(`- 第${act.sortOrder}幕 ${act.title}`);
  }

  lines.push('');
  lines.push('角色清单（characterName 必须与以下 name 完全一致）：');
  for (const char of characters) {
    lines.push(`- ${char.name}（${char.roleIdentity}）`);
  }

  lines.push('');
  lines.push('timeline_full 原文（请从中识别时间点并按角色拆分事件）：');
  lines.push(timelineFull || '（空）');

  lines.push('');
  lines.push('请按系统提示词规定的 JSON 结构输出结构化时间线事件，自然语言时间换算为 HH:MM（跨天同步更新 day 字段），每个时间点按涉及角色拆成独立事件，并补全 day / eventType / participants / thread / causes 字段。');

  return lines.join('\n');
}

/**
 * 构造完整 prompt = system + user（以分隔标记组合，便于日志与调试）
 */
export function buildTimelineStructurePrompt(input: TimelineStructurePromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: buildTimelineStructureSystemPrompt(),
    userPrompt: buildTimelineStructureUserPrompt(input),
  };
}
