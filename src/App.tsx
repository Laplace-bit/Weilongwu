import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameMode, HudSnapshot, SubtitleState, WeatherMode } from './types/game';
import { WeilongSceneController } from './engine/WeilongScene';
import { TitleOverlay } from './components/TitleOverlay';
import { GameHud } from './components/GameHud';
import { ZoneMapModal } from './components/ZoneMapModal';
import { ArtifactInspectorModal } from './components/ArtifactInspectorModal';
import { PauseModal } from './components/PauseModal';

const INITIAL_HUD: HudSnapshot = {
  currentNodeId: 'node_02_heping',
  currentNodeName: '02 · 禾坪与斗门',
  currentZoneName: '外场域 · 山水序幕区',
  currentSurface: 'courtyard',
  playerX: 0,
  playerZ: 31.0,
  playerYaw: 0,
  nearbyInteractable: null,
  visitedNodes: ['node_02_heping'],
  triggeredInteractions: [],
  inspectedArtifacts: [],
  fiveElementsLit: 0,
  holdingUmbrella: false,
  doumenOpen: false,
  gunSlitActive: false,
  weather: 'sunny',
  cameraView: 'walk',
  timeOfDay: 10.5,
  timePlaying: true,
  timeSpeed: 1,
  timePeriodLabel: '辰巳 · 晨光',
  formattedTime: '10:30',
  volume: 0.72,
};

const TIME_SPEED_STEPS = [1, 5, 20, 60];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<WeilongSceneController | null>(null);
  const subtitleTimerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<GameMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'playing' : 'title';
  });
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [subtitle, setSubtitle] = useState<SubtitleState | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [inspectorArtifactId, setInspectorArtifactId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

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
    if (params.get('view') === 'aerial') {
      controller.setCameraView('aerial');
    }
    const paramPos = params.get('pos');
    if (paramPos) {
      const parts = paramPos.split(',').map(Number);
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        const yaw = params.get('yaw') !== null ? Number(params.get('yaw')) : 0;
        const pitch = params.get('pitch') !== null ? Number(params.get('pitch')) : -0.02;
        controller.setPlayerPose(
          parts[0],
          parts[1],
          Number.isFinite(yaw) ? yaw : 0,
          Number.isFinite(pitch) ? pitch : -0.02
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
        } else {
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
    <main className="relative w-screen h-screen overflow-hidden bg-[#141210]">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        data-testid="weilong-canvas-container"
        className="fixed inset-0 w-full h-full"
      />

      {/* Title Screen */}
      {mode === 'title' && <TitleOverlay onStart={handleStart} />}

      {/* Active Exploration HUD */}
      {mode === 'playing' && !mapOpen && !inspectorOpen && (
        <GameHud
          hud={hud}
          weather={hud.weather}
          cameraView={hud.cameraView}
          muted={muted}
          subtitle={subtitle}
          onWeatherChange={handleWeatherChange}
          onToggleCameraView={() => {
            controllerRef.current?.audio.unlock();
            controllerRef.current?.toggleCameraView();
          }}
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
