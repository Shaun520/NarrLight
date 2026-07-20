/**
 * 漏洞定位跳转与原文高亮组件（T158）
 *
 * 职责：
 *   1. parseLocation(issue.location)  从原型位置字符串解析出幕次 / 角色名 / 线索号；
 *   2. jumpTo(issue)                   跳转到对应模块（编辑器 / 线索卡 / 真相复盘）；
 *   3. highlight(issue)                在目标页面对应段落打高亮（通过 URL hash + query）。
 *
 * 跳转目标：
 *   - 剧本幕次 → /editor/[scriptId]?act=N&par=P#highlight
 *   - 人物剧本 → /editor/[scriptId]?char=NAME#highlight
 *   - 线索卡   → /editor/[scriptId]/clues?clue=ID#highlight
 *   - 真相复盘 → /editor/[scriptId]?section=truth#highlight
 *
 * 客户端组件：使用 next/navigation 进行跳转，并写 sessionStorage 供目标页面读取。
 */
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { ValidationIssue } from '@/lib/validation/logic/issue-classifier';

/** 解析后的位置信息 */
export interface ParsedLocation {
  /** 原始字符串 */
  raw: string;
  /** 幕次序号（1-based），0 表示未识别 */
  actIndex: number;
  /** 段落序号（1-based），0 表示未识别 */
  paragraphIndex: number;
  /** 角色名（若有） */
  characterName: string | null;
  /** 线索号（若有，如 C-12） */
  clueId: string | null;
  /** 模块：editor / clues / truth / unknown */
  module: 'editor' | 'clues' | 'truth' | 'unknown';
}

/** 高亮信息（写入 sessionStorage 供目标页面读取） */
export interface HighlightPayload {
  issueId: string;
  issueTitle: string;
  actIndex: number;
  paragraphIndex: number;
  characterName: string | null;
  clueId: string | null;
  module: ParsedLocation['module'];
  createdAt: number;
}

const STORAGE_KEY = 'narrlight:issue-highlight';

/**
 * 解析位置字符串。
 *
 * 支持样例（对齐原型 .vuln-loc 文本）：
 *   "第一幕 · 沈墨白剧本 第2段"
 *   "第二幕 · 真相复盘 · 凶案手法"
 *   "第二幕 · 线索卡 #C-12"
 *   "人物剧本 · 沈墨尘 · 动机段落"
 */
export function parseLocation(location: string): ParsedLocation {
  const result: ParsedLocation = {
    raw: location,
    actIndex: 0,
    paragraphIndex: 0,
    characterName: null,
    clueId: null,
    module: 'unknown',
  };

  // 幕次：第N幕
  const actMatch = location.match(/第([一二三四五六七八九十\d]+)幕/);
  if (actMatch) {
    result.actIndex = toNumber(actMatch[1]);
  }

  // 段落：第N段
  const parMatch = location.match(/第(\d+)段/);
  if (parMatch) {
    result.paragraphIndex = parseInt(parMatch[1], 10);
  }

  // 线索号：#C-12 / 线索卡 #X-Y
  const clueMatch = location.match(/#([A-Za-z]-?\d+)/);
  if (clueMatch) {
    result.clueId = clueMatch[1];
    result.module = 'clues';
  }

  // 真相复盘
  if (location.includes('真相复盘')) {
    result.module = 'truth';
  }

  // 角色名（启发式：在"剧本"前出现的2-3字汉字名）
  const charMatch = location.match(/([\u4e00-\u9fa5]{2,4})(?:剧本|动机段落|人物)/);
  if (charMatch) {
    result.characterName = charMatch[1];
    if (result.module === 'unknown') result.module = 'editor';
  }

  if (result.module === 'unknown' && result.actIndex > 0) {
    result.module = 'editor';
  }

  return result;
}

/** 中文数字转阿拉伯 */
function toNumber(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const map: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (s.length === 1) return map[s] ?? 0;
  if (s.startsWith('十')) return 10 + (map[s[1]] ?? 0);
  if (s.endsWith('十')) return (map[s[0]] ?? 0) * 10;
  // 例如"二十三"
  const parts = s.split('十');
  return (map[parts[0]] ?? 0) * 10 + (parts[1] ? map[parts[1]] ?? 0 : 0);
}

interface IssueLocatorProps {
  scriptId: string;
  children?: (locate: (issue: ValidationIssue) => void) => React.ReactNode;
}

/**
 * 漏洞定位组件。
 *
 * 提供 locate(issue) 方法；通过 render props 暴露给调用方，
 * 也直接 export useIssueLocator hook 供函数式调用。
 */
export function IssueLocator({ scriptId, children }: IssueLocatorProps) {
  const router = useRouter();
  const locate = useCallback(
    (issue: ValidationIssue) => {
      const parsed = parseLocation(issue.location);
      const payload: HighlightPayload = {
        issueId: issue.id,
        issueTitle: issue.title,
        actIndex: parsed.actIndex,
        paragraphIndex: parsed.paragraphIndex,
        characterName: parsed.characterName,
        clueId: parsed.clueId,
        module: parsed.module,
        createdAt: Date.now(),
      };

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }

      const base = `/editor/${scriptId}`;
      const params = new URLSearchParams();
      if (parsed.actIndex > 0) params.set('act', String(parsed.actIndex));
      if (parsed.paragraphIndex > 0) params.set('par', String(parsed.paragraphIndex));
      if (parsed.characterName) params.set('char', parsed.characterName);
      if (parsed.clueId) params.set('clue', parsed.clueId);
      if (parsed.module === 'truth') params.set('section', 'truth');
      params.set('highlight', issue.id);

      const url =
        parsed.module === 'clues'
          ? `${base}/clues?${params.toString()}#highlight`
          : `${base}?${params.toString()}#highlight`;
      router.push(url);
    },
    [router, scriptId],
  );

  if (children) return <>{children(locate)}</>;
  return null;
}

/** 读取高亮 payload（目标页面在 mount 时调用） */
export function consumeHighlight(): HighlightPayload | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as HighlightPayload;
    // 5 分钟过期
    if (Date.now() - payload.createdAt > 5 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return payload;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** 清除高亮 payload */
export function clearHighlight(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** hook 形式 */
export function useIssueLocator(scriptId: string) {
  const router = useRouter();
  return useCallback(
    (issue: ValidationIssue) => {
      const parsed = parseLocation(issue.location);
      const payload: HighlightPayload = {
        issueId: issue.id,
        issueTitle: issue.title,
        actIndex: parsed.actIndex,
        paragraphIndex: parsed.paragraphIndex,
        characterName: parsed.characterName,
        clueId: parsed.clueId,
        module: parsed.module,
        createdAt: Date.now(),
      };
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
      const base = `/editor/${scriptId}`;
      const params = new URLSearchParams();
      if (parsed.actIndex > 0) params.set('act', String(parsed.actIndex));
      if (parsed.paragraphIndex > 0) params.set('par', String(parsed.paragraphIndex));
      if (parsed.characterName) params.set('char', parsed.characterName);
      if (parsed.clueId) params.set('clue', parsed.clueId);
      if (parsed.module === 'truth') params.set('section', 'truth');
      params.set('highlight', issue.id);
      const url =
        parsed.module === 'clues'
          ? `${base}/clues?${params.toString()}#highlight`
          : `${base}?${params.toString()}#highlight`;
      router.push(url);
    },
    [router, scriptId],
  );
}
