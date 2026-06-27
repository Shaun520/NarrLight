/**
 * 线索卡管理页（T165 · 视图6）
 *
 * 路由：/dashboard/editor/[scriptId]/clues
 *
 * 严格参照原型 workbench2.html #view-clues 结构：
 *   1. .page-head      页头（标题 + 印章总数 + 批量重绘 / 导出 PNG）
 *   2. .clue-tabs       联动标签栏（幕次 act + 环节 phase，双向联动计数）
 *   3. .clue-grid       线索卡网格（4 种视觉风格，8 张示例卡）
 *   4. ClueDetail       线索详情抽屉（含标记 / 解锁层级 / 真相跳转）
 *   5. ExportProgress   批量导出进度模态
 *
 * 客户端组件：管理 curAct / curPhase / selectedClueId / style / export 状态。
 */
'use client';

import { use, useRef, useState } from 'react';
import { App as AntdApp, Checkbox } from 'antd';
import { Grid3x3, Download } from 'lucide-react';
import {
  ClueCard,
  DEFAULT_CLUES,
  STYLE_CHIPS,
  type Clue,
  type ClueCardStyle,
} from '@/components/clue-card/clue-card';
import { ClueTabs, useClueFilter } from '@/components/clue-card/clue-tabs';
import { ClueDetail } from '@/components/clue-card/clue-detail';
import { ClueTags } from '@/components/clue-card/clue-tags';
import { ClueHierarchy } from '@/components/clue-card/clue-hierarchy';
import {
  ExportProgress,
  type ExportStatus,
} from '@/components/clue-card/export-progress';
import {
  exportCluesToImages,
  downloadImagesAsZip,
  type ExportedImage,
} from '@/lib/export/clue-image-export';
import { Modal } from '@/components/common/modal';
import './clues.css';

/** 重绘戳记池（Mock：随机追加到线索正文末尾） */
const REDRAW_STAMPS = ['〔AI 重绘〕', '〔水墨重绘〕', '〔细节增强〕', '〔构图微调〕'];

/** 去除已有重绘戳记，避免重复追加 */
function stripRedrawStamp(text: string): string {
  return text.replace(/\s*〔[^〕]*重绘[^〕]*〕\s*$/, '');
}

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

/**
 * 线索卡管理页
 */
export default function CluesPage({ params }: PageProps) {
  const { scriptId } = use(params);

  // 线索数据（后续可由 clueService.getClues(scriptId) 注入）
  const [clues, setClues] = useState<Clue[]>(DEFAULT_CLUES);

  // 联动筛选
  const filter = useClueFilter(clues);

  // 视觉风格
  const [style, setStyle] = useState<ClueCardStyle>('ink');

  // 选中线索（详情抽屉）
  const [selectedClueId, setSelectedClueId] = useState<string | null>(null);

  // 导出进度（同时复用于批量重绘进度展示，由 progressMode 区分文案）
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportDone, setExportDone] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportLabel, setExportLabel] = useState<string | undefined>(undefined);
  const [progressMode, setProgressMode] = useState<'export' | 'redraw'>('export');

  // 批量重绘确认弹窗
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [redrawSelectedIds, setRedrawSelectedIds] = useState<Set<string>>(new Set());

  // antd message（已由 RootLayout 的 AntdApp 注入上下文）
  const { message } = AntdApp.useApp();

  // 网格容器引用（导出时查询 .clue-card 节点）
  const gridRef = useRef<HTMLDivElement>(null);

  const selectedClue = clues.find((c) => c.id === selectedClueId) ?? null;

  // ===== 标记回调 =====
  const handleMarkDistractor = (clueId: string, isDistractor: boolean) => {
    setClues((prev) =>
      prev.map((c) => (c.id === clueId ? { ...c, isDistractor } : c)),
    );
  };
  const handleMarkKeyClue = (clueId: string, isKey: boolean) => {
    setClues((prev) =>
      prev.map((c) => (c.id === clueId ? { ...c, isKey } : c)),
    );
  };

  // ===== 真相跳转 =====
  const handleJumpToTruth = (clue: Clue) => {
    // TODO: 路由跳转至复盘模块并定位段落
    void clue;
    void scriptId;
  };

  // ===== 批量导出 PNG =====
  const handleExportPng = async () => {
    if (!gridRef.current || filter.visible.length === 0) return;
    setProgressMode('export');
    setExportOpen(true);
    setExportStatus('running');
    setExportDone(0);
    setExportTotal(filter.visible.length);
    setExportLabel(undefined);

    try {
      // 通过 data-clue-id 对齐 DOM 节点与线索数据
      const nodes = filter.visible
        .map((c) => gridRef.current?.querySelector(`[data-clue-id="${c.id}"]`) as HTMLElement | null)
        .filter((n): n is HTMLElement => n !== null);

      const images: ExportedImage[] = [];
      for (let i = 0; i < nodes.length; i += 1) {
        setExportLabel(filter.visible[i].title);
        const batch = await exportCluesToImages(
          [nodes[i]],
          [filter.visible[i]],
        );
        images.push(...batch);
        setExportDone(i + 1);
      }

      await downloadImagesAsZip(images, `${scriptId}_线索卡`);
      setExportStatus('completed');
    } catch {
      setExportStatus('failed');
    }
  };

  // ===== 批量重绘 =====
  // 1. 点击「批量重绘」弹出确认弹窗，预选当前筛选下全部线索卡
  const handleBatchRedraw = () => {
    if (filter.visible.length === 0) {
      message.warning('当前筛选下没有可重绘的线索卡');
      return;
    }
    setRedrawSelectedIds(new Set(filter.visible.map((c) => c.id)));
    setRedrawOpen(true);
  };

  // 2. 确认后对选中线索卡逐张调用 AI 重绘（Mock：每张 1.5 秒）
  const handleRedrawConfirm = async () => {
    const ids = Array.from(redrawSelectedIds);
    if (ids.length === 0) {
      message.warning('请至少选择一张线索卡');
      return;
    }
    setRedrawOpen(false);
    setProgressMode('redraw');
    setExportOpen(true);
    setExportStatus('running');
    setExportDone(0);
    setExportTotal(ids.length);
    setExportLabel(undefined);

    try {
      for (let i = 0; i < ids.length; i += 1) {
        const clueId = ids[i];
        const clue = clues.find((c) => c.id === clueId);
        if (clue) setExportLabel(clue.title);
        // Mock：模拟 AI 重绘耗时
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        // 完成后更新线索卡内容（Mock：随机追加重绘戳记）
        if (clue) {
          const stamp = REDRAW_STAMPS[Math.floor(Math.random() * REDRAW_STAMPS.length)];
          setClues((prev) =>
            prev.map((c) =>
              c.id === clue.id ? { ...c, text: `${stripRedrawStamp(c.text)} ${stamp}` } : c,
            ),
          );
        }
        setExportDone(i + 1);
      }
      setExportStatus('completed');
      message.success(`批量重绘完成，共更新 ${ids.length} 张线索卡`);
    } catch {
      setExportStatus('failed');
      message.error('批量重绘失败，请重试');
    }
  };

  // 复选框全选 / 清空
  const handleRedrawToggleAll = (checked: boolean) => {
    setRedrawSelectedIds(checked ? new Set(filter.visible.map((c) => c.id)) : new Set());
  };

  return (
    <div className="clues-page">
      {/* ===== 页头 ===== */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            线索卡管理 <span className="seal">{clues.length} 张</span>
          </h1>
          <div className="page-desc">
            {'// 四种风格一键切换 · 自动分类 · 批量重绘与导出'}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={handleBatchRedraw}>
            <Grid3x3 size={15} />
            批量重绘
          </button>
          <button type="button" className="btn btn-primary" onClick={handleExportPng}>
            <Download size={15} />
            导出 PNG
          </button>
        </div>
      </div>

      {/* ===== 风格切换器 ===== */}
      <div className="style-switcher">
        {STYLE_CHIPS.map((chip) => (
          <div
            key={chip.style}
            className={`style-chip ${style === chip.style ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setStyle(chip.style)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStyle(chip.style);
              }
            }}
          >
            {chip.label}
          </div>
        ))}
      </div>

      {/* ===== 联动标签栏 ===== */}
      <ClueTabs
        clues={clues}
        curAct={filter.curAct}
        curPhase={filter.curPhase}
        counts={filter.counts}
        onActChange={filter.setAct}
        onPhaseChange={filter.setPhase}
      />

      {/* ===== 线索卡网格 ===== */}
      <div className="clue-grid" ref={gridRef}>
        {filter.visible.map((clue) => (
          <ClueCard
            key={clue.id}
            clue={clue}
            style={style}
            selected={clue.id === selectedClueId}
            onClick={(c) => setSelectedClueId(c.id)}
          />
        ))}
        {filter.isEmpty && (
          <div className="clue-empty">当前筛选下无线索卡</div>
        )}
      </div>

      {/* ===== 线索详情抽屉 ===== */}
      {selectedClue && (
        <>
          <div
            className="clue-detail-drawer-mask"
            onClick={() => setSelectedClueId(null)}
          />
          <div className="clue-detail-drawer open">
            <ClueDetail
              clue={selectedClue}
              onClose={() => setSelectedClueId(null)}
              onJumpToTruth={handleJumpToTruth}
            />
            <div className="cd-extra">
              <ClueTags
                clue={selectedClue}
                onMarkDistractor={handleMarkDistractor}
                onMarkKeyClue={handleMarkKeyClue}
              />
              <ClueHierarchy
                clue={selectedClue}
                allClues={clues}
                onSelectClue={(c) => setSelectedClueId(c.id)}
              />
            </div>
          </div>
        </>
      )}

      {/* ===== 进度模态（导出 / 批量重绘复用） ===== */}
      <ExportProgress
        open={exportOpen}
        total={exportTotal}
        done={exportDone}
        status={exportStatus}
        currentLabel={exportLabel}
        title={progressMode === 'redraw' ? '批量重绘线索卡' : '批量导出线索卡'}
        currentLabelPrefix={progressMode === 'redraw' ? '正在重绘' : '正在导出'}
        completedTip={
          progressMode === 'redraw'
            ? '批量重绘完成。'
            : '导出完成，文件已开始下载。'
        }
        failedTip={
          progressMode === 'redraw'
            ? '批量重绘失败，请重试。'
            : '导出失败，请重试或检查浏览器下载权限。'
        }
        onClose={() => setExportOpen(false)}
      />

      {/* ===== 批量重绘确认弹窗 ===== */}
      <Modal
        open={redrawOpen}
        title="批量重绘线索卡"
        okText="开始重绘"
        cancelText="取消"
        width={480}
        onOk={handleRedrawConfirm}
        onCancel={() => setRedrawOpen(false)}
      >
        <div className="redraw-modal-body">
          <div className="redraw-summary">
            已选择 <b>{redrawSelectedIds.size}</b> / {filter.visible.length} 张线索卡，
            确认后将调用 AI 逐张重绘。
          </div>
          <div className="redraw-toolbar">
            <Checkbox
              checked={
                filter.visible.length > 0 &&
                redrawSelectedIds.size === filter.visible.length
              }
              onChange={(e) => handleRedrawToggleAll(e.target.checked)}
            >
              全选
            </Checkbox>
          </div>
          <div className="redraw-list">
            <Checkbox.Group
              value={Array.from(redrawSelectedIds)}
              onChange={(vals) => {
                const ids = vals.filter((v): v is string => typeof v === 'string');
                setRedrawSelectedIds(new Set(ids));
              }}
            >
              {filter.visible.map((clue) => (
                <div key={clue.id} className="redraw-item">
                  <Checkbox value={clue.id}>
                    <span className="redraw-item-title">{clue.title}</span>
                    <span className="redraw-item-code">{clue.code}</span>
                  </Checkbox>
                </div>
              ))}
            </Checkbox.Group>
          </div>
        </div>
      </Modal>
    </div>
  );
}
