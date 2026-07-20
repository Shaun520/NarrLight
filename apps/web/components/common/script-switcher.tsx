/**
 * 剧本切换器组件（T313）
 *
 * 侧栏顶部「当前剧本」切换器：
 *   - 点击展开下拉列表（标题 + 题材标签 + 状态标签）
 *   - 当前剧本高亮
 *   - 点击切换：更新 useScriptStore.currentScript，收起列表，router.refresh()
 *   - 底部「新建剧本」→ /generate
 *   - 点击外部或 ESC 收起
 *
 * 数据来源：优先使用 props（由服务端 layout 注入），无 props 时回退 Mock。
 * 客户端组件：useRef + useEffect 监听 mousedown / keydown。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus } from 'lucide-react';
import { useScriptStore } from '@/lib/stores/script-store';
import type { Script, ScriptGenre, ScriptStatus } from '@/types';

const GENRE_LABEL: Record<ScriptGenre, string> = {
  hardcore: '硬核',
  emotion: '情感',
  horror: '惊悚',
  funny: '欢乐',
  mechanism: '机制',
};

const STATUS_LABEL: Record<ScriptStatus, string> = {
  draft: '草稿',
  generating: '生成中',
  completed: '已完成',
  archived: '已归档',
};

const STATUS_COLOR: Record<ScriptStatus, string> = {
  draft: 'var(--sepia)',
  generating: 'var(--warn)',
  completed: 'var(--ok)',
  archived: 'var(--noir-muted)',
};

interface ScriptSwitcherProps {
  /** 由服务端 layout 注入的剧本列表（按 updated_at 倒序） */
  scripts?: Script[];
  /** 当前剧本 ID（缺省时取列表首项） */
  currentScriptId?: string;
}

export function ScriptSwitcher({ scripts, currentScriptId }: ScriptSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const setCurrentScript = useScriptStore((s) => s.setCurrentScript);
  const storeCurrent = useScriptStore((s) => s.currentScript);

  const list = scripts && scripts.length > 0 ? scripts : [];
  const activeId = storeCurrent?.id ?? currentScriptId ?? list[0]?.id;
  const activeScript = list.find((s) => s.id === activeId) ?? list[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (script: Script) => {
    setCurrentScript(script);
    setOpen(false);
    router.push(`/editor/${script.id}`);
  };

  return (
    <div
      ref={containerRef}
      className="script-switch"
      title="切换剧本"
      style={{ position: 'relative', cursor: 'pointer' }}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="ss-label">当前剧本</div>
      <div className="ss-title">
        <span>{activeScript?.title ?? '尚未创建剧本'}</span>
        <ChevronDown
          size={14}
          style={{
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
            opacity: 0.7,
          }}
        />
      </div>
      {activeScript ? (
        <div className="ss-meta">
          {GENRE_LABEL[activeScript.genre]} · {activeScript.playerCount}人 ·{' '}
          {activeScript.durationHours}h
        </div>
      ) : null}

      {open && (
        <div
          role="listbox"
          aria-label="剧本列表"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--paper-lighter)',
            border: '1px solid rgba(138, 28, 28, 0.22)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            padding: '4px 0',
          }}
        >
          {list.length === 0 ? (
            <div
              style={{
                padding: '20px 14px',
                textAlign: 'center',
                fontFamily: '"Noto Serif SC", serif',
                fontSize: 12.5,
                color: 'var(--sepia)',
              }}
            >
              暂无剧本
            </div>
          ) : (
            list.map((s) => {
              const isActive = s.id === activeId;
              return (
                <div
                  key={s.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(s)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(138, 28, 28, 0.1)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--blood)' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(138, 28, 28, 0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isActive ? 'var(--blood)' : 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginTop: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Tag color="var(--sepia)" bg="rgba(92, 66, 38, 0.1)">
                      {GENRE_LABEL[s.genre]}
                    </Tag>
                    <Tag color={STATUS_COLOR[s.status]} bg={`${STATUS_COLOR[s.status]}1a`}>
                      {STATUS_LABEL[s.status]}
                    </Tag>
                  </div>
                </div>
              );
            })
          )}

          <Link
            href="/generate"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '9px 12px',
              marginTop: 2,
              borderTop: '1px solid rgba(138, 28, 28, 0.15)',
              fontFamily: '"Noto Serif SC", serif',
              fontSize: 12.5,
              color: 'var(--blood)',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              background: 'rgba(243, 233, 219, 0.4)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(138, 28, 28, 0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(243, 233, 219, 0.4)';
            }}
          >
            <Plus size={14} />
            <span>新建剧本</span>
          </Link>
        </div>
      )}
    </div>
  );
}

interface TagProps {
  color: string;
  bg: string;
  children: React.ReactNode;
}

function Tag({ color, bg, children }: TagProps) {
  return (
    <span
      style={{
        fontFamily: '"Courier Prime", monospace',
        fontSize: 10,
        letterSpacing: '0.04em',
        padding: '1px 6px',
        borderRadius: 2,
        color,
        background: bg,
        border: `1px solid ${color}33`,
      }}
    >
      {children}
    </span>
  );
}
