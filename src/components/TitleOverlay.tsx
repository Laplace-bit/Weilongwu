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
          'linear-gradient(105deg, rgba(18,15,12,0.82) 0%, rgba(18,15,12,0.45) 42%, rgba(18,15,12,0.08) 76%, rgba(18,15,12,0.22) 100%)',
      }}
    >
      {/* Top quiet architectural stamp */}
      <div className="flex items-center gap-3 text-xs tracking-[0.22em] text-[#d6cbb8]/85">
        <span>梅州客家传统民居</span>
        <span aria-hidden="true">·</span>
        <span>1:1 写实双围龙屋</span>
        <span aria-hidden="true">·</span>
        <span>全开放自由步行游览</span>
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
              stroke="#d9a84e"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M 16 48 A 28 28 0 0 1 72 48"
              fill="none"
              stroke="#f4ede1"
              strokeWidth="2"
              strokeOpacity="0.85"
            />
            <circle cx="44" cy="30" r="3" fill="#d9a84e" />
            <rect
              x="26"
              y="46"
              width="36"
              height="17"
              rx="1.5"
              fill="rgba(217,168,78,0.12)"
              stroke="#f4ede1"
              strokeWidth="1.8"
            />
            <line x1="36" y1="46" x2="36" y2="63" stroke="#f4ede1" strokeWidth="1.2" strokeOpacity="0.65" />
            <line x1="52" y1="46" x2="52" y2="63" stroke="#f4ede1" strokeWidth="1.2" strokeOpacity="0.65" />
            <path
              d="M 24 69 A 22 14 0 0 0 64 69 Z"
              fill="rgba(76, 152, 146, 0.35)"
              stroke="#6cbcb4"
              strokeWidth="1.8"
            />
          </svg>

          <div>
            <h1 className="font-serif-display text-4xl md:text-6xl font-bold tracking-[0.14em] text-[#f7f1e6] leading-tight">
              围龙古韵
            </h1>
            <p className="text-sm md:text-base tracking-[0.18em] text-[#d9a84e] mt-1.5">
              客家双围龙屋 · 1:1 自由步行沉浸游览
            </p>
          </div>
        </div>

        <p className="text-sm md:text-base leading-relaxed text-[#e5dccd]/90 max-w-md mb-8">
          循真实动线自由漫步：由半月塘与禾坪步入凹肚正门，穿三堂双天井与东西两横，漫步宽阔化胎坪与内外双层围龙环巷，亲触每一处青瓦梁柱与客家烟火。
        </p>

        <div className="flex items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-8 py-3.5 text-base font-semibold tracking-[0.14em] bg-[#b5382a] hover:bg-[#c84334] active:bg-[#9c2f22] text-[#faf5ed] rounded border border-[#e39c64]/40 transition-colors cursor-pointer shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9a84e] whitespace-nowrap"
          >
            踏步游览
          </button>
          <span className="text-xs text-[#cfc4b2]/85 tracking-wide tabular-nums">
            全自由步行 · {ROOM_NODES.length} 处实景空间 · {INTERACTABLES.length} 项交互
          </span>
        </div>
      </div>

      {/* Single flat borderless bottom control-hint line */}
      <div className="text-xs text-[#cfc4b2]/80 tracking-wide">
        WASD / 方向键自由行走 · Shift 疾步 · 鼠标拖拽环顾 · E / 点击交互 · V 切换航拍俯瞰 · 1/2/3 天气 · G 方位图
      </div>
    </div>
  );
};
