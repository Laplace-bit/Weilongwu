import React, { useState } from 'react';
import type { CameraViewMode, HudSnapshot, SubtitleState, WeatherMode } from '../types/game';
import {
  ARTIFACTS,
  INTERACTABLES,
  ROOM_NODES,
  SURFACE_LABELS,
  WEATHER_LABELS,
} from '../data/weilongData';

interface GameHudProps {
  hud: HudSnapshot;
  weather: WeatherMode;
  cameraView: CameraViewMode;
  muted: boolean;
  subtitle: SubtitleState | null;
  onWeatherChange: (w: WeatherMode) => void;
  onToggleCameraView: () => void;
  onToggleMute: () => void;
  onOpenMap: () => void;
  onOpenArtifacts: () => void;
  onPause: () => void;
  onTriggerInteract: () => void;
  onToggleXray: () => void;
  onToggleTaiji: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  weather,
  cameraView,
  muted,
  subtitle,
  onWeatherChange,
  onToggleCameraView,
  onToggleMute,
  onOpenMap,
  onOpenArtifacts,
  onPause,
  onTriggerInteract,
  onToggleXray,
  onToggleTaiji,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const nearby = cameraView === 'walk' ? hud.nearbyInteractable : null;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Defensive Window Peephole Vignette when active */}
      {hud.gunSlitActive && cameraView === 'walk' && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 26% 42% at 50% 50%, rgba(0,0,0,0) 62%, rgba(12,10,8,0.92) 100%)',
          }}
        />
      )}

      {/* TOP-LEFT: Architectural Location & Free-Walk Progress Readout */}
      <div
        className="fixed top-4 left-4 px-4 py-2.5 rounded border border-[#d9a84e]/25"
        style={{ backgroundColor: 'rgba(20, 17, 14, 0.84)' }}
      >
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif-display text-base font-bold text-[#f7f1e6] tracking-wider">
            {cameraView === 'aerial' ? '航拍俯瞰 · 梅州双围龙屋全景' : hud.currentNodeName}
          </span>
          <span className="text-xs text-[#d9a84e] whitespace-nowrap">
            {cameraView === 'aerial'
              ? '拖拽环绕 · 滚轮缩放'
              : SURFACE_LABELS[hud.currentSurface] ?? '青石板'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#cfc4b2]/85 mt-0.5 tabular-nums">
          <span>{hud.currentZoneName}</span>
          <span aria-hidden="true">·</span>
          <span>足迹 {hud.visitedNodes.length}/{ROOM_NODES.length}</span>
          <span aria-hidden="true">·</span>
          <span>交互 {hud.triggeredInteractions.length}/{INTERACTABLES.length}</span>
          <span aria-hidden="true">·</span>
          <span>器物 {hud.inspectedArtifacts.length}/{ARTIFACTS.length}</span>
        </div>
      </div>

      {/* TOP-RIGHT: Compact Square Utility Controls */}
      <div className="fixed top-4 right-4 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          tabIndex={-1}
          aria-label="打开围龙屋建筑平面图"
          title="建筑平面方位图 (G)"
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenMap();
          }}
          className="w-10 h-10 flex items-center justify-center rounded border border-[#d9a84e]/30 text-[#f5efe6] hover:border-[#d9a84e] transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(20, 17, 14, 0.84)' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 13a9 9 0 0 1 18 0" />
            <path d="M6 13a6 6 0 0 1 12 0" />
            <rect x="6" y="13" width="12" height="5" rx="1" />
          </svg>
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="打开 360 度器物图鉴"
          title="360° 民俗器物图鉴 (C)"
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenArtifacts();
          }}
          className="w-10 h-10 flex items-center justify-center rounded border border-[#d9a84e]/30 text-[#f5efe6] hover:border-[#d9a84e] transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(20, 17, 14, 0.84)' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v15H7.5A2.5 2.5 0 0 0 5 21V6.5Z" />
            <path d="M9 8h6M9 12h6" />
          </svg>
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label={muted ? '取消静音' : '静音'}
          title={muted ? '开启音效 (M)' : '静音 (M)'}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="w-10 h-10 flex items-center justify-center rounded border border-[#d9a84e]/30 text-[#f5efe6] hover:border-[#d9a84e] transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(20, 17, 14, 0.84)' }}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="m16 9 5 6M21 9l-5 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          )}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="暂停游览"
          title="暂停 (Esc)"
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          className="w-10 h-10 flex items-center justify-center rounded border border-[#d9a84e]/30 text-[#f5efe6] hover:border-[#d9a84e] transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(20, 17, 14, 0.84)' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </button>
      </div>

      {/* CENTER RETICLE DOT (First-Person Walk Mode Only) */}
      {cameraView === 'walk' && (
        <div
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{
            backgroundColor: nearby ? '#e8b954' : 'rgba(247, 241, 230, 0.55)',
            boxShadow: '0 0 0 2px rgba(20, 17, 14, 0.45)',
          }}
        />
      )}

      {/* CONTEXTUAL INTERACTION PROMPT (only visible when close to a prop) */}
      {nearby && (
        <div className="fixed left-1/2 top-[56%] -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTriggerInteract();
            }}
            className="flex items-center gap-3 px-4 py-2 rounded border border-[#d9a84e]/60 text-left transition-transform hover:scale-[1.02] cursor-pointer shadow-lg"
            style={{ backgroundColor: 'rgba(22, 18, 14, 0.9)' }}
          >
            <span className="px-2 py-0.5 text-xs font-bold bg-[#b5382a] text-[#faf5ed] rounded">
              E
            </span>
            <div>
              <div className="text-sm font-semibold text-[#f7f1e6] leading-snug whitespace-nowrap">
                {nearby.actionLabel}
              </div>
              <div className="text-[11px] text-[#d9a84e] whitespace-nowrap">
                {nearby.name} · {nearby.tierLabel}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* NON-INTRUSIVE HAKKA DIALECT + MANDARIN FOLKLORE SUBTITLE RIBBON */}
      {subtitle && (
        <div
          className="fixed left-1/2 -translate-x-1/2 max-w-xl w-[90vw] px-5 py-3 rounded border border-[#d9a84e]/35 text-center transition-all"
          style={{
            bottom: dockCollapsed ? '52px' : '116px',
            backgroundColor: 'rgba(20, 17, 14, 0.88)',
          }}
        >
          <div className="font-serif-display text-base text-[#ebd08a] tracking-wide">
            {subtitle.hakkaQuote}
          </div>
          <div className="text-xs md:text-sm text-[#f5efe6] mt-1">
            {subtitle.mandarinSub}
          </div>
          <div className="text-[11px] text-[#c7bca9]/85 mt-1">
            {subtitle.title} · {subtitle.culturalNote}
          </div>
        </div>
      )}

      {/* COLLAPSIBLE UNIFIED BOTTOM CONTROL DOCK (ZERO TELEPORT — PURE FREE WALKING!) */}
      <div className="fixed bottom-4 inset-x-0 flex justify-center pointer-events-none px-4">
        <div
          className="flex flex-col items-center pointer-events-auto max-w-[96vw]"
          style={{
            transform: dockCollapsed ? 'translateY(calc(100% - 26px))' : 'translateY(0)',
            transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-expanded={!dockCollapsed}
            onClick={(e) => {
              e.currentTarget.blur();
              setDockCollapsed((v) => !v);
            }}
            className="px-3.5 py-1 text-[11px] text-[#dfd5c5] hover:text-[#f7f1e6] rounded-t border border-b-0 border-[#d9a84e]/30 cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'rgba(20, 17, 14, 0.88)' }}
          >
            {dockCollapsed ? '▴ 展开游览工具栏' : '▾ 收起工具栏'}
          </button>

          <div
            className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#d9a84e]/30 shadow-xl"
            style={{ backgroundColor: 'rgba(20, 17, 14, 0.9)' }}
          >
            {/* Walk vs Aerial Inspection View Toggle */}
            <div className="flex items-center gap-1 pr-2 border-r border-[#f5efe6]/15">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleCameraView();
                }}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                  cameraView === 'aerial'
                    ? 'bg-[#d9a84e] text-[#171310] font-semibold'
                    : 'bg-white/10 text-[#f5efe6] hover:bg-white/15'
                }`}
              >
                {cameraView === 'aerial' ? '返回自由步行 (V)' : '航拍俯瞰全景 (V)'}
              </button>
            </div>

            {/* Weather Segmented Switcher */}
            <div className="flex items-center gap-1 pr-2 border-r border-[#f5efe6]/15">
              {(['sunny', 'rain', 'lantern'] as WeatherMode[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onWeatherChange(w);
                  }}
                  className={`px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                    weather === w
                      ? 'bg-[#b5382a] text-[#faf5ed] font-semibold'
                      : 'text-[#d8cebe] hover:text-[#faf5ed] hover:bg-white/10'
                  }`}
                >
                  {WEATHER_LABELS[w].name}
                </button>
              ))}
            </div>

            {/* Architectural Cutaways */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleXray();
                }}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                  hud.xrayActive
                    ? 'bg-[#d9a84e] text-[#171310] font-semibold'
                    : 'text-[#d8cebe] hover:text-[#faf5ed] hover:bg-white/10'
                }`}
              >
                夯土透视
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleTaiji();
                }}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                  hud.taijiActive
                    ? 'bg-[#d9a84e] text-[#171310] font-semibold'
                    : 'text-[#d8cebe] hover:text-[#faf5ed] hover:bg-white/10'
                }`}
              >
                太极脉络
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
