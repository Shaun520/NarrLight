'use client';

import { useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Checkbox, Dropdown, type MenuProps } from 'antd';
import { Download, ImagePlus, MoreHorizontal, Package, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  ClueCard,
  type ClueActTab,
  type Clue,
} from '@/components/clue-card/clue-card';
import { ClueDetail } from '@/components/clue-card/clue-detail';
import { ClueHierarchy } from '@/components/clue-card/clue-hierarchy';
import { ClueTabs, useClueFilter } from '@/components/clue-card/clue-tabs';
import { ClueTags } from '@/components/clue-card/clue-tags';
import {
  ExportProgress,
  type ExportStatus,
} from '@/components/clue-card/export-progress';
import { Modal } from '@/components/common/modal';
import {
  buildClueAssetFilename,
  downloadDataUrl,
  downloadImagesAsZip,
  exportClueIllustrationsToImages,
  exportIllustratedClueCardsToImages,
  type ExportedImage,
} from '@/lib/export/clue-image-export';
import {
  ensureClueIllustrationAssetAction,
  ensureClueIllustrationAssetsAction,
  markClueDistractorAction,
  markClueKeyAction,
} from '@/app/(dashboard)/editor/[scriptId]/clues/actions';
import {
  getIllustrationAssetsAction,
  type IllustrationAssetView,
} from '@/app/(dashboard)/editor/[scriptId]/illustrations/actions';

const REDRAW_STAMPS = ['〔AI 重绘〕', '〔水墨重绘〕', '〔细节增强〕', '〔构图微调〕'];

function stripRedrawStamp(text: string): string {
  return text.replace(/\s*〔[^〕]*重绘[^〕]*〕\s*$/, '');
}

interface CluesManagerProps {
  scriptId: string;
  initialClues: Clue[];
  actTabs: ClueActTab[];
}

export function CluesManager({ scriptId, initialClues, actTabs }: CluesManagerProps) {
  const [clues, setClues] = useState<Clue[]>(initialClues);
  const filter = useClueFilter(clues);
  const [selectedClueId, setSelectedClueId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportDone, setExportDone] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportLabel, setExportLabel] = useState<string | undefined>(undefined);
  const [progressMode, setProgressMode] = useState<'illustration-export' | 'card-export' | 'redraw'>('card-export');
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [redrawSelectedIds, setRedrawSelectedIds] = useState<Set<string>>(new Set());
  const [illustrationAssets, setIllustrationAssets] = useState<IllustrationAssetView[]>([]);
  const { message } = AntdApp.useApp();
  const router = useRouter();

  const selectedClue = clues.find((c) => c.id === selectedClueId) ?? null;
  const illustrationByClueId = useMemo(() => {
    const map = new Map<string, IllustrationAssetView>();
    for (const asset of illustrationAssets) {
      if (asset.sourceType === 'clue' && asset.sourceId) {
        map.set(asset.sourceId, asset);
      }
    }
    return map;
  }, [illustrationAssets]);
  const selectedIllustration = selectedClue
    ? illustrationByClueId.get(selectedClue.id)
    : undefined;

  useEffect(() => {
    let cancelled = false;
    getIllustrationAssetsAction(scriptId)
      .then((assets) => {
        if (!cancelled) setIllustrationAssets(assets);
      })
      .catch((error) => {
        console.error('Load clue illustration assets failed:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  const replaceClue = (nextClue: Clue) => {
    setClues((prev) => prev.map((clue) => (clue.id === nextClue.id ? nextClue : clue)));
  };

  const handleMarkDistractor = async (clueId: string, isDistractor: boolean) => {
    const previous = clues;
    setClues((prev) =>
      prev.map((clue) =>
        clue.id === clueId
          ? { ...clue, isDistractor, isKey: isDistractor ? false : clue.isKey }
          : clue,
      ),
    );

    try {
      const updated = await markClueDistractorAction(scriptId, clueId, isDistractor);
      replaceClue(updated);
      message.success(isDistractor ? '已标记为干扰线索' : '已取消干扰标记');
    } catch (error) {
      setClues(previous);
      message.error(error instanceof Error ? error.message : '更新干扰标记失败');
    }
  };

  const handleMarkKeyClue = async (clueId: string, isKey: boolean) => {
    const previous = clues;
    setClues((prev) =>
      prev.map((clue) =>
        clue.id === clueId
          ? { ...clue, isKey, isDistractor: isKey ? false : clue.isDistractor }
          : clue,
      ),
    );

    try {
      const updated = await markClueKeyAction(scriptId, clueId, isKey);
      replaceClue(updated);
      message.success(isKey ? '已标记为关键线索' : '已取消关键标记');
    } catch (error) {
      setClues(previous);
      message.error(error instanceof Error ? error.message : '更新关键标记失败');
    }
  };

  const handleJumpToTruth = () => {
    router.push(`/editor/${scriptId}?node=truth`);
  };

  const exportableVisibleClues = useMemo(
    () =>
      filter.visible.filter((clue) => {
        const asset = illustrationByClueId.get(clue.id);
        return asset?.status === 'done' && Boolean(asset.thumb);
      }),
    [filter.visible, illustrationByClueId],
  );

  const handleExportPureIllustrations = async () => {
    if (filter.visible.length === 0) {
      message.warning('当前筛选下没有可导出的线索');
      return;
    }
    if (exportableVisibleClues.length === 0) {
      message.warning('当前筛选下没有已生成插画的线索');
      return;
    }
    setProgressMode('illustration-export');
    setExportOpen(true);
    setExportStatus('running');
    setExportDone(0);
    setExportTotal(exportableVisibleClues.length);
    setExportLabel(undefined);

    try {
      const images: ExportedImage[] = [];
      for (const clue of exportableVisibleClues) {
        setExportLabel(clue.title);
        const batch = await exportClueIllustrationsToImages([clue], illustrationByClueId);
        images.push(...batch);
        setExportDone(images.length);
      }

      await downloadImagesAsZip(images, `${scriptId}_纯插画`);
      setExportStatus('completed');
    } catch (error) {
      console.error('Export clue illustrations failed:', error);
      setExportStatus('failed');
    }
  };

  const handleExportIllustratedCards = async () => {
    if (filter.visible.length === 0) {
      message.warning('当前筛选下没有可导出的线索卡');
      return;
    }
    if (exportableVisibleClues.length === 0) {
      message.warning('当前筛选下没有已生成插画的线索卡');
      return;
    }
    setProgressMode('card-export');
    setExportOpen(true);
    setExportStatus('running');
    setExportDone(0);
    setExportTotal(exportableVisibleClues.length);
    setExportLabel(undefined);

    try {
      const images: ExportedImage[] = [];
      for (const clue of exportableVisibleClues) {
        setExportLabel(clue.title);
        const batch = await exportIllustratedClueCardsToImages([clue], illustrationByClueId);
        images.push(...batch);
        setExportDone(images.length);
      }

      await downloadImagesAsZip(images, `${scriptId}_插画线索卡`);
      setExportStatus('completed');
    } catch (error) {
      console.error('Export illustrated clue cards failed:', error);
      setExportStatus('failed');
    }
  };

  const handleExportSingleCluePng = async (clue: Clue) => {
    const asset = illustrationByClueId.get(clue.id);
    if (asset?.status !== 'done' || !asset.thumb) {
      message.warning('当前线索还没有已生成插画，请先生成线索插画');
      return;
    }

    try {
      const [image] = await exportIllustratedClueCardsToImages([clue], illustrationByClueId);
      if (!image) {
        message.warning('当前线索还没有可导出的插画线索卡');
        return;
      }
      downloadDataUrl(image.dataUrl, buildClueAssetFilename(clue, '_线索卡'));
      message.success('已导出当前线索 PNG');
    } catch (error) {
      console.error('Export single clue card failed:', error);
      message.error(error instanceof Error ? error.message : '导出当前线索 PNG 失败');
    }
  };

  const handleGoIllustrations = () => {
    router.push(`/editor/${scriptId}/illustrations?type=clue`);
  };

  const handleEnsureVisibleIllustrations = async () => {
    if (filter.visible.length === 0) {
      message.warning('当前筛选下没有可生成插画的线索');
      return;
    }

    try {
      const result = await ensureClueIllustrationAssetsAction(scriptId, filter.visible);
      message.success(`已准备 ${result.count} 个线索插画任务`);
      handleGoIllustrations();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建线索插画任务失败');
    }
  };

  const handleGenerateClueIllustration = async (clue: Clue) => {
    try {
      await ensureClueIllustrationAssetAction(scriptId, clue);
      const assets = await getIllustrationAssetsAction(scriptId);
      setIllustrationAssets(assets);
      message.success(`已准备「${clue.title}」插画任务`);
      router.push(`/editor/${scriptId}/illustrations?type=clue&source=${clue.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建线索插画任务失败');
    }
  };

  const handleBatchRedraw = () => {
    if (filter.visible.length === 0) {
      message.warning('当前筛选下没有可重绘的线索卡');
      return;
    }
    setRedrawSelectedIds(new Set(filter.visible.map((clue) => clue.id)));
    setRedrawOpen(true);
  };

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
        const clue = clues.find((item) => item.id === ids[i]);
        if (clue) setExportLabel(clue.title);
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        if (clue) {
          const stamp = REDRAW_STAMPS[Math.floor(Math.random() * REDRAW_STAMPS.length)];
          setClues((prev) =>
            prev.map((item) =>
              item.id === clue.id ? { ...item, text: `${stripRedrawStamp(item.text)} ${stamp}` } : item,
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

  const handleRedrawToggleAll = (checked: boolean) => {
    setRedrawSelectedIds(checked ? new Set(filter.visible.map((clue) => clue.id)) : new Set());
  };

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'pure-illustrations',
      label: '纯插画导出（当前筛选）',
      icon: <Download size={14} />,
      onClick: () => void handleExportPureIllustrations(),
    },
    {
      key: 'illustrated-cards',
      label: '插画 + 线索导出（当前筛选）',
      icon: <Package size={14} />,
      onClick: () => void handleExportIllustratedCards(),
    },
    {
      key: 'illustrations',
      label: '前往线索插画资产',
      icon: <ImagePlus size={14} />,
      onClick: handleGoIllustrations,
    },
  ];

  const moreMenuItems: MenuProps['items'] = [
    {
      key: 'redraw',
      label: '批量重绘当前筛选',
      icon: <WandSparkles size={14} />,
      onClick: handleBatchRedraw,
    },
    {
      key: 'check-illustrations',
      label: '检查线索插画状态',
      icon: <ImagePlus size={14} />,
      onClick: handleGoIllustrations,
    },
  ];

  return (
    <div className="clues-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            线索卡管理 <span className="seal">{clues.length} 张</span>
          </h1>
          <div className="page-desc">
            {'// 自动分类 · 批量补全插画 · 线索包导出'}
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void handleEnsureVisibleIllustrations()}>
            <ImagePlus size={15} />
            补全插画
          </button>
          <Dropdown menu={{ items: exportMenuItems }} trigger={['click']} placement="bottomRight">
            <button type="button" className="btn btn-primary">
              <Package size={15} />
              导出线索包
            </button>
          </Dropdown>
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight">
            <button type="button" className="btn btn-ghost icon-only" aria-label="更多线索操作">
              <MoreHorizontal size={16} />
            </button>
          </Dropdown>
        </div>
      </div>

      <ClueTabs
        curAct={filter.curAct}
        curPhase={filter.curPhase}
        counts={filter.counts}
        actTabs={actTabs}
        onActChange={filter.setAct}
        onPhaseChange={filter.setPhase}
      />

      <div className="clue-grid">
        {filter.visible.map((clue) => (
          <ClueCard
            key={clue.id}
            clue={clue}
            selected={clue.id === selectedClueId}
            onClick={(item) => setSelectedClueId(item.id)}
          />
        ))}
        {filter.isEmpty && (
          <div className="clue-empty">当前筛选下无线索卡</div>
        )}
      </div>

      {selectedClue && (
        <>
          <div
            className="clue-detail-drawer-mask"
            onClick={() => setSelectedClueId(null)}
          />
          <div className="clue-detail-drawer open">
            <ClueDetail
              clue={selectedClue}
              illustration={selectedIllustration?.thumb
                ? {
                    imageUrl: selectedIllustration.thumb,
                    status: selectedIllustration.status,
                    model: selectedIllustration.sub,
                  }
                : null}
              onClose={() => setSelectedClueId(null)}
              onJumpToTruth={handleJumpToTruth}
              onGenerateIllustration={(clue) => void handleGenerateClueIllustration(clue)}
              onExportPng={(clue) => void handleExportSingleCluePng(clue)}
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
                onSelectClue={(item) => setSelectedClueId(item.id)}
              />
            </div>
          </div>
        </>
      )}

      <ExportProgress
        open={exportOpen}
        total={exportTotal}
        done={exportDone}
        status={exportStatus}
        currentLabel={exportLabel}
        title={progressMode === 'redraw' ? '批量重绘线索卡' : progressMode === 'illustration-export' ? '导出纯插画' : '导出插画线索卡'}
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
              onChange={(event) => handleRedrawToggleAll(event.target.checked)}
            >
              全选
            </Checkbox>
          </div>
          <div className="redraw-list">
            <Checkbox.Group
              value={Array.from(redrawSelectedIds)}
              onChange={(values) => {
                const ids = values.filter((value): value is string => typeof value === 'string');
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

export default CluesManager;
