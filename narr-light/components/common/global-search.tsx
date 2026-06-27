/**
 * 全局搜索组件（T314）
 *
 * 顶栏搜索框 + 下拉结果面板：
 *   - 输入 ≥2 字符时展开结果面板
 *   - 按类别分组：剧本 / 角色 / 线索 / 章节
 *   - 剧本：从 layout 注入的真实 scripts 列表过滤，href 用 /editor/[scriptId]
 *   - 角色/线索/章节：开发期 Mock 数据，href 用首个真实 scriptId 拼接
 *   - 无剧本时仅展示剧本搜索结果（可能为空），避免点击 Mock 链接 404
 *   - 点击结果跳转：
 *       剧本 → /editor/[scriptId]
 *       角色 → /editor/[scriptId]?node=char-xxx
 *       线索 → /editor/[scriptId]/clues
 *       章节 → /editor/[scriptId]?node=xxx
 *   - ESC 清空收起，失焦收起（点击结果不收起）
 *
 * 客户端组件：useRef + useEffect 监听 keydown / mousedown。
 * 注意：GlobalSearch 渲染于 DashboardProvider 之外（顶栏），scripts 通过 prop 注入。
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import type { Script } from '@/types';

type ResultCategory = 'scripts' | 'characters' | 'clues' | 'chapters';

interface SearchResult {
  id: string;
  title: string;
  desc?: string;
  category: ResultCategory;
  /** 跳转地址 */
  href: string;
}

const CATEGORY_LABEL: Record<ResultCategory, string> = {
  scripts: '剧本',
  characters: '角色',
  clues: '线索',
  chapters: '章节',
};

const CATEGORY_COLOR: Record<ResultCategory, string> = {
  scripts: 'var(--blood)',
  characters: 'var(--sepia)',
  clues: 'var(--gold)',
  chapters: 'var(--info)',
};

/** 剧本题材 → 中文标签（与 overview-service GENRE_LABEL 对齐） */
const GENRE_LABEL: Record<Script['genre'], string> = {
  hardcore: '硬核',
  emotion: '情感',
  horror: '恐怖',
  funny: '欢乐',
  mechanism: '机制',
};

/** Mock 条目（角色/线索/章节）：href 在运行时与真实 scriptId 拼接 */
interface MockEntry {
  id: string;
  title: string;
  desc: string;
  category: Exclude<ResultCategory, 'scripts'>;
  /** 与 /editor/[scriptId] 拼接的后缀，如 '?node=char-xxx' 或 '/clues' */
  pathSuffix: string;
}

/** 开发期 Mock 数据集（角色/线索/章节） */
const MOCK_ENTRIES: MockEntry[] = [
  { id: 'c1', title: '沈墨白', desc: '古镇迷案 · 书生', category: 'characters', pathSuffix: '?node=char-shenmobai' },
  { id: 'c2', title: '林晚秋', desc: '古镇迷案 · 医女', category: 'characters', pathSuffix: '?node=char-linwanqiu' },
  { id: 'c3', title: '周临渊', desc: '夜雨长安 · 捕快', category: 'characters', pathSuffix: '?node=char-zhoulinyuan' },
  { id: 'c4', title: '苏婉', desc: '雾中行人 · 歌女', category: 'characters', pathSuffix: '?node=char-suwan' },
  { id: 'cl1', title: '血书一封', desc: '古镇迷案 · 关键物证', category: 'clues', pathSuffix: '/clues' },
  { id: 'cl2', title: '玉佩碎片', desc: '古镇迷案 · 身份信物', category: 'clues', pathSuffix: '/clues' },
  { id: 'cl3', title: '密信残页', desc: '夜雨长安 · 隐藏线索', category: 'clues', pathSuffix: '/clues' },
  { id: 'ch1', title: '第一幕 · 夜访', desc: '古镇迷案', category: 'chapters', pathSuffix: '?node=act-1' },
  { id: 'ch2', title: '第二幕 · 迷踪', desc: '古镇迷案', category: 'chapters', pathSuffix: '?node=act-2' },
  { id: 'ch3', title: '第三幕 · 真相', desc: '古镇迷案', category: 'chapters', pathSuffix: '?node=act-3' },
  { id: 'ch4', title: '第一幕 · 长安雨夜', desc: '夜雨长安', category: 'chapters', pathSuffix: '?node=act-1' },
];

interface GlobalSearchProps {
  /** 当前用户的剧本列表（由 layout 注入，用于剧本搜索与 Mock href 拼接真实 scriptId） */
  scripts?: Script[];
}

export function GlobalSearch({ scripts = [] }: GlobalSearchProps) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 防抖：输入 ≥2 字符时触发搜索
  useEffect(() => {
    if (keyword.trim().length < 2) {
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      setLoading(false);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [keyword]);

  // ESC 清空收起
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKeyword('');
        setOpen(false);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const grouped = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (kw.length < 2) return {} as Record<ResultCategory, SearchResult[]>;

    const map: Record<ResultCategory, SearchResult[]> = {
      scripts: [],
      characters: [],
      clues: [],
      chapters: [],
    };

    // 剧本：从真实 scripts 过滤，href 用真实 scriptId
    for (const s of scripts) {
      if (s.title.toLowerCase().includes(kw)) {
        const genreLabel = GENRE_LABEL[s.genre] ?? s.genre;
        map.scripts.push({
          id: s.id,
          title: s.title,
          desc: `${genreLabel} · ${s.playerCount}人 · ${s.durationHours}h`,
          category: 'scripts',
          href: `/editor/${s.id}`,
        });
      }
    }

    // 角色/线索/章节：Mock 数据，href 需用真实 scriptId 拼接
    // 无剧本时跳过，避免点击 Mock 链接 404
    const currentScriptId = scripts[0]?.id;
    if (currentScriptId) {
      const editorBase = `/editor/${currentScriptId}`;
      for (const entry of MOCK_ENTRIES) {
        if (
          entry.title.toLowerCase().includes(kw) ||
          entry.desc.toLowerCase().includes(kw)
        ) {
          map[entry.category].push({
            id: entry.id,
            title: entry.title,
            desc: entry.desc,
            category: entry.category,
            href: `${editorBase}${entry.pathSuffix}`,
          });
        }
      }
    }

    return map;
  }, [keyword, scripts]);

  const hasResults = (Object.keys(grouped) as ResultCategory[]).some(
    (k) => grouped[k].length > 0,
  );

  const handleSelect = (href: string) => {
    setOpen(false);
    setKeyword('');
    router.push(href);
  };

  return (
    <div ref={containerRef} className="search" style={{ position: 'relative' }}>
      <Search />
      <input
        type="text"
        placeholder="搜索剧本、人物、线索…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onFocus={() => {
          if (keyword.trim().length >= 2) setOpen(true);
        }}
        aria-label="全局搜索"
      />
      {loading && (
        <Loader2
          size={13}
          style={{
            animation: 'state-spin 1s linear infinite',
            color: 'var(--blood)',
            opacity: 0.7,
          }}
        />
      )}

      {open && (
        <div
          role="listbox"
          aria-label="搜索结果"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: 360,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--paper-lighter)',
            border: '1px solid rgba(138, 28, 28, 0.22)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            padding: '4px 0',
          }}
        >
          {!hasResults ? (
            <div
              style={{
                padding: '24px 14px',
                textAlign: 'center',
                fontFamily: '"Noto Serif SC", serif',
                fontSize: 12.5,
                color: 'var(--sepia)',
              }}
            >
              {scripts.length === 0
                ? '请先创建剧本后再搜索角色/线索/章节'
                : `未找到与「${keyword}」相关的内容`}
            </div>
          ) : (
            (Object.keys(grouped) as ResultCategory[]).map((cat) => {
              const items = grouped[cat];
              if (items.length === 0) return null;
              const color = CATEGORY_COLOR[cat];
              return (
                <div key={cat}>
                  <div
                    style={{
                      padding: '6px 14px 4px',
                      fontFamily: '"Courier Prime", monospace',
                      fontSize: 10.5,
                      letterSpacing: '0.18em',
                      color: color,
                      textTransform: 'uppercase',
                      borderBottom: '1px solid rgba(26, 18, 11, 0.06)',
                    }}
                  >
                    {CATEGORY_LABEL[cat]} · {items.length}
                  </div>
                  {items.map((item) => (
                    <div
                      key={`${item.category}-${item.id}`}
                      role="option"
                      onClick={() => handleSelect(item.href)}
                      style={{
                        padding: '8px 14px',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(138, 28, 28, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </div>
                      {item.desc && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'var(--sepia)',
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.desc}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
