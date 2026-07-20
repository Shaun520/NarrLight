/**
 * 插画风格统一性与人物形象一致性控制（T188）
 *
 * 提供插画生成的视觉基调推导与 Prompt 构建工具：
 *   - buildVisualTone: 从剧本 writingStyle + backgroundSetting 推导视觉基调
 *     （风格 / 光影 / 构图 / 氛围 四维度）
 *   - buildIllustrationPrompt: 组合资产描述 + 视觉基调 + 引用资产，构建最终 prompt
 *   - buildCharacterConsistencyPrompt: 人物形象一致性 prompt（多表情差分）
 *   - buildSceneStylePrompt: 场景风格 prompt
 *   - buildCoverPrompt: 封面 prompt
 *
 * 设计目标：保证同一剧本下所有插画风格统一、人物形象跨场景一致。
 */

/** 剧本视觉推导输入（字段对齐 scripts 表） */
export interface ScriptVisualInput {
  title: string;
  /** 题材：hardcore/emotion/horror/funny/mechanism */
  genre: string;
  /** 时代与场景背景，如 "民国·江南古镇" */
  backgroundSetting: string;
  /** 核心主题，如 "雨夜复仇" */
  coreTheme?: string;
  /** 写作风格基调，如 "水墨古风" */
  writingStyle?: string;
}

/** 插画资产输入 */
export interface IllustrationAssetInput {
  id: string;
  /** 资产类型 */
  type: 'cover' | 'scene' | 'clue' | 'public' | 'char' | 'poster';
  /** 资产标题，如 "药铺后院 · 柴房" */
  title: string;
  /** 画面描述（可选，无则用标题） */
  description?: string;
}

/** 引用资产输入（用于 prompt 注入参考线索） */
export interface RefAssetInput {
  id: string;
  title: string;
}

/** 人物输入（对齐 characters 表子集） */
export interface CharacterConsistencyInput {
  name: string;
  roleIdentity: string;
  gender: 'male' | 'female' | 'unknown' | '';
  age: number | null;
  personality: string;
  backgroundStory: string;
}

/** 场景输入（对齐 scenes 表子集） */
export interface SceneStyleInput {
  title: string;
  location: string;
  content: string;
}

/** 视觉基调：四维度 */
export interface VisualTone {
  /** 风格，如 "水墨古风" */
  style: string;
  /** 光影，如 "暗调暖光" */
  lighting: string;
  /** 构图，如 "留白构图" */
  composition: string;
  /** 氛围，如 "雨夜氛围" */
  mood: string;
}

/** 题材 → 默认风格映射 */
const GENRE_STYLE: Record<string, string> = {
  hardcore: '水墨古风',
  emotion: '水彩柔焦',
  horror: '暗黑哥特',
  funny: '明亮卡通',
  mechanism: '工业写实',
};

/** 关键词 → 光影映射 */
const LIGHTING_RULES: Array<{ keyword: string; value: string }> = [
  { keyword: '雨', value: '暗调暖光' },
  { keyword: '夜', value: '暗调暖光' },
  { keyword: '雪', value: '冷调高光' },
  { keyword: '雾', value: '低对比柔光' },
  { keyword: '日', value: '高调日光' },
  { keyword: '月', value: '冷调月光' },
  { keyword: '民', value: '暗调暖光' },
  { keyword: '古', value: '暗调暖光' },
];

/** 关键词 → 构图映射 */
const COMPOSITION_RULES: Array<{ keyword: string; value: string }> = [
  { keyword: '古', value: '留白构图' },
  { keyword: '民', value: '中心构图' },
  { keyword: '现', value: '三分法构图' },
  { keyword: '科', value: '对称构图' },
  { keyword: '恐怖', value: '倾斜构图' },
];

/** 关键词 → 氛围映射 */
const MOOD_RULES: Array<{ keyword: string; value: string }> = [
  { keyword: '雨夜', value: '雨夜氛围' },
  { keyword: '悬疑', value: '悬疑氛围' },
  { keyword: '复仇', value: '压抑氛围' },
  { keyword: '情感', value: '惆怅氛围' },
  { keyword: '恐怖', value: '惊悚氛围' },
  { keyword: '欢乐', value: '欢快氛围' },
  { keyword: '古镇', value: '雨夜氛围' },
];

/** 在规则列表中按关键词匹配，命中则返回对应 value，否则返回 fallback */
function matchRule(
  text: string,
  rules: Array<{ keyword: string; value: string }>,
  fallback: string,
): string {
  const hit = rules.find((r) => text.includes(r.keyword));
  return hit ? hit.value : fallback;
}

/**
 * 从剧本 writingStyle + backgroundSetting 生成视觉基调。
 * 返回如 "水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围"
 */
export function buildVisualTone(script: ScriptVisualInput): VisualTone {
  const text = `${script.backgroundSetting} ${script.coreTheme ?? ''} ${script.writingStyle ?? ''}`;

  const style = script.writingStyle ?? GENRE_STYLE[script.genre] ?? '水墨古风';
  const lighting = matchRule(text, LIGHTING_RULES, '暗调暖光');
  const composition = matchRule(text, COMPOSITION_RULES, '留白构图');
  const mood = matchRule(text, MOOD_RULES, '悬疑氛围');

  return { style, lighting, composition, mood };
}

/** 将 VisualTone 序列化为注入文案 */
export function formatVisualTone(tone: VisualTone): string {
  return `${tone.style} / ${tone.lighting} / ${tone.composition} / ${tone.mood}`;
}

function compactText(value?: string | null): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function sentenceJoin(parts: Array<string | undefined | null>): string {
  return parts.map((part) => compactText(part)).filter(Boolean).join('。');
}

/** 资产类型 → 中文标签 */
const TYPE_LABEL: Record<IllustrationAssetInput['type'], string> = {
  cover: '剧本封面',
  scene: '场景插画',
  clue: '线索卡',
  public: '公共线',
  char: '人物立绘',
  poster: '宣传海报',
};

export const DEFAULT_ILLUSTRATION_RATIOS: Record<IllustrationAssetInput['type'], string> = {
  cover: '3:4',
  scene: '16:9',
  clue: '4:3',
  public: '16:9',
  char: '3:4',
  poster: '3:4',
};

export function getDefaultIllustrationRatio(type: IllustrationAssetInput['type']): string {
  return DEFAULT_ILLUSTRATION_RATIOS[type] ?? '16:9';
}

function buildRefHint(refs: RefAssetInput[]): string {
  if (refs.length === 0) return '';
  const refHint = refs.map((r) => r.title).join('、');
  return `参考已生成资产：${refHint}，保持同一剧本的色调、笔触和世界观一致`;
}

function typedMaterialInstruction(type: IllustrationAssetInput['type']): string {
  switch (type) {
    case 'clue':
      return [
        '输出目标：线索卡配图层，不是完整插画场景',
        '画面只呈现线索物件、局部现场或证据特写，适合嵌入线索卡中部图片区',
        '禁止生成卡牌边框、标题栏、说明文字、二维码、水印、UI按钮',
        '构图干净，主体居中，预留四周安全边距，方便后续系统模板排版正文',
      ].join('。');
    case 'cover':
      return [
        '输出目标：剧本封面视觉底图层，不是普通场景插画',
        '采用竖版封面构图，强平面设计感，大面积留白，人物或核心意象服务标题排版',
        '顶部或右侧预留标题、作者、发行信息区域',
        '禁止生成可读文字、Logo、书脊、UI按钮、水印',
      ].join('。');
    case 'char':
      return [
        '输出目标：人物立绘资产，不是剧情场景图',
        '单人半身或全身，正面或三分之二侧身，干净纯色或透明感背景',
        '强调五官、发型、服饰、身形比例一致，便于后续多表情和复用',
        '禁止复杂场景、多人同框、海报排版、标题文字',
      ].join('。');
    case 'poster':
      return [
        '输出目标：宣传海报视觉底图层',
        '允许强冲击构图和宣传氛围，但文字、标题、卖点文案由系统后期排版',
        '预留标题和行动召唤区域，禁止模型直接生成可读文字',
      ].join('。');
    case 'public':
      return [
        '输出目标：公共线氛围图',
        '表达全体玩家共同可见的信息、地点或关键氛围，不绑定单一人物视角',
        '禁止卡牌边框、封面标题和说明文字',
      ].join('。');
    case 'scene':
    default:
      return [
        '输出目标：场景插画',
        '强调空间纵深、环境叙事和关键道具位置，人物可作为远景剪影',
        '禁止卡牌边框、封面排版、说明文字和水印',
      ].join('。');
  }
}

/**
 * 构建插画生成 prompt（组合画面描述 + 视觉基调 + 引用资产线索）。
 * @param asset       目标资产
 * @param visualTone  视觉基调（由 buildVisualTone 生成）
 * @param refs        引用资产列表（可选，提供风格/元素参考）
 */
export function buildIllustrationPrompt(
  asset: IllustrationAssetInput,
  visualTone: VisualTone,
  refs: RefAssetInput[] = [],
): string {
  const desc = asset.description?.trim() || asset.title;
  const tone = formatVisualTone(visualTone);
  const parts = [
    `${TYPE_LABEL[asset.type]}：${desc}`,
    typedMaterialInstruction(asset.type),
    `视觉基调：${tone}`,
  ];

  const refHint = buildRefHint(refs);
  if (refHint) parts.push(refHint);

  parts.push('保持与同剧本其他资产风格统一，但严格服从当前输出目标');
  return parts.join('。');
}

/**
 * 人物形象一致性 prompt（多表情差分）。
 * 用于人物立绘生成，确保同一角色跨场景形象一致，可指定多个表情差分。
 * @param character  人物信息
 * @param expressions 需要的表情差分列表，如 ["微笑", "忧郁", "惊愕"]
 */
export function buildCharacterConsistencyPrompt(
  character: CharacterConsistencyInput,
  expressions: string[] = ['微笑', '忧郁', '惊愕'],
): string {
  const genderLabel =
    character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '';
  const ageLabel = character.age ? `${character.age}岁` : '';
  const identity = [genderLabel, ageLabel, character.roleIdentity]
    .map(compactText)
    .filter(Boolean)
    .join(' · ');

  const lines = [
    identity ? `人物立绘 · ${character.name}（${identity}）` : `人物立绘 · ${character.name}`,
    character.personality ? `性格：${character.personality}` : '',
    character.backgroundStory ? `背景：${character.backgroundStory}` : '',
    `表情差分：${expressions.join(' / ')}，保持五官、发型、服饰完全一致`,
    typedMaterialInstruction('char'),
    '人物必须是可复用角色资产，优先清晰轮廓和服装识别度',
  ];
  return sentenceJoin(lines);
}

/**
 * 场景风格 prompt。
 * 用于场景插画生成，强调空间感与氛围。
 */
export function buildSceneStylePrompt(scene: SceneStyleInput, visualTone: VisualTone): string {
  const tone = formatVisualTone(visualTone);
  const title = compactText(scene.location) ? `${scene.title}（${scene.location}）` : scene.title;
  return sentenceJoin([
    title,
    scene.content.slice(0, 80),
    tone,
    '强调空间纵深感与环境叙事细节，无人物或人物仅作远景剪影',
  ]);
}

/**
 * 封面 prompt。
 * 用于剧本封面生成，强调主视觉冲击力与标题留白。
 */
export function buildCoverPrompt(script: ScriptVisualInput, visualTone: VisualTone): string {
  const tone = formatVisualTone(visualTone);
  const setting = compactText(script.backgroundSetting);
  const theme = compactText(script.coreTheme);
  return sentenceJoin([
    `${script.title} · 剧本封面视觉底图`,
    theme ? `${setting}，主题：${theme}` : setting,
    tone,
    typedMaterialInstruction('cover'),
    '参考剧本杀封面和平面书籍封面设计，画面服务后续标题排版，而不是生成单纯风景插图',
  ]);
}
