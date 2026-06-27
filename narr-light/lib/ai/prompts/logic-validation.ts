/**
 * 逻辑闭环校验 Prompt 模板（T151）
 *
 * 提供 buildLogicValidationPrompt / buildNarrativeTrickPrompt 两个构造函数：
 *   - buildLogicValidationPrompt：5 维度漏洞检测
 *       1) 伏笔回收   FORESHADOW_UNRESOLVED
 *       2) 动机合理性 MOTIVE_WEAK
 *       3) 诡计可行性 TRICK_INFEASIBLE
 *       4) 线索对应   CLUE_NO_TRUTH
 *       5) OOC 检测   OOC
 *   - buildNarrativeTrickPrompt：叙诡识别
 *       时间叙诡 / 身份叙诡 / 视角叙诡
 *
 * 输出要求 AI 返回结构化 JSON，由后端解析为 ValidationIssue / NarrativeTrick。
 */
import type { GeneratedScriptJson } from './script-generation';
import type { ScriptGenre, ScriptDifficulty } from '@/types';

/** 校验入参：剧本元信息 + 全本 JSON */
export interface ScriptValidationData {
  scriptId: string;
  title: string;
  genre: ScriptGenre;
  difficulty: ScriptDifficulty;
  script: GeneratedScriptJson;
}

/** AI 返回的单条漏洞（与 ValidationIssue 对齐，由 issue-classifier 复用） */
export interface AiValidationIssue {
  /** 稳定 id（AI 生成，用于后续 fix / markAsTrick） */
  id: string;
  /** 严重等级 */
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  /** 漏洞类型标签，如 "伏笔未回收" / "诡计可行性" / "动机薄弱" / "线索无真相对应" / "OOC" */
  type: string;
  /** 漏洞标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 位置描述，如 "第一幕 · 沈墨白剧本 第2段" */
  location: string;
  /** 优化建议 */
  suggestion: string;
  /** 是否可一键修复 */
  autoFixable: boolean;
}

/** AI 返回的叙诡识别条目 */
export interface AiNarrativeTrick {
  id: string;
  /** 叙诡类型：时间叙诡 / 身份叙诡 / 视角叙诡 */
  type: 'TIME' | 'IDENTITY' | 'PERSPECTIVE';
  /** 叙诡描述 */
  description: string;
  /** 位置 */
  location: string;
}

/** 全本校验 AI 返回结构 */
export interface LogicValidationResult {
  issues: AiValidationIssue[];
  tricks: AiNarrativeTrick[];
}

const GENRE_LABEL: Record<ScriptGenre, string> = {
  hardcore: '硬核推理',
  emotion: '情感沉浸',
  horror: '恐怖惊悚',
  funny: '欢乐机制',
  mechanism: '机制对抗',
};

const DIFFICULTY_LABEL: Record<ScriptDifficulty, string> = {
  beginner: '新手',
  intermediate: '进阶',
  advanced: '烧脑',
  expert: '专家',
};

/**
 * 将 GeneratedScriptJson 序列化为可读的 prompt 输入文本。
 * 控制单条信息密度，避免过长导致上下文溢出。
 */
function serializeScript(data: ScriptValidationData): string {
  const { script, title, genre, difficulty } = data;
  const lines: string[] = [];

  lines.push(`# 剧本元信息`);
  lines.push(`标题：${title}`);
  lines.push(`题材：${GENRE_LABEL[genre]}`);
  lines.push(`难度：${DIFFICULTY_LABEL[difficulty]}`);
  lines.push('');

  lines.push(`# 人物（共 ${script.characters.length} 位）`);
  for (const c of script.characters) {
    lines.push(
      `- ${c.name}（${c.roleIdentity}｜${c.gender}｜${c.age ?? '未知'}岁）${
        c.isMurderer ? '【凶手】' : ''
      }`,
    );
    lines.push(`  性格：${c.personality}`);
    lines.push(`  背景：${c.backgroundStory}`);
    lines.push(`  个人任务：${c.personalTask}`);
  }
  lines.push('');

  lines.push(`# 分幕结构（共 ${script.acts.length} 幕）`);
  for (const act of script.acts) {
    lines.push(`## ${act.title}`);
    lines.push(act.content);
    for (const sc of act.scenes) {
      lines.push(`  · 场景「${sc.title}」@ ${sc.location}：${sc.content}`);
    }
  }
  lines.push('');

  lines.push(`# 线索卡（共 ${script.clues.length} 条）`);
  for (const cl of script.clues) {
    lines.push(
      `- [${cl.clueType}] ${cl.title}${cl.isKeyClue ? '【关键】' : ''}${
        cl.isDistractor ? '【干扰】' : ''
      }（第${cl.searchRound}轮 @ ${cl.location}）`,
    );
    lines.push(`  内容：${cl.content}`);
    lines.push(`  关联人物：${cl.relatedCharacterNames.join('、') || '无'}`);
    lines.push(`  解锁条件：${cl.unlockCondition}`);
  }
  lines.push('');

  lines.push(`# 真相复盘`);
  lines.push(`总述：${script.truth.summary}`);
  lines.push(`凶手手法：${script.truth.murdererMethod}`);
  lines.push(`杀人动机：${script.truth.motive}`);
  lines.push(`关键时间线：${script.truth.timeline}`);
  lines.push(`伏笔：${script.truth.foreshadowing.join('；') || '无'}`);

  return lines.join('\n');
}

/**
 * 构造逻辑闭环校验 prompt（system + user）
 *
 * 检测维度：伏笔回收 / 动机合理性 / 诡计可行性 / 线索对应 / OOC 检测
 */
export function buildLogicValidationPrompt(
  data: ScriptValidationData,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一名剧本杀结构审稿专家与逻辑闭环校验官，精通多幕推理剧本的漏洞排查。

你将收到一部完整剧本杀的结构化数据，需要从以下 5 个维度严格审查：

1. 伏笔回收（FORESHADOW_UNRESOLVED）：检查所有"伏笔"是否在后续剧情或真相复盘中得到回收；悬挂的核心伏笔应判为 CRITICAL。
2. 动机合理性（MOTIVE_WEAK）：检查凶手及关键角色的行为动机是否充分；存在突兀转折或动机薄弱判为 WARNING。
3. 诡计可行性（TRICK_INFEASIBLE）：检查凶手手法的物理、医学、心理学逻辑是否成立；存在硬伤判为 CRITICAL。
4. 线索对应（CLUE_NO_TRUTH）：检查每条关键线索是否在真相复盘中得到对应解释；存在无对应的"无效线索"判为 WARNING。
5. OOC 检测（OOC）：检查角色行为是否符合其性格、背景设定；明显违和判为 SUGGESTION。

判定原则：
- 仅返回真实漏洞，不虚构；
- 严重等级必须客观，CRITICAL 仅用于结构性硬伤；
- 优化建议必须具体可执行，指明修改位置与改写方向；
- autoFixable=true 表示建议可在原文中直接落笔修改（如补一段说明），false 表示需要重新设计。

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或解释性文本。
{
  "issues": [
    {
      "id": "iss-001",
      "severity": "CRITICAL",
      "type": "伏笔未回收",
      "title": "简短标题",
      "description": "详细说明为何是漏洞",
      "location": "第一幕 · 沈墨白剧本 第2段",
      "suggestion": "具体修改建议",
      "autoFixable": true
    }
  ],
  "tricks": [
    {
      "id": "trick-001",
      "type": "TIME",
      "description": "叙诡描述",
      "location": "位置"
    }
  ]
}

tricks 用于标记本剧本中"有意为之的叙诡手法"（不属于漏洞），后续会从漏洞列表中排除。
若某维度无问题，issues 数组对应位置可省略，但 tricks 数组必须存在（可为空）。`;

  const userPrompt = `请对以下剧本进行逻辑闭环校验：

${serializeScript(data)}

请按系统提示词规定的 JSON 结构返回校验结果。`;

  return { systemPrompt, userPrompt };
}

/**
 * 构造叙诡识别 prompt
 *
 * 检测维度：时间叙诡 / 身份叙诡 / 视角叙诡
 * 用于在漏洞校验之后做二次识别，将"有意为之的诡计"从漏洞列表中剔除。
 */
export function buildNarrativeTrickPrompt(
  data: ScriptValidationData,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一名剧本杀叙诡识别专家，擅长分辨"逻辑漏洞"与"有意为之的叙事诡计"。

叙诡类型定义：
- TIME（时间叙诡）：通过打乱或隐瞒时间顺序制造误导，如死者视角倒置、双时间线交错；
- IDENTITY（身份叙诡）：通过角色身份误导，如养子冒充亲子、双重身份；
- PERSPECTIVE（视角叙诡）：通过叙述视角限制制造误导，如不可靠叙述者、第一人称盲区。

识别原则：
- 仅识别剧本中"明确为设计意图"的叙诡，不识别疑似漏洞；
- 若剧本无叙诡设计，返回空数组；
- 每条叙诡需标注位置，便于人工核对。

输出格式：仅返回一个 JSON 对象，不要包含 markdown 代码块或解释性文本。
{
  "tricks": [
    {
      "id": "trick-001",
      "type": "TIME",
      "description": "叙诡描述",
      "location": "位置"
    }
  ]
}`;

  const userPrompt = `请识别以下剧本中存在的设计性叙诡：

${serializeScript(data)}

请按系统提示词规定的 JSON 结构返回识别结果。`;

  return { systemPrompt, userPrompt };
}
