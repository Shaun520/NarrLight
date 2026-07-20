import { describe, expect, it } from 'vitest';
import { evaluateIllustrationQuality } from '@/lib/services/illustration-quality';

describe('evaluateIllustrationQuality', () => {
  it('flags clue tasks that look like object-only illustrations', () => {
    const result = evaluateIllustrationQuality({
      taskType: 'clue',
      prompt: '餐厅酒柜中的空酒瓶，线索卡配图层，只生成证据物件特写',
      ratio: '4:3',
    });

    expect(result.status).toBe('warning');
    expect(result.message).toContain('配图非卡片成品');
  });

  it('passes clue tasks with finished card layout signals', () => {
    const result = evaluateIllustrationQuality({
      taskType: 'clue',
      prompt: '线索卡成品，竖向纸质卡片，顶部标题栏，中部证物图，底部说明文字',
      ratio: '3:4',
    });

    expect(result.status).toBe('passed');
  });

  it('flags cover tasks with landscape ratio', () => {
    const result = evaluateIllustrationQuality({
      taskType: 'cover',
      prompt: '剧本封面，标题留白，书封排版',
      ratio: '16:9',
    });

    expect(result.status).toBe('warning');
    expect(result.message).toContain('封面比例不符');
  });
});
