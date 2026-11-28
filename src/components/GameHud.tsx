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
  onVolumeChange: (v: number) => void;
  onTimeOfDayChange: (hour: number) => void;
  onToggleTimePlaying: () => void;
  onCycleTimeSpeed: () => void;
  onOpenMap: () => void;
  onOpenArtifacts: () => void;
  onPause: () => void;
  onTriggerInteract: () => void;
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
  onVolumeChange,
  onTimeOfDayChange,
  onToggleTimePlaying,
  onCycleTimeSpeed,
  onOpenMap,
  onOpenArtifacts,
  onPause,
  onTriggerInteract,
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
        style={{ backgroundColor: 'rgba(22, 35, 56, 0.86)' }}
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

      {/* TOP-RIGHT: Compact Utility Controls + Sleek Audio Volume Control */}
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
          style={{ backgroundColor: 'rgba(22, 35, 56, 0.86)' }}
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
          style={{ backgroundColor: 'rgba(22, 35, 56, 0.86)' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v15H7.5A2.5 2.5 0 0 0 5 21V6.5Z" />
            <path d="M9 8h6M9 12h6" />
          </svg>
        </button>

        {/* Mute Toggle + Integrated Volume Slider */}
        <div
          className="h-10 flex items-center gap-2 px-2.5 rounded border border-[#d9a84e]/30 text-[#f5efe6]"
          style={{ backgroundColor: 'rgba(22, 35, 56, 0.86)' }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? '取消静音' : '静音'}
            title={muted ? '开启音乐与环境音 (M)' : '静音 (M)'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-6 h-6 flex items-center justify-center text-[#f5efe6] hover:text-[#ebb854] transition-colors cursor-pointer"
          >
            {muted || hud.volume <= 0.01 ? (
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
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            aria-label="音量调节"
            title="背景音乐与环境音量"
            value={muted ? 0 : hud.volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-16 h-1.5 accent-[#ebb854] cursor-pointer"
          />
        </div>

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
          style={{ backgroundColor: 'rgba(22, 35, 56, 0.86)' }}
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
            className="flex items-center gap-3 px-4 py-2 rounded border border-[#ebb854]/60 text-left transition-transform hover:scale-[1.02] cursor-pointer shadow-lg"
            style={{ backgroundColor: 'rgba(22, 35, 56, 0.92)' }}
          >
            <span className="px-2 py-0.5 text-xs font-bold bg-[#d44c2b] text-[#fbf5e8] rounded">
              E
            </span>
            <div>
              <div className="text-sm font-semibold text-[#fbf5e8] leading-snug whitespace-nowrap">
                {nearby.actionLabel}
              </div>
              <div className="text-[11px] text-[#f0c563] whitespace-nowrap">
                {nearby.name} · {nearby.tierLabel}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* NON-INTRUSIVE HAKKA DIALECT + MANDARIN FOLKLORE SUBTITLE RIBBON */}
      {subtitle && (
        <div
          className="fixed left-1/2 -translate-x-1/2 max-w-xl w-[90vw] px-5 py-3 rounded border border-[#ebb854]/35 text-center transition-all"
          style={{
            bottom: dockCollapsed ? '52px' : '124px',
            backgroundColor: 'rgba(22, 35, 56, 0.90)',
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

      {/* COLLAPSIBLE UNIFIED BOTTOM CONTROL DOCK: VIEW + WEATHER + 24H INTERACTIVE TIMELINE */}
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
            className="px-3.5 py-1 text-[11px] text-[#e8dec9] hover:text-[#fbf5e8] rounded-t border border-b-0 border-[#ebb854]/30 cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'rgba(22, 35, 56, 0.88)' }}
          >
            {dockCollapsed ? '▴ 展开游览与昼夜时间轴' : '▾ 收起工具栏'}
          </button>

          <div
            className="flex flex-wrap lg:flex-nowrap items-center justify-center gap-2.5 px-3.5 py-2 rounded border border-[#ebb854]/30 shadow-xl"
            style={{ backgroundColor: 'rgba(22, 35, 56, 0.92)' }}
          >
            {/* Walk vs Aerial Inspection View Toggle */}
            <div className="flex items-center gap-1 pr-2.5 border-r border-[#f5efe6]/15">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleCameraView();
                }}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                  cameraView === 'aerial'
                    ? 'bg-[#ebb854] text-[#162338] font-semibold'
                    : 'bg-white/10 text-[#fbf5e8] hover:bg-white/15'
                }`}
              >
                {cameraView === 'aerial' ? '返回自由步行 (V)' : '航拍俯瞰 (V)'}
              </button>
            </div>

            {/* Weather Switcher (Sunny / Rain) */}
            <div className="flex items-center gap-1 pr-2.5 border-r border-[#f5efe6]/15">
              {(['sunny', 'rain'] as WeatherMode[]).map((w) => (
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
                      ? 'bg-[#d44c2b] text-[#fbf5e8] font-semibold'
                      : 'text-[#e5dbc6] hover:text-[#fbf5e8] hover:bg-white/10'
                  }`}
                >
                  {WEATHER_LABELS[w].name}
                </button>
              ))}
            </div>

            {/* 24-Hour Interactive Day-Night Timeline */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                aria-label={hud.timePlaying ? '暂停昼夜流逝' : '播放昼夜流逝'}
                title={hud.timePlaying ? '暂停时间流逝' : '继续昼夜循环'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleTimePlaying();
                }}
                className="w-7 h-7 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-[#fbf5e8] transition-colors cursor-pointer"
              >
                {hud.timePlaying ? (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <polygon points="7,5 19,12 7,19" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="切换时间倍速"
                title="点击切换昼夜流逝倍速 (1× / 5× / 20× / 60×)"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleTimeSpeed();
                }}
                className="px-2 py-1 text-xs font-mono font-semibold rounded bg-white/10 hover:bg-white/20 text-[#f2c86b] transition-colors cursor-pointer tabular-nums min-w-[38px]"
              >
                {hud.timeSpeed}×
              </button>

              <div className="flex flex-col min-w-[190px] sm:min-w-[230px]">
                <div className="flex items-center justify-between text-[11px] leading-none mb-1 tabular-nums">
                  <span className="text-[#f7f1e6] font-mono font-semibold">
                    {hud.formattedTime}
                  </span>
                  <span className="text-[#ebb854] font-serif-display tracking-wide">
                    {hud.timePeriodLabel}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={23.95}
                  step={0.05}
                  aria-label="昼夜时间轴"
                  data-testid="day-night-slider"
                  value={hud.timeOfDay}
                  onChange={(e) => onTimeOfDayChange(Number(e.target.value))}
                  className="w-full h-1.5 accent-[#ebb854] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-[#cfc4b2]/70 mt-0.5 leading-none">
                  <span>00</span>
                  <span>晨 06</span>
                  <span>午 12</span>
                  <span>暮 18</span>
                  <span>24</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
