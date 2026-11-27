import React from 'react';
import { INTERACTABLES, ROOM_NODES } from '../data/weilongData';

interface TitleOverlayProps {
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ onStart }) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none"
      style={{
        background:
          'linear-gradient(105deg, rgba(20,33,54,0.82) 0%, rgba(20,33,54,0.46) 40%, rgba(20,33,54,0.06) 74%, rgba(20,33,54,0.18) 100%)',
      }}
    >
      {/* Top quiet architectural stamp */}
      <div className="flex items-center gap-3 text-xs tracking-[0.22em] text-[#efe5cf]/90">
        <span>梅州客家画境</span>
        <span aria-hidden="true">·</span>
        <span>青绿彩绘双围龙屋</span>
        <span aria-hidden="true">·</span>
        <span>人间烟火自由漫游</span>
      </div>

      {/* Main focal title lockup anchored in left negative space */}
      <div className="max-w-xl my-auto pointer-events-auto">
        <div className="flex items-center gap-4 mb-5">
          {/* Bespoke inline SVG Double-Weilongwu Architectural Emblem */}
          <svg
            viewBox="0 0 88 88"
            className="w-16 h-16 shrink-0"
            aria-hidden="true"
          >
            <path
              d="M 8 48 A 36 36 0 0 1 80 48"
              fill="none"
              stroke="#ebb854"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M 16 48 A 28 28 0 0 1 72 48"
              fill="none"
              stroke="#faf3e3"
              strokeWidth="2"
              strokeOpacity="0.9"
            />
            <circle cx="44" cy="30" r="3.2" fill="#d4552b" />
            <rect
              x="26"
              y="46"
              width="36"
              height="17"
              rx="1.5"
              fill="rgba(235,184,84,0.14)"
              stroke="#faf3e3"
              strokeWidth="1.8"
            />
            <line x1="36" y1="46" x2="36" y2="63" stroke="#faf3e3" strokeWidth="1.2" strokeOpacity="0.65" />
            <line x1="52" y1="46" x2="52" y2="63" stroke="#faf3e3" strokeWidth="1.2" strokeOpacity="0.65" />
            <path
              d="M 24 69 A 22 14 0 0 0 64 69 Z"
              fill="rgba(79, 159, 200, 0.38)"
              stroke="#7fd0ca"
              strokeWidth="1.8"
            />
          </svg>

          <div>
            <h1 className="font-serif-display text-4xl md:text-6xl font-bold tracking-[0.14em] text-[#fbf5e8] leading-tight">
              围龙古韵
            </h1>
            <p className="text-sm md:text-base tracking-[0.18em] text-[#f0c563] mt-1.5">
              桃源画卷 · 客家双围龙屋人间烟火
            </p>
          </div>
        </div>

        <p className="text-sm md:text-base leading-relaxed text-[#f2e8d4]/92 max-w-md mb-8">
          步入青绿彩绘的梅州客家围龙桃源：垂柳桃花映半月莲塘，鹅鸭戏水、鸡犬相闻、炊烟袅袅；与晒谷挑担的乡邻孩童擦肩而过，穿三堂双天井，细赏百年围龙古韵。
        </p>

        <div className="flex items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-8 py-3.5 text-base font-semibold tracking-[0.14em] bg-[#d44c2b] hover:bg-[#e25937] active:bg-[#b83e21] text-[#fbf5e8] rounded border border-[#f5c878]/50 transition-colors cursor-pointer shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ebb854] whitespace-nowrap"
          >
            入画游览
          </button>
          <span className="text-xs text-[#e8dec9]/90 tracking-wide tabular-nums">
            全自由步行 · {ROOM_NODES.length} 处空间 · {INTERACTABLES.length} 项交互
          </span>
        </div>
      </div>

      {/* Single flat borderless bottom control-hint line */}
      <div className="text-xs text-[#e8dec9]/85 tracking-wide">
        WASD / 方向键自由行走 · Shift 疾步 · 鼠标拖拽环顾 · E / 点击交互 · V 切换航拍俯瞰 · 1/2/3 晴雨灯夜 · G 方位图
      </div>
    </div>
  );
};
