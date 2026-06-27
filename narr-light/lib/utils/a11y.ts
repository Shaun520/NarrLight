/**
 * 叙光可访问性（a11y）工具函数（T201）
 *
 * 提供标准 ARIA 属性、键盘导航属性与焦点陷阱属性的工厂函数，
 * 让组件在不必重复样板代码的情况下满足可访问性要求。
 *
 * 用法示例：
 *   <div {...ariaProps('关闭')} {...keyboardNavProps(onClose)} role="button" tabIndex={0}>
 *   <aside role="dialog" aria-label="新建任务" {...focusTrapProps()}>
 *
 * 设计原则：
 * - 仅返回 React 标准 HTML 属性，避免 any；
 * - 不引入第三方库，避免运行时开销；
 * - 调用方仍需保证 role / tabIndex 的语义匹配。
 */
import type {
  AriaAttributes,
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
} from 'react';

/** React 标准 Aria 属性子集（去除 aria-* 之外的属性） */
export type AriaHTMLProps = Pick<
  AriaAttributes,
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-hidden'
  | 'aria-disabled'
  | 'aria-expanded'
  | 'aria-haspopup'
  | 'aria-live'
  | 'aria-busy'
>;

/** ariaProps 返回类型 */
export type AriaPropsResult = AriaHTMLProps;

/** keyboardNavProps 返回类型 */
export interface KeyboardNavPropsResult {
  /** Tab 顺序 */
  tabIndex: number;
  /** 键盘事件：Enter / Space 触发回调 */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/** focusTrapProps 返回类型 */
export interface FocusTrapPropsResult {
  /** 标记容器为焦点陷阱根 */
  'data-focus-trap'?: 'true';
  /** 焦点陷阱根容器上的 keydown 处理：拦截 Tab 循环 */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * 返回标准 ARIA 属性集合。
 * 适用于可交互元素（按钮、链接、图标按钮等）补充无障碍标签。
 *
 * @param label 主要的可读标签
 */
export function ariaProps(label: string): AriaPropsResult {
  return { 'aria-label': label };
}

/**
 * 返回键盘导航属性：
 * - tabIndex={0} 让非按钮元素可被 Tab 聚焦；
 * - onKeyDown 拦截 Enter / Space（避免 Space 滚动页面）并触发回调。
 *
 * 用于 `role="button"` 的 div / span 等自定义可点击元素。
 *
 * @param onEnter Enter / Space 触发的回调
 * @param tabIndex 默认 0；可传 -1 表示仅程序可聚焦
 */
export function keyboardNavProps(
  onEnter: () => void,
  tabIndex = 0,
): KeyboardNavPropsResult {
  return {
    tabIndex,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnter();
      }
    },
  };
}

/**
 * 返回焦点陷阱属性（用于 Modal / Drawer 等覆盖层容器）。
 *
 * 实现策略：监听 keydown，当 Tab 在容器边缘时循环焦点。
 * 仅返回属性；调用方需将属性挂在陷阱根容器上，
 * 并保证容器内至少有一个可聚焦元素。
 *
 * 用法：
 *   const trap = focusTrapProps();
 *   <aside role="dialog" aria-modal="true" {...trap} ref={ref}>
 *
 * 注：返回的 onKeyDown 会通过 currentTarget 查询可聚焦后代，
 *     无需传入 ref；若容器内无可聚焦元素则不执行循环。
 */
export function focusTrapProps(): FocusTrapPropsResult {
  return {
    'data-focus-trap': 'true',
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Tab') return;
      const container = e.currentTarget;
      const focusables = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
  };
}

/**
 * 图标按钮（仅含图标、无可见文字）的标准 ARIA 包装。
 * 返回的属性需挂到 <button> 上，确保屏幕阅读器能读出按钮含义。
 *
 * @param label 按钮用途，如 "关闭"、"重试"
 */
export function iconButtonAria(label: string): AriaPropsResult {
  return { 'aria-label': label };
}

/**
 * 链接/按钮跳过到主内容的属性（Skip Link 模式）。
 * 调用方负责通过 style 控制可见性（聚焦时显现）。
 */
export function skipLinkProps(targetId: string): {
  href: string;
  'aria-label': string;
  style: CSSProperties;
} {
  return {
    href: `#${targetId}`,
    'aria-label': '跳到主内容',
    style: {
      position: 'absolute',
      left: -9999,
      top: 8,
      zIndex: 9999,
      padding: '6px 12px',
      background: 'var(--blood)',
      color: 'var(--paper-light)',
      borderRadius: 3,
      textDecoration: 'none',
      fontSize: 13,
    },
  };
}

/**
 * 阻止点击事件冒泡与默认行为的辅助函数，常用于 mask 关闭。
 */
export function stopClick(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation();
  e.preventDefault();
}

/**
 * 阻止交互的 disabled 属性集合（同时设置 aria-disabled）。
 */
export function disabledProps(disabled: boolean): {
  disabled: boolean;
  'aria-disabled': boolean;
  tabIndex: number;
} {
  return {
    disabled,
    'aria-disabled': disabled,
    tabIndex: disabled ? -1 : 0,
  };
}
