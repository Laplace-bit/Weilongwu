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
  xrayActive: false,
  taijiActive: false,
  doumenOpen: false,
  gunSlitActive: false,
  weather: 'sunny',
  cameraView: 'walk',
};

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

    // Sync autostart & optional aerial view mode immediately
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'aerial') {
      controller.setCameraView('aerial');
    }
    if (params.get('autostart') === '1') {
      document.body.dataset.state = 'playing';
      controller.setMode('playing');
    } else {
      document.body.dataset.state = 'title';
      controller.setMode('title');
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
      mapOpen || inspectorOpen ? 'paused' : mode
    );
  }, [mode, mapOpen, inspectorOpen]);

  const handleStart = useCallback(() => {
    document.body.dataset.state = 'playing';
    setMode('playing');
    controllerRef.current?.setMode('playing');
  }, []);

  const handleWeatherChange = useCallback((w: WeatherMode) => {
    controllerRef.current?.applyWeather(w);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      controllerRef.current?.audio.setMuted(next);
      return next;
    });
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
          onToggleCameraView={() => controllerRef.current?.toggleCameraView()}
          onToggleMute={handleToggleMute}
          onOpenMap={() => setMapOpen(true)}
          onOpenArtifacts={() => {
            setInspectorArtifactId((prev) => prev || 'art_qiaopi');
            setInspectorOpen(true);
            controllerRef.current?.markArtifactInspected(inspectorArtifactId || 'art_qiaopi');
          }}
          onPause={() => setMode('paused')}
          onTriggerInteract={() => controllerRef.current?.triggerNearbyInteraction()}
          onToggleXray={() => controllerRef.current?.toggleXray()}
          onToggleTaiji={() => controllerRef.current?.toggleTaijiOverlay()}
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
          onResume={() => setMode('playing')}
          onResetPosition={() => {
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
