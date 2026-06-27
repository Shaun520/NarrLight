// 推广落地页 - 严格还原 docs/prototype/promo-v1.html
// 营销首页，URL 为 /（路由组 (marketing) 不进入 URL）
// 注意：需配合 Phase B 移除 (dashboard)/page.tsx 以解决路由冲突

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PromoProps } from "@/components/marketing/promo-props";
import "../promo.css";

export default function PromoPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const hero = heroRef.current;
    if (!stage || !hero) return;

    const handleMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 8;
      const y = (e.clientY / window.innerHeight - 0.5) * 6;
      hero.style.transform = `translate(${x}px, ${y}px) rotate(-1.5deg)`;
    };
    const handleLeave = () => {
      hero.style.transform = "translate(0,0) rotate(-1.5deg)";
    };

    stage.addEventListener("mousemove", handleMove);
    stage.addEventListener("mouseleave", handleLeave);
    return () => {
      stage.removeEventListener("mousemove", handleMove);
      stage.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <div className="stage" ref={stageRef}>
      {/* 氛围层：指纹、血迹、涂抹 */}
      <div className="atmosphere">
        <svg
          className="fingerprint fp-1"
          viewBox="0 0 100 120"
          fill="none"
          stroke="#4a2418"
          strokeWidth="1.2"
        >
          <path d="M50 10 C30 10 15 30 15 55 C15 80 30 105 50 110 C70 105 85 80 85 55 C85 30 70 10 50 10Z" />
          <path d="M50 22 C36 22 26 36 26 55 C26 74 36 92 50 98 C64 92 74 74 74 55 C74 36 64 22 50 22Z" />
          <path d="M50 36 C41 36 35 44 35 56 C35 69 41 81 50 85 C59 81 65 69 65 56 C65 44 59 36 50 36Z" />
          <path d="M50 48 C45 48 42 52 42 58 C42 65 45 71 50 74 C55 71 58 65 58 58 C58 52 55 48 50 48Z" />
        </svg>

        <svg
          className="blood-splatter"
          style={{ top: 0, left: -60, width: 300 }}
          viewBox="0 0 300 200"
        >
          <path d="M40,40 Q80,10 120,45 T200,30 Q260,50 280,90 T250,150 Q200,190 140,170 T60,180 Q10,140 40,80 T40,40Z" />
          <circle cx="90" cy="90" r="28" />
          <circle cx="170" cy="110" r="18" />
          <circle cx="220" cy="70" r="14" />
        </svg>

        <svg
          className="blood-splatter"
          style={{ bottom: -30, right: -40, width: 240, transform: "rotate(15deg)" }}
          viewBox="0 0 300 200"
        >
          <path d="M60,60 Q110,20 160,55 T240,45 Q290,75 285,120 T230,170 Q160,195 100,165 T30,140 Q-10,100 60,60Z" />
          <circle cx="120" cy="110" r="32" />
          <circle cx="200" cy="130" r="20" />
          <circle cx="250" cy="90" r="12" />
        </svg>

        <div className="blood-drip" style={{ top: 0, left: "18%", height: 120 }} />
        <div className="blood-drip" style={{ top: 0, left: "73%", height: 80, width: 7 }} />
        <div className="blood-drip" style={{ top: 0, left: "92%", height: 150, width: 12 }} />

        <div className="scribble scribble-1">凶手是 AI？</div>
        <div className="scribble scribble-2">逻辑闭环 = 完美谋杀</div>
      </div>

      {/* 侦探道具层 */}
      <PromoProps />

      {/* 印章 */}
      <div className="stamp">绝密</div>

      {/* 主标题 */}
      <div className="hero">
        <h1 ref={heroRef}>
          <span>叙</span>
          <span>光</span>
        </h1>
        <div className="subtitle">NARRLIGHT</div>
        <div className="tagline">
          AI 驱动的剧本杀全生命周期平台<br />
          创作 · 校验 · 线索 · 变现
        </div>
      </div>

      {/* 线索卡 */}
      <div className="clue-zone">
        <div className="clue clue-horror clue-1">
          <span className="blood-drop" />
          <div className="label">HORROR · 物证</div>
          <div className="text">
            编号：A-07<br />
            现场遗留一把生锈的钥匙，齿痕与二楼储藏室门锁吻合。钥匙柄上刻有半个“叙”字，边缘沾有未干涸的痕迹。
          </div>
        </div>

        <div className="clue clue-deduction clue-2">
          <div className="label">TESTIMONY · 口供</div>
          <div className="text">
            证人：匿名<br />
            “23:15，我看见有人从走廊尽头走过。灯光闪烁，看不清脸，只听见他低声说——‘叙光会照亮所有谎言。’”
          </div>
          <span className="barcode" />
        </div>

        <div className="clue clue-noir clue-3">
          <span className="burn-hole" />
          <div className="label">NOIR · 暗角</div>
          <div className="text">
            解锁条件：找出所有不在场证明<br />
            地下档案室有一份未登记的时间线。每个人的证词都在说谎，除了那个没有名字的影子。
          </div>
        </div>

        <div className="clue clue-emotion clue-4">
          <span className="wax-seal" />
          <div className="label">HIDDEN · 残页</div>
          <div className="text">
            残页日记：<br />
            “我创造了叙光，不是为了杀人，而是为了……让每一个人都成为故事的共谋。”
          </div>
        </div>
      </div>

      {/* 人物台词 */}
      <div className="quote-zone">
        <div className="quote quote-emotion quote-2">
          {`“就在此刻，`}<br />{`我，与我诀别”`}
        </div>
        <div className="quote quote-emotion quote-3">
          {`“我是来自星辰与神明的诗篇，亦是奇迹的孩子。”`}
        </div>
        <div className="quote quote-emotion quote-5">
          {`“未曾这般与你”`}
        </div>
        <div className="quote quote-emotion quote-4">
          {`“那不是我的月亮，但有一刻，月光照在了我的身上。”`}
        </div>
        <Link href="/auth/sign-up" className="cta-button">
          开始创作
        </Link>
      </div>

      {/* 底部能力标签 */}
      <div className="powers">
        <span>剧本 AI 生成</span>
        <span>时间线校验</span>
        <span>线索卡管理</span>
        <span>人物关系可视化</span>
      </div>
    </div>
  );
}
