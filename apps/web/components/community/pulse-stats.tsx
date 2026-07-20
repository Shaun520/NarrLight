/**
 * 创作社区 · 社区脉搏统计条
 *
 * 对齐原型 .xhs-pulse：4 项统计（今日新发行 / 在线拼车局 / 24H 评价 / 活跃创作者），
 * 项间用 .xp-div 竖线分隔。纯展示组件，无客户端交互。
 */
import { Fragment } from "react";
import type { PulseStat } from "@/lib/services/community-service";

export interface PulseStatsProps {
  stats: PulseStat[];
}

/**
 * 渲染 .xhs-pulse 容器，遍历 stats 输出 .xp-item，项间插入 .xp-div。
 * 使用 Fragment 保证 .xp-item / .xp-div 作为 .xhs-pulse 直接子元素，flex 布局生效。
 */
export default function PulseStats({ stats }: PulseStatsProps) {
  return (
    <div className="xhs-pulse">
      {stats.map((s, i) => (
        <Fragment key={s.lbl}>
          {i > 0 && <div className="xp-div" />}
          <div className="xp-item">
            <span className="xp-num">{s.num}</span>
            <span className="xp-lbl">{s.lbl}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
