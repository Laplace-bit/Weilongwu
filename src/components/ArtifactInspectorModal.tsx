import React, { useState } from 'react';
import { ARTIFACTS } from '../data/weilongData';
import type { ArtifactDef } from '../types/game';

interface ArtifactInspectorModalProps {
  initialArtifactId: string | null;
  inspectedIds: string[];
  onSelectArtifact: (id: string) => void;
  onClose: () => void;
}

/**
 * Interactive 360-degree Artifact Inspector for 6 signature Hakka cultural treasures.
 * Supports smooth pointer drag rotation & zoom without spawning extra WebGL contexts.
 */
export const ArtifactInspectorModal: React.FC<ArtifactInspectorModalProps> = ({
  initialArtifactId,
  inspectedIds,
  onSelectArtifact,
  onClose,
}) => {
  const [activeId, setActiveId] = useState<string>(
    initialArtifactId || ARTIFACTS[0].id
  );
  const [rotY, setRotY] = useState(18);
  const [rotX, setRotX] = useState(-10);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [lastPt, setLastPt] = useState({ x: 0, y: 0 });

  const artifact: ArtifactDef =
    ARTIFACTS.find((a) => a.id === activeId) || ARTIFACTS[0];

  const handleChoose = (id: string) => {
    setActiveId(id);
    setRotY(18);
    setRotX(-10);
    setZoom(1);
    onSelectArtifact(id);
  };

  const renderArtifactSvg = (modelType: ArtifactDef['modelType']) => {
    switch (modelType) {
      case 'qiaopi':
        return (
          <svg viewBox="0 0 240 200" className="w-56 h-48 drop-shadow-2xl">
            <rect x="26" y="24" width="188" height="152" rx="4" fill="#ead8b1" stroke="#8f6c3c" strokeWidth="3" />
            <rect x="100" y="24" width="40" height="152" fill="#b5382a" opacity="0.88" />
            <text x="120" y="64" textAnchor="middle" fill="#f7e4b2" fontSize="16" fontFamily="serif">
              顺
            </text>
            <text x="120" y="92" textAnchor="middle" fill="#f7e4b2" fontSize="16" fontFamily="serif">
              风
            </text>
            <text x="120" y="120" textAnchor="middle" fill="#f7e4b2" fontSize="16" fontFamily="serif">
              大
            </text>
            <text x="120" y="148" textAnchor="middle" fill="#f7e4b2" fontSize="16" fontFamily="serif">
              吉
            </text>
            <circle cx="64" cy="140" r="18" fill="none" stroke="#b5382a" strokeWidth="2.2" />
            <text x="64" y="144" textAnchor="middle" fill="#b5382a" fontSize="9">
              梅州批局
            </text>
            <line x1="162" y1="45" x2="162" y2="155" stroke="#4a3b2c" strokeWidth="1.5" strokeDasharray="3 4" />
            <line x1="180" y1="45" x2="180" y2="155" stroke="#4a3b2c" strokeWidth="1.5" strokeDasharray="3 4" />
          </svg>
        );
      case 'hat':
        return (
          <svg viewBox="0 0 240 200" className="w-56 h-48 drop-shadow-2xl">
            <ellipse cx="120" cy="86" rx="88" ry="26" fill="#d9b36c" stroke="#7c5b28" strokeWidth="3" />
            <ellipse cx="120" cy="82" rx="42" ry="14" fill="#c79e54" stroke="#7c5b28" strokeWidth="2" />
            <path d="M 36 92 Q 120 120 204 92 L 200 144 Q 120 166 40 144 Z" fill="#1f2e47" stroke="#111929" strokeWidth="2" />
            <path d="M 164 114 L 182 174 M 156 116 L 166 176" stroke="#d95032" strokeWidth="4" strokeLinecap="round" />
            <path d="M 172 112 L 194 168" stroke="#52b788" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        );
      case 'abacus':
        return (
          <svg viewBox="0 0 240 200" className="w-56 h-48 drop-shadow-2xl">
            <rect x="20" y="42" width="200" height="116" rx="6" fill="#5e291d" stroke="#2e130c" strokeWidth="5" />
            <rect x="30" y="52" width="180" height="96" fill="#1e1510" />
            <line x1="30" y1="84" x2="210" y2="84" stroke="#9e5a38" strokeWidth="6" />
            {[46, 68, 90, 112, 134, 156, 178, 196].map((x, idx) => (
              <g key={x}>
                <line x1={x} y1="52" x2={x} y2="148" stroke="#c8a878" strokeWidth="2" />
                <ellipse cx={x} cy={idx % 2 === 0 ? 64 : 74} rx="8" ry="5" fill="#d9a84e" />
                <ellipse cx={x} cy={104 + (idx % 3) * 8} rx="8" ry="5" fill="#d9a84e" />
                <ellipse cx={x} cy={134} rx="8" ry="5" fill="#b88432" />
              </g>
            ))}
          </svg>
        );
      case 'genealogy':
        return (
          <svg viewBox="0 0 240 200" className="w-56 h-48 drop-shadow-2xl">
            <rect x="44" y="20" width="152" height="162" rx="3" fill="#233b5c" stroke="#142338" strokeWidth="3" />
            <rect x="64" y="34" width="38" height="92" fill="#f2e8d2" stroke="#b09e7e" strokeWidth="1.5" />
            <text x="83" y="64" textAnchor="middle" fill="#1c1814" fontSize="18" fontFamily="serif">
              隴
            </text>
            <text x="83" y="88" textAnchor="middle" fill="#1c1814" fontSize="18" fontFamily="serif">
              西
            </text>
            <text x="83" y="112" textAnchor="middle" fill="#1c1814" fontSize="18" fontFamily="serif">
              族
            </text>
            {[40, 75, 115, 155].map((y) => (
              <line key={y} x1="176" y1={y} x2="196" y2={y} stroke="#f2e8d2" strokeWidth="2.5" />
            ))}
            <line x1="176" y1="20" x2="176" y2="182" stroke="#f2e8d2" strokeWidth="1.5" />
          </svg>
        );
      case 'umbrella':
        return (
          <svg viewBox="0 0 240 200" className="w-56 h-48 drop-shadow-2xl">
            <line x1="120" y1="36" x2="120" y2="184" stroke="#7d5630" strokeWidth="5" strokeLinecap="round" />
            <path d="M 28 112 Q 120 26 212 112 Z" fill="#c9422c" stroke="#782014" strokeWidth="3" />
            <path d="M 60 112 Q 120 44 180 112" fill="none" stroke="#f2c97d" strokeWidth="1.5" />
            <path d="M 92 112 Q 120 52 148 112" fill="none" stroke="#f2c97d" strokeWidth="1.5" />
            <circle cx="120" cy="40" r="6" fill="#d9a84e" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 240 200" className="w-56 h-48 drop-shadow-2xl">
            <circle cx="120" cy="96" r="66" fill="#9a7b45" stroke="#594322" strokeWidth="6" />
            <circle cx="120" cy="96" r="52" fill="#d6c092" stroke="#785c2d" strokeWidth="2" />
            <circle cx="120" cy="96" r="36" fill="none" stroke="#806232" strokeWidth="2" strokeDasharray="6 4" />
            <circle cx="120" cy="96" r="12" fill="#b89452" stroke="#594322" strokeWidth="2" />
            <rect x="86" y="162" width="68" height="16" rx="3" fill="#5e291d" />
          </svg>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 10, 8, 0.82)' }}
      role="dialog"
      aria-modal="true"
      aria-label="360度客家器物检视台"
    >
      <div
        className="w-full max-w-3xl rounded-lg border border-[#d9a84e]/40 overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#191512' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f5efe6]/10">
          <div>
            <h2 className="font-serif-display text-xl font-bold text-[#f7f1e6] tracking-wider">
              360° 民俗器物检视台
            </h2>
            <p className="text-xs text-[#cfc4b2]/80 mt-0.5 tabular-nums">
              已鉴赏 {inspectedIds.length} / {ARTIFACTS.length} 件馆藏民俗器物 · 拖拽舞台可自由旋转细节
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs rounded border border-[#f5efe6]/20 text-[#f5efe6] hover:border-[#d9a84e] cursor-pointer"
          >
            返回游览
          </button>
        </div>

        {/* Selector Tabs */}
        <div className="flex flex-wrap gap-1.5 px-6 py-3 border-b border-[#f5efe6]/10 bg-[#14110e]">
          {ARTIFACTS.map((item) => {
            const isSelected = item.id === artifact.id;
            const seen = inspectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleChoose(item.id)}
                className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#b5382a] text-[#faf5ed] font-semibold'
                    : seen
                    ? 'bg-white/10 text-[#ebd08a]'
                    : 'text-[#cfc4b2] hover:bg-white/10'
                }`}
              >
                {item.name.split('（')[0]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left: Interactive 360 Drag-Rotate Stage */}
          <div
            className="md:col-span-6 p-6 flex flex-col items-center justify-center bg-[#120f0d] cursor-grab active:cursor-grabbing relative min-h-[260px]"
            onPointerDown={(e) => {
              setDragging(true);
              setLastPt({ x: e.clientX, y: e.clientY });
            }}
            onPointerMove={(e) => {
              if (!dragging) return;
              const dx = e.clientX - lastPt.x;
              const dy = e.clientY - lastPt.y;
              setLastPt({ x: e.clientX, y: e.clientY });
              setRotY((r) => r + dx * 0.8);
              setRotX((r) => Math.max(-45, Math.min(45, r - dy * 0.6)));
            }}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
          >
            <div
              style={{
                perspective: '720px',
              }}
            >
              <div
                style={{
                  transform: `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                  transition: dragging ? 'none' : 'transform 120ms ease-out',
                }}
              >
                {renderArtifactSvg(artifact.modelType)}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4 text-xs text-[#cfc4b2]/80">
              <span>缩放</span>
              <input
                type="range"
                aria-label="缩放器物"
                min={0.8}
                max={1.45}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-28 accent-[#d9a84e]"
              />
              <button
                type="button"
                onClick={() => {
                  setRotY(18);
                  setRotX(-10);
                  setZoom(1);
                }}
                className="text-[#ebd08a] hover:underline cursor-pointer"
              >
                归位
              </button>
            </div>
          </div>

          {/* Right: Folklore & Craftsmanship Notes */}
          <div className="md:col-span-6 p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="text-xs text-[#d9a84e] tracking-wide">
                {artifact.era} · {artifact.originNode}
              </div>
              <h3 className="font-serif-display text-2xl font-bold text-[#f7f1e6] mt-1">
                {artifact.name}
              </h3>
              <p className="font-serif-display text-sm text-[#ebd08a] mt-3">
                {artifact.hakkaPhrase}
              </p>
              <p className="text-sm text-[#e5dccd] leading-relaxed mt-3">
                {artifact.summary}
              </p>
              <div className="mt-4 pt-4 border-t border-[#f5efe6]/10">
                <div className="text-xs text-[#b5aa99] mb-1">工艺与材质细节</div>
                <p className="text-xs text-[#d8cebe] leading-relaxed">
                  {artifact.craftDetails}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
