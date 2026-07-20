"use client";

/**
 * 创作社区 · 分类 Tab + 筛选 chips 联动
 *
 * 对齐原型 .xhs-cats / .xhs-chips：
 * - 上方为分类 tab（.xhs-cat[data-cat]），切换时下方 chips 按 catChipsMap 重建；
 * - 下方为筛选 chips（.xhs-chip），单击高亮。
 *
 * catChipsMap 定义各分类对应的 chips 集合，由本模块导出供外部复用。
 */
import type { CategoryKey } from "@/lib/services/community-service";

/** 各分类对应的筛选 chips 集合（切换分类时据此重建） */
export const catChipsMap: Record<CategoryKey, string[]> = {
  recommend: ["全部", "本周热门", "新人作品", "编辑精选"],
  carpool: ["全部", "本周", "本月", "急招", "线上", "线下"],
  review: ["全部", "好评", "中评", "差评", "有剧透"],
  guide: ["全部", "新手", "进阶", "DM手册", "机制解析"],
  talk: ["全部", "行业", "创作", "闲聊"],
  ask: ["全部", "求本", "求组队", "求解答"],
  following: ["全部", "我关注的", "关注我的"],
};

/** 分类 tab 配置（label + 可选计数） */
const CATEGORIES: { key: CategoryKey; label: string; num?: string }[] = [
  { key: "recommend", label: "推荐" },
  { key: "carpool", label: "拼车", num: "126" },
  { key: "review", label: "测评" },
  { key: "guide", label: "攻略" },
  { key: "talk", label: "杂谈" },
  { key: "ask", label: "求助" },
  { key: "following", label: "我的关注" },
];

export interface CategoryTabsProps {
  /** 当前分类 */
  category: CategoryKey;
  /** 当前选中的 chip */
  chip: string;
  /** 分类切换回调（调用方应同时重置 chip 为 "全部"） */
  onCategoryChange: (cat: CategoryKey) => void;
  /** chip 切换回调 */
  onChipChange: (chip: string) => void;
}

/**
 * 渲染分类 tab 与联动 chips。
 * chips 列表由 catChipsMap[category] 派生，分类切换即自动重建。
 */
export default function CategoryTabs({
  category,
  chip,
  onCategoryChange,
  onChipChange,
}: CategoryTabsProps) {
  const chips = catChipsMap[category] ?? catChipsMap.recommend;

  return (
    <>
      <div className="xhs-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`xhs-cat${category === c.key ? " active" : ""}`}
            data-cat={c.key}
            onClick={() => onCategoryChange(c.key)}
          >
            {c.label}
            {c.num ? <span className="xc-num">{c.num}</span> : null}
          </button>
        ))}
      </div>

      <div className="xhs-chips">
        {chips.map((label) => (
          <button
            key={label}
            type="button"
            className={`xhs-chip${chip === label ? " active" : ""}`}
            onClick={() => onChipChange(label)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
