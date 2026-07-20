/**
 * 新建生成任务抽屉（T187）
 *
 * 4 步表单抽屉：BASIC → PROMPT → PARAMS → CONFIRM。
 * 通过 createPortal 渲染到 document.body，作为 .main 的兄弟节点，
 * 避免与 topbar(z-index 4) 层级冲突（mask=90 / drawer=91）。
 *
 * 样式：朱砂左边框 + "拟"字印章装饰（见 illustrations.css .newtask-drawer::before）
 * 视觉与 class 命名对齐原型 workbench2.html .newtask-drawer
 */
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookImage,
  ChevronRight,
  Globe,
  Info,
  MapPinned,
  Megaphone,
  Play,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import {
  ariaProps,
  focusTrapProps,
  iconButtonAria,
  keyboardNavProps,
} from '@/lib/utils/a11y';
import { getDefaultIllustrationRatio } from '@/lib/ai/prompts/illustration-style';
import type { AssetType } from './asset-list';

/** 抽屉表单数据 */
export interface NewTaskFormData {
  taskName: string;
  type: AssetType;
  bindTarget: string;
  prompt: string;
  models: string[];
  ratio: string;
  count: number;
  steps: number;
  cfg: number;
  styleStrength: number;
  refs: string[];
  negativePrompt: string;
  seed: string;
  hdFix: boolean;
}

interface NewTaskDrawerProps {
  /** 是否展开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 提交回调（CONFIRM 步点击"加入生成队列"） */
  onSubmit?: (data: NewTaskFormData) => void;
  /** AUTO-INJECT 视觉基调文案 */
  visualTone?: string;
  scriptTitle?: string;
}

/** 任务类型卡配置 */
const TYPE_CARDS: { type: AssetType; name: string; count: string; Icon: typeof BookImage }[] = [
  { type: 'cover', name: '剧本封面', count: '6 / 6', Icon: BookImage },
  { type: 'scene', name: '场景插画', count: '5 / 7', Icon: MapPinned },
  { type: 'clue', name: '线索卡', count: '1 / 4', Icon: BookImage },
  { type: 'public', name: '公共线', count: '1 / 2', Icon: Globe },
  { type: 'char', name: '人物立绘', count: '0 / 3', Icon: UserRound },
  { type: 'poster', name: '宣传海报', count: '0 / 2', Icon: Megaphone },
];

/** 模型卡配置 */
const MODEL_CARDS = [
  { id: 'deepseek', name: 'DeepSeek-V4', desc: '水墨质感强 / 古风最优' },
  { id: 'glm', name: 'GLM-5.1', desc: '细节丰富 / 写实倾向' },
  { id: 'fusion', name: '多模态融合', desc: '自动融合上两者 / 较慢' },
];

/** 比例选项 */
const RATIO_OPTIONS = ['1:1', '4:3', '16:9', '3:4', '9:16'];
/** 张数选项 */
const COUNT_OPTIONS = [1, 4, 8];

/** 引用资产缩略图（8 张，复用原型 seed） */
const REF_THUMBS = [
  "linear-gradient(135deg,rgba(58,42,26,0.55),rgba(26,20,16,0.65)),url('https://picsum.photos/seed/narrRainyTown/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(58,42,26,0.7),rgba(26,20,16,0.8)),url('https://picsum.photos/seed/narrCoverShenMobai/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(42,42,58,0.7),rgba(26,20,16,0.8)),url('https://picsum.photos/seed/narrCoverShenMochen/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(42,26,42,0.55),rgba(26,20,16,0.65)),url('https://picsum.photos/seed/narrStudy/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(26,42,42,0.55),rgba(26,20,16,0.65)),url('https://picsum.photos/seed/narrShrine/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(58,90,122,0.5),rgba(26,20,16,0.7)),url('https://picsum.photos/seed/narrPublicRain/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(58,42,26,0.7),rgba(26,20,16,0.8)),url('https://picsum.photos/seed/narrIou/80/80?grayscale') center/cover",
  "linear-gradient(135deg,rgba(42,26,26,0.7),rgba(26,20,16,0.8)),url('https://picsum.photos/seed/narrCrime/80/80?grayscale') center/cover",
];

const STEPS = ['1·基础', '2·Prompt', '3·参数', '4·确认'];

/** 初始表单数据 */
const INITIAL_DATA: NewTaskFormData = {
  taskName: '柳如烟 · 剧本封面 · 雨夜',
  type: 'cover',
  bindTarget: '柳如烟 · 第二女主角（民国 / 24岁 / 沈家少奶奶）',
  prompt:
    '雨夜中的民国女子，身着青色旗袍立于药铺后院檐下，手持油纸伞，伞沿滴落水珠。半身构图，侧脸回眸，神情忧郁。背景柴房半掩，昏黄油灯透出暖光。水墨质感，冷峻色调，留白构图，悬疑氛围。',
  models: ['deepseek', 'glm'],
  ratio: getDefaultIllustrationRatio('cover'),
  count: 4,
  steps: 32,
  cfg: 7,
  styleStrength: 65,
  refs: ['1'],
  negativePrompt: '模糊，变形，多余手指，水印，文字，低质量，过度曝光',
  seed: '8421',
  hdFix: true,
};

/**
 * 新建任务抽屉组件
 */
export function NewTaskDrawer({ open, onClose, onSubmit, visualTone, scriptTitle }: NewTaskDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<NewTaskFormData>(INITIAL_DATA);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // 挂载后才能使用 portal（SSR 安全）
  useEffect(() => {
    setMounted(true);
  }, []);

  // 打开时锁定 body 滚动 + ESC 关闭
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // 打开时重置到第一步
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  if (!mounted) return null;

  const update = <K extends keyof NewTaskFormData>(key: K, value: NewTaskFormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  };

  const updateType = (type: AssetType) => {
    setData((d) => ({ ...d, type, ratio: getDefaultIllustrationRatio(type) }));
  };

  const toggleModel = (id: string) => {
    setData((d) => ({
      ...d,
      models: d.models.includes(id)
        ? d.models.filter((m) => m !== id)
        : [...d.models, id],
    }));
  };

  const toggleRef = (id: string) => {
    setData((d) => ({
      ...d,
      refs: d.refs.includes(id) ? d.refs.filter((r) => r !== id) : [...d.refs, id],
    }));
  };

  const handleSubmit = () => {
    onSubmit?.(data);
    onClose();
  };

  const typeName = TYPE_CARDS.find((t) => t.type === data.type)?.name ?? data.type;
  const modelNames = data.models
    .map((id) => MODEL_CARDS.find((m) => m.id === id)?.name ?? id)
    .join(' / ');

  // 焦点陷阱属性：仅在打开时启用，避免 Tab 跳出抽屉
  const trapProps = open ? focusTrapProps() : null;

  return createPortal(
    <>
      <div
        className={`newtask-mask ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`newtask-drawer ${open ? 'show' : ''}`}
        aria-hidden={!open}
        aria-modal={open ? 'true' : undefined}
        role="dialog"
        aria-label={`新建生成任务${scriptTitle ? ` · ${scriptTitle}` : ''}`}
        tabIndex={-1}
        {...trapProps}
      >
        {/* 头部 */}
        <div className="nt-head">
          <h3>
            <Zap size={18} />
            新建生成任务 <span className="seal">NEW</span>
          </h3>
          <div className="nt-step-bar">
            {STEPS.map((s, i) => (
              <span key={s} className={`nt-step ${step === i + 1 ? 'active' : ''}`}>
                {s}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="nt-close"
            onClick={onClose}
            {...iconButtonAria('关闭新建任务抽屉')}
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体（按步骤切换） */}
        <div className="nt-body">
          {step === 1 && (
            <>
              <div className="nt-section">
                <div className="nt-section-title">BASIC · 基础信息</div>
                <label className="nt-label">任务名称</label>
                <input
                  className="nt-input"
                  type="text"
                  placeholder="如：药铺后院 · 柴房 · 雨夜特写"
                  value={data.taskName}
                  onChange={(e) => update('taskName', e.target.value)}
                />
                <div className="nt-hint">
                  <Info size={12} />
                  建议包含 场景 + 主体 + 氛围 三要素
                </div>
              </div>

              <div className="nt-section">
                <div className="nt-section-title">TYPE · 任务类型</div>
                <div className="nt-type-grid">
                  {TYPE_CARDS.map(({ type, name, count, Icon }) => (
                    <div
                      key={type}
                      className={`nt-type-card ${data.type === type ? 'active' : ''}`}
                      onClick={() => updateType(type)}
                      role="button"
                      {...ariaProps(`选择任务类型 ${name}`)}
                      {...keyboardNavProps(() => updateType(type))}
                    >
                      <div className="ntt-icon">
                        <Icon />
                      </div>
                      <div className="ntt-name">{name}</div>
                      <div className="ntt-count">{count}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="nt-section">
                <div className="nt-section-title">BIND · 关联剧本元素</div>
                <label className="nt-label">关联角色 / 场景</label>
                <select
                  className="nt-select"
                  value={data.bindTarget}
                  onChange={(e) => update('bindTarget', e.target.value)}
                >
                  <option>柳如烟 · 第二女主角（民国 / 24岁 / 沈家少奶奶）</option>
                  <option>沈墨白 · 第一主角（民国 / 26岁 / 沈家长子）</option>
                  <option>沈墨尘 · 第二主角（民国 / 28岁 / 沈家次子）</option>
                  <option>药铺后院 · 第二幕核心场景</option>
                  <option>祠堂厢房 · 第二幕场景</option>
                  <option>无关联（独立插画）</option>
                </select>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="nt-section">
              <div className="nt-section-title">PROMPT · 画面描述</div>
              <label className="nt-label">正向提示词（中文/英文皆可）</label>
              <textarea
                className="nt-textarea"
                placeholder="描述你想要的画面…"
                value={data.prompt}
                onChange={(e) => update('prompt', e.target.value)}
              />
              <div className="nt-hint">
                <Zap size={12} />
                AUTO-INJECT：系统已自动注入剧本视觉基调（
                {visualTone ?? '水墨古风 / 暗调暖光 / 留白构图 / 雨夜氛围'}）
              </div>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="nt-section">
                <div className="nt-section-title">MODELS · 多模型对比（可多选）</div>
                <div className="nt-model-grid">
                  {MODEL_CARDS.map((m) => (
                    <div
                      key={m.id}
                      className={`nt-model-card ${data.models.includes(m.id) ? 'active' : ''}`}
                      onClick={() => toggleModel(m.id)}
                      role="button"
                      {...ariaProps(`切换模型 ${m.name}`)}
                      {...keyboardNavProps(() => toggleModel(m.id))}
                    >
                      <div className="ntm-check" />
                      <div className="ntm-name">{m.name}</div>
                      <div className="ntm-desc">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="nt-section">
                <div className="nt-section-title">PARAMS · 生成参数</div>
                <div className="nt-params">
                  <div className="nt-param-row">
                    <span className="nt-param-label">比例</span>
                    {RATIO_OPTIONS.map((r) => (
                      <span
                        key={r}
                        className={`pc-chip ${data.ratio === r ? 'active' : ''}`}
                        onClick={() => update('ratio', r)}
                        role="button"
                        {...ariaProps(`比例 ${r}`)}
                        {...keyboardNavProps(() => update('ratio', r))}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="nt-param-row">
                    <span className="nt-param-label">张数</span>
                    {COUNT_OPTIONS.map((c) => (
                      <span
                        key={c}
                        className={`pc-chip ${data.count === c ? 'active' : ''}`}
                        onClick={() => update('count', c)}
                        role="button"
                        {...ariaProps(`张数 ${c}`)}
                        {...keyboardNavProps(() => update('count', c))}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="nt-param-row">
                    <span className="nt-param-label">采样步数</span>
                    <input
                      className="nt-slider"
                      type="range"
                      min={10}
                      max={80}
                      value={data.steps}
                      onChange={(e) => update('steps', Number(e.target.value))}
                    />
                    <span className="nt-param-val">{data.steps}</span>
                  </div>
                  <div className="nt-param-row">
                    <span className="nt-param-label">CFG 引导</span>
                    <input
                      className="nt-slider"
                      type="range"
                      min={1}
                      max={20}
                      value={data.cfg}
                      onChange={(e) => update('cfg', Number(e.target.value))}
                    />
                    <span className="nt-param-val">{data.cfg.toFixed(1)}</span>
                  </div>
                  <div className="nt-param-row">
                    <span className="nt-param-label">风格强度</span>
                    <input
                      className="nt-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={data.styleStrength}
                      onChange={(e) => update('styleStrength', Number(e.target.value))}
                    />
                    <span className="nt-param-val">{data.styleStrength}%</span>
                  </div>
                </div>
              </div>

              <div className="nt-section">
                <div className="nt-section-title">REFERENCE · 引用资产（可选）</div>
                <div className="nt-ref-grid">
                  {REF_THUMBS.map((bg, i) => {
                    const id = String(i + 1);
                    const selected = data.refs.includes(id);
                    return (
                      <div
                        key={id}
                        className={`nt-ref-card ${selected ? 'active' : ''}`}
                        onClick={() => toggleRef(id)}
                        role="button"
                        aria-pressed={selected}
                        {...ariaProps(`引用资产 ${id}${selected ? '（已选）' : ''}`)}
                        {...keyboardNavProps(() => toggleRef(id))}
                      >
                        <div className="ntr-thumb" style={{ background: bg }} />
                        <div className="ntr-check">✓</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="nt-section">
                <div className={`nt-advanced ${advancedOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="nt-adv-toggle"
                    onClick={() => setAdvancedOpen((v) => !v)}
                  >
                    <span>ADVANCED · 高级选项</span>
                    <ChevronRight size={14} className="nta-arrow" />
                  </button>
                  <div className="nt-adv-body">
                    <label className="nt-label" style={{ marginTop: 8 }}>
                      负向提示词
                    </label>
                    <textarea
                      className="nt-textarea"
                      style={{ minHeight: 60 }}
                      placeholder="如：模糊、变形、多余手指、低质量…"
                      value={data.negativePrompt}
                      onChange={(e) => update('negativePrompt', e.target.value)}
                    />
                    <div className="nt-param-row" style={{ marginTop: 14 }}>
                      <span className="nt-param-label">种子</span>
                      <input
                        className="nt-input"
                        type="text"
                        value={data.seed}
                        onChange={(e) => update('seed', e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <span className="pc-chip" onClick={() => update('seed', String(Math.floor(Math.random() * 1_000_000)))}>
                        随机
                      </span>
                    </div>
                    <div className="nt-param-row" style={{ marginTop: 10 }}>
                      <span className="nt-param-label">高分修复</span>
                      <span
                        className={`pc-chip ${data.hdFix ? 'active' : ''}`}
                        onClick={() => update('hdFix', true)}
                        role="button"
                        {...ariaProps('启用高分修复')}
                        {...keyboardNavProps(() => update('hdFix', true))}
                      >
                        启用
                      </span>
                      <span
                        className={`pc-chip ${!data.hdFix ? 'active' : ''}`}
                        onClick={() => update('hdFix', false)}
                        role="button"
                        {...ariaProps('关闭高分修复')}
                        {...keyboardNavProps(() => update('hdFix', false))}
                      >
                        关闭
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="nt-section">
              <div className="nt-section-title">CONFIRM · 确认提交</div>
              <div className="nt-hint" style={{ marginBottom: 12 }}>
                <Info size={12} />
                请核对以下任务配置，确认后加入生成队列。
              </div>
              <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--ink)' }}>
                <div><strong style={{ color: 'var(--sepia)' }}>任务名称：</strong>{data.taskName}</div>
                <div><strong style={{ color: 'var(--sepia)' }}>类型：</strong>{typeName}</div>
                <div><strong style={{ color: 'var(--sepia)' }}>关联元素：</strong>{data.bindTarget}</div>
                <div><strong style={{ color: 'var(--sepia)' }}>模型：</strong>{modelNames || '未选择'}</div>
                <div><strong style={{ color: 'var(--sepia)' }}>比例 / 张数：</strong>{data.ratio} · {data.count}</div>
                <div><strong style={{ color: 'var(--sepia)' }}>采样 / CFG / 风格：</strong>{data.steps} / {data.cfg.toFixed(1)} / {data.styleStrength}%</div>
                <div><strong style={{ color: 'var(--sepia)' }}>引用资产：</strong>{data.refs.length} 张</div>
                <div><strong style={{ color: 'var(--sepia)' }}>种子：</strong>{data.seed}（高分修复{data.hdFix ? '启用' : '关闭'}）</div>
                <div style={{ marginTop: 8, color: 'var(--sepia-soft)', fontFamily: "'Courier Prime', monospace", fontSize: 11.5 }}>
                  PROMPT · {data.prompt.slice(0, 48)}{data.prompt.length > 48 ? '…' : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="nt-foot">
          <div className="nt-foot-info">
            预计耗时 <strong>~{12 * data.count}s</strong> · 消耗 <strong>{data.count}</strong> 积分
          </div>
          {step > 1 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
            >
              上一步
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
          >
            取消
          </button>
          {step < 4 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((s) => Math.min(4, s + 1))}
            >
              <ChevronRight size={15} />
              下一步
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              <Play size={15} />
              加入生成队列
            </button>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

export default NewTaskDrawer;
