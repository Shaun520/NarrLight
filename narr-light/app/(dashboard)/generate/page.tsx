/**
 * 剧本 AI 生成页（视图2）
 *
 * 客户端组件，useState 管理表单参数与生成状态。
 * 左侧 ParamForm 创作参数，右侧 GenPanel 流式输出。
 * 流式生成先用 Mock（setInterval 模拟），真实 Provider 调用留接口。
 * 合规预检开启时，对每个 chunk 调用 checkContentSafety，命中即中断并弹窗。
 * 对齐原型 #view-generate 结构。
 */
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Play, FileDown } from 'lucide-react';
import { ParamForm } from '@/components/generate/param-form';
import { GenPanel, type StreamLine } from '@/components/generate/gen-panel';
import { ContentBlockedModal } from '@/components/common/content-blocked-modal';
import { checkContentSafety } from '@/lib/utils/content-safety';
import type { ScriptGenerationParams } from '@/lib/ai/prompts/script-generation';
import './generate.css';

/** 默认参数（对齐原型默认值） */
const DEFAULT_PARAMS: ScriptGenerationParams = {
  title: '古镇迷案',
  genre: 'hardcore',
  players: 6,
  duration: 5,
  difficulty: 'intermediate',
  background: '清末民初 · 江南古镇',
  theme: '家国亲情 · 旧恨新仇',
  ageRating: 'SIXTEEN_PLUS',
  writingStyle: '白描清雅',
  switches: { noEdgeRole: true, compliancePreCheck: true, mechanismRules: false },
  extraReq: '含叙述性诡计，第二幕设置公共搜证环节，凶手具备反侦察意识。',
};

/** Mock 流式输出内容（真实场景由 Edge Function SSE 推送） */
const MOCK_LINES: StreamLine[] = [
  { type: 'label', text: '【人物剧本 · 沈墨白 / 死者视角】' },
  {
    type: 'content',
    text: '光绪二十六年，霜降。江南的雨下了整七日，青石板路泛着冷光。我推开沈宅大门时，堂前那盏纸灯笼正被风吹得摇摇欲坠。',
  },
  {
    type: 'content',
    text: '"墨白，你终于回来了。"二弟沈墨尘立于廊下，语气平静得不像时隔三年重逢。',
  },
  {
    type: 'content',
    text: '我没答话。怀中那封匿名信烫得胸口发疼——"沈家秘宝现世，廿六夜，古镇祠堂。"落款是一枚朱砂印，正是当年父亲失踪前惯用的私章。',
  },
  { type: 'label', text: '【第二幕 · 公共搜证】' },
  {
    type: 'content',
    text: 'DM 提示：本环节全员可前往以下三处地点搜证，每处限时 8 分钟。',
  },
  {
    type: 'content',
    text: '› 祠堂东侧厢房：发现一封被火焚毁大半的族谱残页，记载"过继"二字。',
  },
  {
    type: 'content',
    text: '› 沈宅书房暗格：一只铜锁木匣，内藏三张不同笔迹的借据，债主皆为沈墨白。',
  },
  {
    type: 'content',
    text: '› 古镇药铺后院：三包未贴标签的草药，经辨认含乌头碱痕迹。',
  },
];

/** 模型标识 */
const MODEL_TAG = 'deepseek-v4-pro';

export default function GeneratePage() {
  const [params, setParams] = useState<ScriptGenerationParams>(DEFAULT_PARAMS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState('待机');
  const [wordCount, setWordCount] = useState(0);
  const [eta, setEta] = useState('--');
  const [checklist, setChecklist] = useState('⏳ 人物剧本　⏳ 组织者手册　⏳ 线索卡　⏳ 真相复盘');
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [blocked, setBlocked] = useState<{ open: boolean; reason: string; suggestion: string }>({
    open: false,
    reason: '',
    suggestion: '',
  });

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleChange = (patch: Partial<ScriptGenerationParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  };

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /** 启动 Mock 流式生成 */
  const handleGenerate = () => {
    if (isGenerating) return;
    if (!params.title.trim()) return;

    stopTimer();
    setIsGenerating(true);
    setLines([]);
    setPercent(0);
    setWordCount(0);
    setStage('正在生成：人物剧本');
    setChecklist('⏳ 人物剧本　⏳ 组织者手册　⏳ 线索卡　⏳ 真相复盘');
    setEta('计算中…');

    let idx = 0;
    const total = MOCK_LINES.length;

    timerRef.current = window.setInterval(() => {
      if (idx >= total) {
        stopTimer();
        setPercent(100);
        setStage('生成完成');
        setChecklist('✓ 人物剧本　✓ 组织者手册　✓ 线索卡　✓ 真相复盘');
        setEta('0s');
        setIsGenerating(false);
        return;
      }

      const line = MOCK_LINES[idx];

      // 合规预检：开启时对每行内容做敏感词检查，命中即中断
      if (params.switches.compliancePreCheck) {
        const safety = checkContentSafety(line.text);
        if (!safety.safe) {
          stopTimer();
          setIsGenerating(false);
          setStage('内容违规，已中断');
          setBlocked({
            open: true,
            reason: `命中敏感词：${safety.flaggedWords.join('、')}`,
            suggestion: '请调整附加要求、降低适龄分级或关闭合规预检后重试。',
          });
          return;
        }
      }

      setLines((prev) => [...prev, line]);
      setWordCount((prev) => prev + line.text.length);
      const p = Math.min(99, Math.round(((idx + 1) / total) * 100));
      setPercent(p);
      setStage(idx < 4 ? '正在生成：人物剧本' : '正在生成：第二幕 · 公共搜证');
      setChecklist(
        idx < 4
          ? '⏳ 人物剧本　⏳ 组织者手册　⏳ 线索卡　⏳ 真相复盘'
          : idx < 6
            ? '✓ 人物剧本　⏳ 组织者手册　⏳ 线索卡　⏳ 真相复盘'
            : '✓ 人物剧本　✓ 组织者手册　⏳ 线索卡　⏳ 真相复盘',
      );
      setEta(`${Math.max(1, (total - idx) * 3)}s`);
      idx++;
    }, 360);
  };

  /** 载入草稿：重置为默认参数 */
  const handleLoadDraft = () => {
    stopTimer();
    setIsGenerating(false);
    setParams(DEFAULT_PARAMS);
    setLines([]);
    setPercent(0);
    setWordCount(0);
    setStage('待机');
    setEta('--');
    setChecklist('⏳ 人物剧本　⏳ 组织者手册　⏳ 线索卡　⏳ 真相复盘');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            剧本 AI 生成 <span className="seal">P1 核心</span>
          </h1>
          <div className="page-desc">// 设定参数 → 一键生成结构化全本 · 支持中断续传</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={handleLoadDraft}>
            <FileDown size={14} />
            载入草稿
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={isGenerating || !params.title.trim()}
          >
            <Play size={14} />
            开始生成
          </button>
        </div>
      </div>

      <div className="gen-layout">
        <ParamForm
          params={params}
          onChange={handleChange}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
        <GenPanel
          isGenerating={isGenerating}
          model={MODEL_TAG}
          percent={percent}
          stage={stage}
          wordCount={wordCount}
          eta={eta}
          checklist={checklist}
          lines={lines}
        />
      </div>

      <ContentBlockedModal
        open={blocked.open}
        onClose={() => setBlocked((prev) => ({ ...prev, open: false }))}
        reason={blocked.reason}
        suggestion={blocked.suggestion}
      />
    </>
  );
}
