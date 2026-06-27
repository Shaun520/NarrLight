// 推广页侦探道具层组件
// 严格还原 docs/prototype/promo-v1.html 第 1083-1194 行的 .props 层
// 包含红绳连线、人物关系图、旧照片、放大镜、密码锁、钢笔、地图标记、粉笔人形

import type { CSSProperties } from "react";

const dialOrigin1: CSSProperties = { transformOrigin: "28px 51px" };
const dialOrigin2: CSSProperties = { transformOrigin: "50px 51px" };
const dialOrigin3: CSSProperties = { transformOrigin: "72px 51px" };

export function PromoProps() {
  return (
    <div className="props">
      {/* 红绳线索连线 */}
      <svg
        className="red-strings"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d="M95 8 C75 28 25 10 5 12" />
        <path d="M5 12 C25 40 75 50 95 92" />
        <path d="M95 92 C70 80 30 35 5 88" />
        <path d="M5 88 C30 65 70 30 95 8" />
      </svg>

      {/* 人物关系 */}
      <div className="prop prop-relations">
        <svg viewBox="0 0 200 160">
          <circle cx="100" cy="36" r="18" fill="#eaddcf" stroke="#8a1c1c" strokeWidth="1.4" />
          <text x="100" y="40" textAnchor="middle" fontSize="10" fill="#2b2118" fontFamily="Noto Serif SC, serif">死者</text>
          <circle cx="42" cy="118" r="15" fill="#eaddcf" stroke="#5a4632" strokeWidth="1.4" />
          <text x="42" y="122" textAnchor="middle" fontSize="9" fill="#2b2118" fontFamily="Noto Serif SC, serif">A</text>
          <circle cx="100" cy="138" r="15" fill="#eaddcf" stroke="#5a4632" strokeWidth="1.4" />
          <text x="100" y="142" textAnchor="middle" fontSize="9" fill="#2b2118" fontFamily="Noto Serif SC, serif">B</text>
          <circle cx="158" cy="110" r="15" fill="#eaddcf" stroke="#5a4632" strokeWidth="1.4" />
          <text x="158" y="114" textAnchor="middle" fontSize="9" fill="#2b2118" fontFamily="Noto Serif SC, serif">C</text>
          <line x1="88" y1="52" x2="52" y2="104" stroke="#8a1c1c" strokeWidth="1" strokeDasharray="4 3" opacity=".75" />
          <line x1="100" y1="54" x2="100" y2="123" stroke="#8a1c1c" strokeWidth="1" strokeDasharray="4 3" opacity=".75" />
          <line x1="112" y1="52" x2="148" y2="96" stroke="#8a1c1c" strokeWidth="1" strokeDasharray="4 3" opacity=".75" />
        </svg>
      </div>

      {/* 旧照片 */}
      <div className="prop prop-photos">
        <div className="old-photo">
          <div className="photo-tape" />
          <svg viewBox="0 0 60 80" preserveAspectRatio="xMidYMid slice">
            <rect width="60" height="80" fill="#7a5c3a" opacity=".35" />
            <path d="M8 72 L22 38 L34 54 L52 24 L56 72Z" fill="#4a3a2a" opacity=".55" />
          </svg>
          <div className="photo-caption">1997.10.13</div>
        </div>
        <div className="old-photo">
          <div className="photo-tape" />
          <svg viewBox="0 0 60 80" preserveAspectRatio="xMidYMid slice">
            <rect width="60" height="80" fill="#7a5c3a" opacity=".35" />
            <circle cx="30" cy="32" r="14" fill="#4a3a2a" opacity=".5" />
            <path d="M8 70 L20 50 L32 62 L52 40 L56 70Z" fill="#4a3a2a" opacity=".55" />
          </svg>
          <div className="photo-caption">?</div>
        </div>
      </div>

      {/* 放大镜 */}
      <div className="prop prop-magnifier">
        <svg viewBox="0 0 100 100">
          <circle className="magnifier-lens" cx="36" cy="36" r="28" />
          <line x1="56" y1="56" x2="90" y2="90" stroke="#5a4632" strokeWidth="7" strokeLinecap="round" />
          <circle cx="36" cy="36" r="24" fill="rgba(234,221,207,0.08)" stroke="none" />
        </svg>
      </div>

      {/* 密码锁 */}
      <div className="prop prop-lock">
        <svg viewBox="0 0 100 78">
          <rect x="8" y="28" width="84" height="46" rx="5" fill="#3a3028" stroke="#c9b8a4" strokeWidth="2" />
          <path d="M28 28 V18 A22 22 0 0 1 72 18 V28" fill="none" stroke="#5a4632" strokeWidth="5" />
          <g className="lock-dial" style={dialOrigin1}>
            <rect x="18" y="38" width="20" height="26" rx="2" fill="#eaddcf" stroke="#5a4632" strokeWidth="1" />
            <text x="28" y="56" textAnchor="middle" fontSize="14" fill="#1a120b" fontFamily="Courier Prime, monospace">7</text>
          </g>
          <g className="lock-dial" style={dialOrigin2}>
            <rect x="40" y="38" width="20" height="26" rx="2" fill="#eaddcf" stroke="#5a4632" strokeWidth="1" />
            <text x="50" y="56" textAnchor="middle" fontSize="14" fill="#1a120b" fontFamily="Courier Prime, monospace">3</text>
          </g>
          <g className="lock-dial" style={dialOrigin3}>
            <rect x="62" y="38" width="20" height="26" rx="2" fill="#eaddcf" stroke="#5a4632" strokeWidth="1" />
            <text x="72" y="56" textAnchor="middle" fontSize="14" fill="#1a120b" fontFamily="Courier Prime, monospace">0</text>
          </g>
        </svg>
      </div>

      {/* 钢笔 */}
      <div className="prop prop-pen">
        <svg viewBox="0 0 160 36">
          <path d="M4 18 L128 18" stroke="#1a120b" strokeWidth="5" strokeLinecap="round" />
          <path d="M128 18 L150 11 L158 18 L150 25 Z" fill="#8a1c1c" />
          <path d="M4 18 L14 12 L14 24 Z" fill="#c9b8a4" />
          <path d="M14 14 L20 14 L20 22 L14 22 Z" fill="#5a4632" />
        </svg>
      </div>

      {/* 地图标记 */}
      <div className="prop prop-map">
        <svg viewBox="0 0 200 140">
          <path className="map-route" d="M20 110 C60 90 100 100 140 80 S190 70 180 100" />
          <g transform="translate(45,78)">
            <path d="M0 0 C-9 0 -9 14 0 24 L0 32 L7 24 C16 14 16 0 7 0Z" fill="#8a1c1c" opacity=".85" />
            <circle cx="3.5" cy="10" r="3.5" fill="#eaddcf" />
          </g>
          <g transform="translate(105,58)">
            <path d="M0 0 C-9 0 -9 14 0 24 L0 32 L7 24 C16 14 16 0 7 0Z" fill="#8a1c1c" opacity=".85" />
            <circle cx="3.5" cy="10" r="3.5" fill="#eaddcf" />
          </g>
          <g transform="translate(165,88)">
            <path d="M0 0 C-9 0 -9 14 0 24 L0 32 L7 24 C16 14 16 0 7 0Z" fill="#8a1c1c" opacity=".85" />
            <circle cx="3.5" cy="10" r="3.5" fill="#eaddcf" />
          </g>
        </svg>
      </div>

      {/* 粉笔人形 */}
      <div className="prop prop-chalk">
        <svg viewBox="0 0 400 130" preserveAspectRatio="xMidYMax meet">
          <path
            className="chalk-outline"
            d="M125 128 C112 112 118 88 134 76 C130 60 140 44 160 40 C166 24 182 16 202 18 C222 16 238 24 244 40 C264 44 274 60 270 76 C286 88 292 112 279 128 M160 40 C150 55 148 72 154 90 M244 40 C254 55 256 72 250 90 M134 76 C115 68 95 72 82 84 M270 76 C289 68 309 72 322 84 M154 90 C140 105 135 120 138 128 M250 90 C264 105 269 120 266 128"
          />
        </svg>
      </div>
    </div>
  );
}
