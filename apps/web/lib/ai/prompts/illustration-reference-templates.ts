import type { IllustrationTaskType } from '@/types';

export type IllustrationTemplateKind = 'reference' | 'style';

export interface IllustrationReferenceTemplate {
  id: string;
  kind: IllustrationTemplateKind;
  title: string;
  subtitle: string;
  promptHint: string;
  allowedTypes: IllustrationTaskType[];
  swatch: string;
}

export const ILLUSTRATION_REFERENCE_TEMPLATES: IllustrationReferenceTemplate[] = [
  {
    id: 'ref-clue-card-finished',
    kind: 'reference',
    title: '线索卡成品',
    subtitle: '卡框 / 标题 / 图文区',
    promptHint:
      '参考线索卡成品版式：竖向纸质卡片、圆角卡框、顶部标题栏、中部证物图、底部简短说明文字，必须像可打印线索卡而不是单独物件图。',
    allowedTypes: ['clue'],
    swatch: 'linear-gradient(135deg, rgba(243,233,219,.95), rgba(176,141,87,.5))',
  },
  {
    id: 'ref-cover-white-poster',
    kind: 'reference',
    title: '留白封面',
    subtitle: '书封 / 平面排版',
    promptHint:
      '参考剧本杀书封：竖版封面、强留白、人物与核心意象服务标题排版，顶部或侧边保留文字区，整体像封面成品而不是横向场景图。',
    allowedTypes: ['cover', 'poster'],
    swatch: 'linear-gradient(135deg, rgba(255,252,246,.95), rgba(138,28,28,.34))',
  },
  {
    id: 'ref-character-standee',
    kind: 'reference',
    title: '人物立绘',
    subtitle: '单人 / 干净背景',
    promptHint:
      '参考角色立绘资产：单人半身或全身，干净背景，五官、发型、服饰清晰，避免复杂场景和多人同框。',
    allowedTypes: ['char'],
    swatch: 'linear-gradient(135deg, rgba(92,66,120,.45), rgba(253,248,240,.88))',
  },
  {
    id: 'style-ink-noir',
    kind: 'style',
    title: '水墨悬疑',
    subtitle: '暗调暖光 / 留白',
    promptHint:
      '风格模板：水墨古风、暗调暖光、留白构图、悬疑氛围，纸张肌理与轻微旧化质感，整体保持同一剧本视觉系统。',
    allowedTypes: ['cover', 'scene', 'clue', 'public', 'char', 'poster'],
    swatch: 'linear-gradient(135deg, rgba(26,20,16,.88), rgba(176,141,87,.48))',
  },
  {
    id: 'style-republic-paper',
    kind: 'style',
    title: '民国旧纸',
    subtitle: '泛黄纸面 / 红黑印刷',
    promptHint:
      '风格模板：民国旧纸质感、低饱和米白底、红黑印刷点缀、轻微折痕和污渍，适合封面、线索卡和宣传物料统一成套。',
    allowedTypes: ['cover', 'clue', 'poster', 'public'],
    swatch: 'linear-gradient(135deg, rgba(248,243,232,.98), rgba(138,28,28,.42))',
  },
];

export function getTemplatesForType(type: IllustrationTaskType): IllustrationReferenceTemplate[] {
  return ILLUSTRATION_REFERENCE_TEMPLATES.filter((template) => template.allowedTypes.includes(type));
}

export function applyIllustrationTemplates(prompt: string, templateIds: string[] = []): string {
  const selected = ILLUSTRATION_REFERENCE_TEMPLATES.filter((template) => templateIds.includes(template.id));
  if (selected.length === 0) return prompt;
  const additions = selected.map((template) => template.promptHint).join('。');
  return `${prompt.trim()}。参考图/风格模板：${additions}`;
}
