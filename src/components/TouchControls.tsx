import React, { useCallback, useRef, useState } from 'react';
import type { CameraViewMode, InteractableDef } from '../types/game';
import { computeJoystickVector, GTA_CAMERA_PRESETS } from '../engine/gtaCamera';

interface TouchControlsProps {
  cameraView: CameraViewMode;
  nearbyInteractable: InteractableDef | null;
  isSprinting: boolean;
  onMoveChange: (right: number, forward: number, autoSprint: boolean) => void;
  onSprintToggle: (active: boolean) => void;
  onLookBackChange: (active: boolean) => void;
  onCycleCamera: () => void;
  onTriggerInteract: () => void;
}

const JOYSTICK_MAX_RADIUS = 44;

/**
 * GTA-style Mobile & Touch Control Overlay:
 * - Bottom-left: Analog virtual joystick with independent pointerId tracking & rim auto-sprint ring
 * - Bottom-right: Ergonomic thumb-zone action buttons (Interact, Sprint, Camera Cycle, Look-Back)
 * - Uses solid/rgba surfaces (zero backdrop-filter over WebGL) and >=48px touch hitboxes.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  cameraView,
  nearbyInteractable,
  isSprinting,
  onMoveChange,
  onSprintToggle,
  onLookBackChange,
  onCycleCamera,
  onTriggerInteract,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);
  const [rimSprint, setRimSprint] = useState(false);
  const [lookBackHeld, setLookBackHeld] = useState(false);
  const [sprintLocked, setSprintLocked] = useState(false);

  const isAerial = cameraView === 'aerial';
  const preset = GTA_CAMERA_PRESETS[cameraView];

  const updateJoystickFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const dx = clientX - centerRef.current.x;
      const dy = clientY - centerRef.current.y;
      const vec = computeJoystickVector(dx, dy, JOYSTICK_MAX_RADIUS, 0.14);
      setKnobOffset({ x: vec.clampedDx, y: vec.clampedDy });
      setRimSprint(vec.autoSprint);
      onMoveChange(vec.right, vec.forward, vec.autoSprint);
    },
    [onMoveChange]
  );

  const resetJoystick = useCallback(() => {
    activePointerIdRef.current = null;
    setJoyActive(false);
    setRimSprint(false);
    setKnobOffset({ x: 0, y: 0 });
    onMoveChange(0, 0, false);
  }, [onMoveChange]);

  const handleJoyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activePointerIdRef.current !== null) return;
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    activePointerIdRef.current = e.pointerId;
    centerRef.current = {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.5,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic or already-released pointer IDs
    }
    setJoyActive(true);
    updateJoystickFromPoint(e.clientX, e.clientY);
  };

  const handleJoyPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;
    e.stopPropagation();
    updateJoystickFromPoint(e.clientX, e.clientY);
  };

  const handleJoyPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore already-released capture
    }
    resetJoystick();
  };

  const handleToggleSprint = () => {
    const next = !sprintLocked;
    setSprintLocked(next);
    onSprintToggle(next);
  };

  const handleLookBackStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer IDs
    }
    setLookBackHeld(true);
    onLookBackChange(true);
  };

  const handleLookBackEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore already-released capture
    }
    setLookBackHeld(false);
    onLookBackChange(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 pointer-events-none select-none"
      data-testid="mobile-touch-controls"
      style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-end justify-between px-4 pb-10 sm:px-6 sm:pb-12">
        {/* BOTTOM-LEFT: Virtual Analog Movement Joystick */}
        <div className="pointer-events-auto touch-none flex flex-col items-center gap-1.5">
          <div
            ref={padRef}
            data-testid="virtual-joystick"
            role="application"
            aria-label={isAerial ? '航拍方向摇杆' : '移动摇杆'}
            onPointerDown={handleJoyPointerDown}
            onPointerMove={handleJoyPointerMove}
            onPointerUp={handleJoyPointerEnd}
            onPointerCancel={handleJoyPointerEnd}
            className="relative w-[124px] h-[124px] rounded-full flex items-center justify-center touch-none"
            style={{
              backgroundColor: joyActive
                ? 'rgba(22, 35, 56, 0.72)'
                : 'rgba(22, 35, 56, 0.52)',
              border: rimSprint
                ? '2px solid rgba(235, 184, 84, 0.92)'
                : '1.5px solid rgba(235, 184, 84, 0.42)',
              boxShadow: '0 6px 20px rgba(8, 12, 20, 0.36)',
            }}
          >
            {/* Subtle compass tick marks inside joystick ring */}
            <svg
              viewBox="0 0 124 124"
              className="absolute inset-0 w-full h-full pointer-events-none"
              aria-hidden="true"
            >
              <circle
                cx="62"
                cy="62"
                r="44"
                fill="none"
                stroke="rgba(251, 245, 232, 0.16)"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
              <polygon points="62,10 66,17 58,17" fill="rgba(235, 184, 84, 0.55)" />
              <polygon points="62,114 66,107 58,107" fill="rgba(251, 245, 232, 0.32)" />
              <polygon points="10,62 17,58 17,66" fill="rgba(251, 245, 232, 0.32)" />
              <polygon points="114,62 107,58 107,66" fill="rgba(251, 245, 232, 0.32)" />
            </svg>

            {/* Analog Thumb Knob */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center pointer-events-none"
              style={{
                transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
                transition: joyActive ? 'none' : 'transform 140ms cubic-bezier(0.16, 1, 0.3, 1)',
                backgroundColor: rimSprint
                  ? 'rgba(212, 76, 43, 0.94)'
                  : joyActive
                    ? 'rgba(235, 184, 84, 0.92)'
                    : 'rgba(235, 184, 84, 0.68)',
                border: '2px solid rgba(251, 245, 232, 0.85)',
                boxShadow: '0 4px 12px rgba(8, 12, 20, 0.45)',
              }}
            >
              <span className="w-3 h-3 rounded-full bg-[#162338]/70" />
            </div>
          </div>
        </div>

        {/* BOTTOM-RIGHT: Ergonomic GTA Thumb Action Cluster */}
        <div className="pointer-events-auto touch-none flex flex-col items-end gap-2.5">
          {/* Contextual Interact CTA when near a prop */}
          {!isAerial && nearbyInteractable && (
            <button
              type="button"
              tabIndex={-1}
              data-testid="touch-interact-btn"
              aria-label={`交互：${nearbyInteractable.actionLabel}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.currentTarget.blur();
                onTriggerInteract();
              }}
              className="min-h-[48px] px-4 py-2 rounded-full flex items-center gap-2 border border-[#f5c878]/80 text-[#fbf5e8] shadow-lg active:scale-95 transition-transform cursor-pointer"
              style={{ backgroundColor: 'rgba(212, 76, 43, 0.94)' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12m0 0-4-4m4 4 4-4" />
                <path d="M5 19h14" />
              </svg>
              <span className="text-xs font-semibold whitespace-nowrap max-w-[130px] truncate">
                {nearbyInteractable.actionLabel}
              </span>
            </button>
          )}

          {/* Secondary row: Camera Cycle + Look Back */}
          <div className="flex items-center gap-2.5">
            {!isAerial && (
              <button
                type="button"
                tabIndex={-1}
                data-testid="touch-lookback-btn"
                aria-label="按住向后回看"
                onPointerDown={handleLookBackStart}
                onPointerUp={handleLookBackEnd}
                onPointerCancel={handleLookBackEnd}
                className="w-12 h-12 rounded-full flex flex-col items-center justify-center border transition-colors touch-none cursor-pointer"
                style={{
                  backgroundColor: lookBackHeld
                    ? 'rgba(235, 184, 84, 0.92)'
                    : 'rgba(22, 35, 56, 0.8)',
                  borderColor: lookBackHeld
                    ? '#fbf5e8'
                    : 'rgba(235, 184, 84, 0.45)',
                  color: lookBackHeld ? '#162338' : '#fbf5e8',
                }}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 14 4 9l5-5" />
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
                <span className="text-[10px] leading-none mt-0.5 font-medium">回看</span>
              </button>
            )}

            <button
              type="button"
              tabIndex={-1}
              data-testid="touch-camera-btn"
              aria-label={`切换视角，当前${preset.label}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.currentTarget.blur();
                onCycleCamera();
              }}
              className="w-14 h-14 rounded-full flex flex-col items-center justify-center border border-[#ebb854]/60 text-[#fbf5e8] active:scale-95 transition-transform cursor-pointer shadow-lg"
              style={{ backgroundColor: 'rgba(22, 35, 56, 0.86)' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#ebb854]" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 8a2 2 0 0 1 2-2h2.2l1.2-1.6a1.5 1.5 0 0 1 1.2-.6h2.8a1.5 1.5 0 0 1 1.2.6L15.8 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
                <circle cx="12" cy="12.5" r="3" />
              </svg>
              <span className="text-[10px] leading-none mt-0.5 font-medium whitespace-nowrap">
                {preset.shortLabel}
              </span>
            </button>
          </div>

          {/* Primary Sprint toggle/button */}
          {!isAerial && (
            <button
              type="button"
              tabIndex={-1}
              data-testid="touch-sprint-btn"
              aria-label={sprintLocked || isSprinting ? '关闭疾步奔跑' : '开启疾步奔跑'}
              aria-pressed={sprintLocked || isSprinting}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.currentTarget.blur();
                handleToggleSprint();
              }}
              className="w-14 h-14 rounded-full flex flex-col items-center justify-center border active:scale-95 transition-all cursor-pointer shadow-lg"
              style={{
                backgroundColor:
                  sprintLocked || isSprinting
                    ? 'rgba(212, 76, 43, 0.92)'
                    : 'rgba(22, 35, 56, 0.84)',
                borderColor:
                  sprintLocked || isSprinting
                    ? '#f5c878'
                    : 'rgba(235, 184, 84, 0.45)',
                color: '#fbf5e8',
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
                <path d="m7 21 3-6 2 2v4" />
                <path d="m14 14 2-3-3-2-3 2" />
                <path d="m17 11 2 1" />
              </svg>
              <span className="text-[10px] leading-none mt-0.5 font-semibold">
                {sprintLocked || isSprinting ? '疾步中' : '疾步'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
