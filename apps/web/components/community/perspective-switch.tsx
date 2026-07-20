"use client";

/**
 * 创作社区 · 双视角切换组件
 *
 * 对齐原型 .perspective-switch：创作者 / 玩家 两个 .ps-btn，
 * 通过 data-perspective 在容器上标记当前视角，CSS 据此显隐
 * .for-creator / .for-player 按钮组。
 */
import type { Perspective } from "@/lib/services/community-service";

export interface PerspectiveSwitchProps {
  /** 当前视角 */
  perspective: Perspective;
  /** 视角切换回调 */
  onChange: (p: Perspective) => void;
}

/** 视角选项配置 */
const PERSPECTIVES: { key: Perspective; label: string }[] = [
  { key: "creator", label: "创作者视角" },
  { key: "player", label: "玩家视角" },
];

/**
 * 渲染 .perspective-switch 容器与两个 .ps-btn。
 * 当前视角按钮追加 .active。
 */
export default function PerspectiveSwitch({
  perspective,
  onChange,
}: PerspectiveSwitchProps) {
  return (
    <div className="perspective-switch">
      {PERSPECTIVES.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`ps-btn${perspective === p.key ? " active" : ""}`}
          data-perspective={p.key}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
