import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CameraViewMode,
  GameMode,
  HudSnapshot,
  SubtitleState,
  WeatherMode,
} from './types/game';
import { WeilongSceneController } from './engine/WeilongScene';
import { TitleOverlay } from './components/TitleOverlay';
import { GameHud } from './components/GameHud';
import { TouchControls } from './components/TouchControls';
import { ZoneMapModal } from './components/ZoneMapModal';
import { ArtifactInspectorModal } from './components/ArtifactInspectorModal';
import { PauseModal } from './components/PauseModal';
import {
  formatHourClock,
  getChineseShichenLabel,
  getLocalTimeOfDay,
} from './engine/dayNightCycle';

function createInitialHud(): HudSnapshot {
  const initialTime = getLocalTimeOfDay();
  return {
  currentNodeId: 'node_02_heping',
  currentNodeName: '02 · 禾坪与斗门',
  currentZoneName: '外场域 · 山水序幕区',
  currentSurface: 'courtyard',
  playerX: 0,
  playerZ: 31.0,
  playerYaw: 0,
  cameraYaw: 0,
  nearbyInteractable: null,
  visitedNodes: ['node_02_heping'],
  triggeredInteractions: [],
  inspectedArtifacts: [],
  fiveElementsLit: 0,
  holdingUmbrella: false,
  doumenOpen: false,
  gunSlitActive: false,
  weather: 'sunny',
  cameraView: 'third_mid',
  pointerLocked: false,
  isSprinting: false,
    timeOfDay: initialTime,
    timePlaying: true,
    timeSpeed: 1,
    timePeriodLabel: getChineseShichenLabel(initialTime).label,
    formattedTime: formatHourClock(initialTime),
    volume: 0.72,
    minimapBlips: [],
  };
}

const TIME_SPEED_STEPS = [1, 5, 20, 60];
const VALID_CAMERA_VIEWS: readonly CameraViewMode[] = [
  'third_near',
  'third_mid',
  'third_far',
  'first_person',
  'aerial',
];

function detectTouchOrMobileMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return coarse || (hasTouch && window.innerWidth <= 1024) || window.innerWidth < 768;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<WeilongSceneController | null>(null);
  const subtitleTimerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<GameMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'playing' : 'title';
  });
  const [isTouchMode, setIsTouchMode] = useState<boolean>(() => detectTouchOrMobileMode());
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(() => createInitialHud());
  const [subtitle, setSubtitle] = useState<SubtitleState | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [inspectorArtifactId, setInspectorArtifactId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    const updateTouch = () => setIsTouchMode(detectTouchOrMobileMode());
    window.addEventListener('resize', updateTouch);
    window.addEventListener('touchstart', () => setIsTouchMode(true), { once: true, passive: true });
    return () => window.removeEventListener('resize', updateTouch);
  }, []);

  // Keep latest callbacks in refs so Three.js scene mounts strictly once
  const callbacksRef = useRef({
    onHudUpdate: (snapshot: HudSnapshot) => setHud(snapshot),
    onSubtitle: (sub: SubtitleState) => {
      setSubtitle(sub);
      if (subtitleTimerRef.current) window.clearTimeout(subtitleTimerRef.current);
      subtitleTimerRef.current = window.setTimeout(() => {
        setSubtitle(null);
      }, 7500);
    },
    onInspectArtifact: (artifactId: string) => {
      controllerRef.current?.markArtifactInspected(artifactId);
      setInspectorArtifactId(artifactId);
      setInspectorOpen(true);
    },
  });

  // Mount Three.js WebGL scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = new WeilongSceneController(container, {
      onHudUpdate: (s) => callbacksRef.current.onHudUpdate(s),
      onSubtitle: (sub) => callbacksRef.current.onSubtitle(sub),
      onInspectArtifact: (id) => callbacksRef.current.onInspectArtifact(id),
    });
    controllerRef.current = controller;

    // Sync autostart & optional URL inspection query params cleanly without triggering autoplay audio
    const params = new URLSearchParams(window.location.search);
    const paramTime = params.get('time');
    if (paramTime !== null && Number.isFinite(Number(paramTime))) {
      controller.setTimeOfDay(Number(paramTime));
    }
    const paramWeather = params.get('weather');
    if (paramWeather === 'rain' || paramWeather === 'sunny') {
      controller.applyWeather(paramWeather);
    }
    const paramView = params.get('view') as CameraViewMode | null;
    if (paramView && VALID_CAMERA_VIEWS.includes(paramView)) {
      controller.setCameraView(paramView);
    }
    const paramPos = params.get('pos');
    if (paramPos) {
      const parts = paramPos.split(',').map(Number);
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        const yaw = params.get('yaw') !== null ? Number(params.get('yaw')) : 0;
        const pitch = params.get('pitch') !== null ? Number(params.get('pitch')) : -0.16;
        controller.setPlayerPose(
          parts[0],
          parts[1],
          Number.isFinite(yaw) ? yaw : 0,
          Number.isFinite(pitch) ? pitch : -0.16
        );
      }
    }
    if (params.get('autostart') === '1') {
      document.body.dataset.state = 'playing';
      controller.setMode('playing', false);
    } else {
      document.body.dataset.state = 'title';
      controller.setMode('title', false);
    }

    return () => {
      if (subtitleTimerRef.current) window.clearTimeout(subtitleTimerRef.current);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = mode;
    controllerRef.current?.setMode(
      mapOpen || inspectorOpen ? 'paused' : mode,
      false
    );
  }, [mode, mapOpen, inspectorOpen]);

  const handleStart = useCallback(() => {
    document.body.dataset.state = 'playing';
    setMode('playing');
    controllerRef.current?.setMode('playing', true);
  }, []);

  const handleWeatherChange = useCallback((w: WeatherMode) => {
    controllerRef.current?.audio.unlock();
    controllerRef.current?.applyWeather(w);
  }, []);

  const handleToggleMute = useCallback(() => {
    controllerRef.current?.audio.unlock();
    setMuted((prev) => {
      const next = !prev;
      controllerRef.current?.audio.setMuted(next);
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((vol: number) => {
    setMuted(vol <= 0.001);
    controllerRef.current?.setVolume(vol);
  }, []);

  const handleTimeOfDayChange = useCallback((hour: number) => {
    controllerRef.current?.audio.unlock();
    controllerRef.current?.setTimeOfDay(hour);
  }, []);

  const handleToggleTimePlaying = useCallback(() => {
    controllerRef.current?.audio.unlock();
    controllerRef.current?.setTimePlaying(!hud.timePlaying);
  }, [hud.timePlaying]);

  const handleCycleTimeSpeed = useCallback(() => {
    controllerRef.current?.audio.unlock();
    const curIdx = TIME_SPEED_STEPS.indexOf(hud.timeSpeed);
    const nextSpeed = TIME_SPEED_STEPS[(curIdx + 1) % TIME_SPEED_STEPS.length];
    controllerRef.current?.setTimeSpeed(nextSpeed);
  }, [hud.timeSpeed]);

  const handleVirtualMove = useCallback((right: number, forward: number, autoSprint: boolean) => {
    controllerRef.current?.audio.unlock();
    controllerRef.current?.setVirtualMove(right, forward, autoSprint);
  }, []);

  const handleVirtualSprint = useCallback((active: boolean) => {
    controllerRef.current?.audio.unlock();
    controllerRef.current?.setVirtualSprint(active);
  }, []);

  const handleLookBack = useCallback((active: boolean) => {
    controllerRef.current?.setLookBack(active);
  }, []);

  const handleCycleCamera = useCallback(() => {
    controllerRef.current?.audio.unlock();
    controllerRef.current?.toggleCameraView();
  }, []);

  // Global keyboard shortcuts (Title start, Pause, Map, Artifacts, Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (inspectorOpen) {
          setInspectorOpen(false);
        } else if (mapOpen) {
          setMapOpen(false);
        } else if (!controllerRef.current?.isPointerLocked()) {
          setMode((m) => (m === 'playing' ? 'paused' : 'playing'));
        }
        return;
      }

      if (e.code === 'KeyP' && !mapOpen && !inspectorOpen) {
        setMode((m) => (m === 'playing' ? 'paused' : 'playing'));
      } else if (e.code === 'KeyG' && mode === 'playing') {
        setInspectorOpen(false);
        setMapOpen((v) => !v);
      } else if (e.code === 'KeyC' && mode === 'playing') {
        setMapOpen(false);
        setInspectorOpen((v) => !v);
      } else if (e.code === 'KeyM' && mode === 'playing') {
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, mapOpen, inspectorOpen, handleStart, handleToggleMute]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#141210] touch-none">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        data-testid="weilong-canvas-container"
        className="fixed inset-0 w-full h-full touch-none"
      />

      {/* Title Screen */}
      {mode === 'title' && <TitleOverlay onStart={handleStart} />}

      {/* Active Exploration HUD */}
      {mode === 'playing' && !mapOpen && !inspectorOpen && (
        <>
          <GameHud
            hud={hud}
            weather={hud.weather}
            cameraView={hud.cameraView}
            isTouchMode={isTouchMode}
            muted={muted}
            subtitle={subtitle}
            onWeatherChange={handleWeatherChange}
            onToggleCameraView={handleCycleCamera}
            onToggleMute={handleToggleMute}
            onVolumeChange={handleVolumeChange}
            onTimeOfDayChange={handleTimeOfDayChange}
            onToggleTimePlaying={handleToggleTimePlaying}
            onCycleTimeSpeed={handleCycleTimeSpeed}
            onOpenMap={() => setMapOpen(true)}
            onOpenArtifacts={() => {
              setInspectorArtifactId((prev) => prev || 'art_qiaopi');
              setInspectorOpen(true);
              controllerRef.current?.markArtifactInspected(inspectorArtifactId || 'art_qiaopi');
            }}
            onPause={() => setMode('paused')}
            onTriggerInteract={() => controllerRef.current?.triggerNearbyInteraction()}
          />
          {isTouchMode && (
            <TouchControls
              cameraView={hud.cameraView}
              nearbyInteractable={hud.nearbyInteractable}
              isSprinting={hud.isSprinting}
              onMoveChange={handleVirtualMove}
              onSprintToggle={handleVirtualSprint}
              onLookBackChange={handleLookBack}
              onCycleCamera={handleCycleCamera}
              onTriggerInteract={() => controllerRef.current?.triggerNearbyInteraction()}
            />
          )}
        </>
      )}

      {/* Read-Only Architectural Floorplan & Live Orientation Modal */}
      {mode === 'playing' && mapOpen && (
        <ZoneMapModal hud={hud} onClose={() => setMapOpen(false)} />
      )}

      {/* 360-Degree Artifact Inspector Modal */}
      {mode === 'playing' && inspectorOpen && (
        <ArtifactInspectorModal
          initialArtifactId={inspectorArtifactId}
          inspectedIds={hud.inspectedArtifacts}
          onSelectArtifact={(id) => {
            setInspectorArtifactId(id);
            controllerRef.current?.markArtifactInspected(id);
          }}
          onClose={() => setInspectorOpen(false)}
        />
      )}

      {/* Pause Modal */}
      {mode === 'paused' && (
        <PauseModal
          hud={hud}
          onResume={() => {
            controllerRef.current?.audio.unlock();
            setMode('playing');
          }}
          onResetPosition={() => {
            controllerRef.current?.audio.unlock();
            controllerRef.current?.resetToEntrance();
            setMode('playing');
          }}
          onReturnTitle={() => {
            setMapOpen(false);
            setInspectorOpen(false);
            setSubtitle(null);
            controllerRef.current?.resetToEntrance();
            setMode('title');
          }}
        />
      )}
    </main>
  );
}
