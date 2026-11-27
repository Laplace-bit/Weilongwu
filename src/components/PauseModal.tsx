import React from 'react';
import type { HudSnapshot } from '../types/game';
import { ARTIFACTS, INTERACTABLES, ROOM_NODES } from '../data/weilongData';
import { calculateMasteryProgress } from '../engine/worldMath';

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onResetPosition: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onResetPosition,
  onReturnTitle,
}) => {
  const mastery = calculateMasteryProgress(
    hud.visitedNodes.length,
    ROOM_NODES.length,
    hud.triggeredInteractions.length,
    INTERACTABLES.length,
    hud.inspectedArtifacts.length,
    ARTIFACTS.length
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 10, 8, 0.8)' }}
      role="dialog"
      aria-modal="true"
      aria-label="游览已暂停"
    >
      <div
        className="w-full max-w-md rounded-lg border border-[#d9a84e]/40 p-6 shadow-2xl"
        style={{ backgroundColor: '#191512' }}
      >
        <div className="text-xs text-[#d9a84e] tracking-[0.18em]">围龙古韵</div>
        <h2 className="font-serif-display text-2xl font-bold text-[#f7f1e6] mt-1 tracking-wider">
          游览暂停
        </h2>

        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="p-3 rounded bg-white/[0.04] border border-[#f5efe6]/10 text-center">
            <div className="text-xl font-bold text-[#f7f1e6] tabular-nums">
              {hud.visitedNodes.length}/{ROOM_NODES.length}
            </div>
            <div className="text-[11px] text-[#cfc4b2] mt-0.5">已访空间</div>
          </div>
          <div className="p-3 rounded bg-white/[0.04] border border-[#f5efe6]/10 text-center">
            <div className="text-xl font-bold text-[#f7f1e6] tabular-nums">
              {hud.triggeredInteractions.length}/{INTERACTABLES.length}
            </div>
            <div className="text-[11px] text-[#cfc4b2] mt-0.5">触发交互</div>
          </div>
          <div className="p-3 rounded bg-white/[0.04] border border-[#f5efe6]/10 text-center">
            <div className="text-xl font-bold text-[#ebd08a] tabular-nums">
              {mastery}%
            </div>
            <div className="text-[11px] text-[#cfc4b2] mt-0.5">探索进度</div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 text-sm font-semibold rounded bg-[#b5382a] hover:bg-[#c84334] text-[#faf5ed] transition-colors cursor-pointer"
          >
            继续游览
          </button>
          <button
            type="button"
            onClick={onResetPosition}
            className="w-full py-2.5 text-sm rounded border border-[#f5efe6]/20 text-[#f5efe6] hover:border-[#d9a84e] transition-colors cursor-pointer"
          >
            返回禾坪起点
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2.5 text-sm rounded border border-[#f5efe6]/12 text-[#cfc4b2] hover:text-[#f5efe6] transition-colors cursor-pointer"
          >
            返回标题画面
          </button>
        </div>
      </div>
    </div>
  );
};
