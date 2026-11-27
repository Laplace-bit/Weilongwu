import React, { useState } from 'react';
import type { HudSnapshot, ZoneId } from '../types/game';
import { ROOM_NODES, ZONE_LABELS } from '../data/weilongData';

interface ZoneMapModalProps {
  hud: HudSnapshot;
  onClose: () => void;
}

/**
 * Pure read-only 1:1 Double-Weilongwu architectural floorplan & live compass orientation guide.
 * Enforces authentic free-walking exploration (zero click-to-teleport!).
 */
export const ZoneMapModal: React.FC<ZoneMapModalProps> = ({ hud, onClose }) => {
  const [selectedZone, setSelectedZone] = useState<ZoneId | 'all'>('all');

  const filteredNodes =
    selectedZone === 'all'
      ? ROOM_NODES
      : ROOM_NODES.filter((n) => n.zoneId === selectedZone);

  // Map 3D world coords x in [-44, 44], z in [-52, 52] -> SVG viewBox 320 x 380
  const toSvgX = (wx: number) => 160 + (wx / 44) * 140;
  const toSvgY = (wz: number) => 195 + (wz / 52) * 165;

  const px = toSvgX(hud.playerX);
  const py = toSvgY(hud.playerZ);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(12, 10, 8, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="双围龙屋建筑平面方位图"
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-lg border border-[#d9a84e]/35 overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#191512' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f5efe6]/10">
          <div>
            <h2 className="font-serif-display text-xl font-bold text-[#f7f1e6] tracking-wider">
              梅州双围龙屋 · 建筑平面与实时方位图
            </h2>
            <p className="text-xs text-[#cfc4b2]/80 mt-0.5 tabular-nums">
              已步行踏足 {hud.visitedNodes.length} / {ROOM_NODES.length} 处空间 · 全屋通道无空气墙，请循迹漫步探索
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs rounded border border-[#f5efe6]/20 text-[#f5efe6] hover:border-[#d9a84e] cursor-pointer"
          >
            关闭
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* Left: Accurate 1:1 Oval Double-Ring SVG Blueprint */}
          <div className="md:col-span-5 p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-[#f5efe6]/10 bg-[#14110e]">
            <svg viewBox="0 0 320 380" className="w-full max-w-[300px] h-auto">
              {/* Rear Fengshui Forest */}
              <ellipse cx="160" cy="40" rx="115" ry="26" fill="rgba(53,92,50,0.3)" stroke="#4f763d" strokeWidth="1" />
              <text x="160" y="34" textAnchor="middle" fill="#9bc28c" fontSize="9.5">
                20 屋后风水林 · 伯公坛
              </text>

              {/* Outer Weilong Ring (外围龙) */}
              <path
                d="M 38 228 A 122 132 0 0 1 282 228 L 266 228 A 106 116 0 0 0 54 228 Z"
                fill="rgba(217,168,78,0.12)"
                stroke="#d9a84e"
                strokeWidth="1.2"
              />
              <text x="160" y="84" textAnchor="middle" fill="#d9a84e" fontSize="9">
                外围龙 · 围龙环巷
              </text>

              {/* Inner Weilong Oval Ring (内围龙 + 弧形圆角前堂) */}
              <path
                d="M 96 264 L 224 264 Q 262 264 254 222 A 94 104 0 0 0 66 222 Q 58 264 96 264 Z"
                fill="rgba(217,168,78,0.14)"
                stroke="#ebd08a"
                strokeWidth="1.5"
              />

              {/* Wide Semicircular Huatai */}
              <path
                d="M 80 182 A 80 62 0 0 1 240 182 Z"
                fill="rgba(184,155,120,0.22)"
                stroke="#b89b78"
                strokeWidth="1"
              />
              <text x="160" y="156" textAnchor="middle" fill="#ebd08a" fontSize="9.5">
                17 化胎 · 五行石
              </text>
              <text x="160" y="114" textAnchor="middle" fill="#f7f1e6" fontSize="9.5" fontWeight="bold">
                19 龙厅
              </text>

              {/* Central Three Halls & Stepped Side Wings */}
              <rect x="98" y="180" width="26" height="72" fill="rgba(245,239,230,0.08)" stroke="#bfb5a3" strokeWidth="1" />
              <rect x="124" y="176" width="72" height="76" fill="rgba(181,56,42,0.16)" stroke="#d9a84e" strokeWidth="1.3" />
              <rect x="196" y="180" width="26" height="72" fill="rgba(245,239,230,0.08)" stroke="#bfb5a3" strokeWidth="1" />
              <text x="160" y="196" textAnchor="middle" fill="#f7f1e6" fontSize="8.5">
                07 上堂
              </text>
              <text x="160" y="218" textAnchor="middle" fill="#f7f1e6" fontSize="8.5">
                05 中堂
              </text>
              <text x="160" y="242" textAnchor="middle" fill="#f7f1e6" fontSize="8.5">
                03 下堂
              </text>

              {/* He-Ping Forecourt */}
              <rect x="52" y="270" width="216" height="42" fill="rgba(190,184,172,0.12)" stroke="#a8987e" strokeWidth="1" />
              <text x="160" y="294" textAnchor="middle" fill="#d8cebe" fontSize="9.5">
                02 禾坪 · 左右斗门
              </text>

              {/* Half-Moon Pond */}
              <path
                d="M 88 318 A 72 38 0 0 0 232 318 Z"
                fill="rgba(45,106,104,0.45)"
                stroke="#6cbcb4"
                strokeWidth="1.4"
              />
              <text x="160" y="338" textAnchor="middle" fill="#a8e0da" fontSize="9.5">
                01 半月塘
              </text>

              {/* Room Discovery Markers (Read-Only) */}
              {ROOM_NODES.map((node) => {
                const nx = toSvgX(node.spawnPos[0]);
                const ny = toSvgY(node.spawnPos[2]);
                const visited = hud.visitedNodes.includes(node.id);
                const active = hud.currentNodeId === node.id;
                return (
                  <circle
                    key={node.id}
                    cx={nx}
                    cy={ny}
                    r={active ? 5 : 3.2}
                    fill={active ? '#e8b954' : visited ? '#6cbcb4' : '#6c655c'}
                    stroke="#14110e"
                    strokeWidth="1.1"
                  />
                );
              })}

              {/* Live Player Position & Heading Marker */}
              <g transform={`translate(${px}, ${py}) rotate(${(-hud.playerYaw * 180) / Math.PI})`}>
                <polygon points="0,-7.5 5,5.5 0,2 -5,5.5" fill="#e6533e" stroke="#faf5ed" strokeWidth="1" />
              </g>
            </svg>
            <div className="flex items-center gap-4 text-[11px] text-[#cfc4b2]/80 mt-2">
              <span>红标：当前方位</span>
              <span>青点：已步行探访</span>
              <span>北上南下</span>
            </div>
          </div>

          {/* Right: 6-Zone Filter + Read-Only Architectural Ledger */}
          <div className="md:col-span-7 flex flex-col min-h-0">
            <div className="flex items-center gap-1 p-3 border-b border-[#f5efe6]/10 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedZone('all')}
                className={`px-2 py-1 text-[11px] rounded cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedZone === 'all'
                    ? 'bg-[#b5382a] text-[#faf5ed] font-semibold'
                    : 'text-[#cfc4b2] hover:bg-white/10'
                }`}
              >
                全部 ({ROOM_NODES.length})
              </button>
              {(Object.keys(ZONE_LABELS) as ZoneId[]).map((zid) => (
                <button
                  key={zid}
                  type="button"
                  onClick={() => setSelectedZone(zid)}
                  className={`px-2 py-1 text-[11px] rounded cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedZone === zid
                      ? 'bg-[#b5382a] text-[#faf5ed] font-semibold'
                      : 'text-[#cfc4b2] hover:bg-white/10'
                  }`}
                >
                  {ZONE_LABELS[zid].split(' · ')[0]}
                </button>
              ))}
            </div>

            <div className="p-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredNodes.map((node) => {
                const visited = hud.visitedNodes.includes(node.id);
                const active = hud.currentNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    className={`text-left p-3 rounded border ${
                      active
                        ? 'border-[#d9a84e] bg-[#d9a84e]/15'
                        : 'border-[#f5efe6]/12 bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-serif-display text-sm font-bold text-[#f7f1e6]">
                        {node.number} · {node.name}
                      </span>
                      <span
                        className={`text-[11px] shrink-0 ${
                          active
                            ? 'text-[#e8b954] font-semibold'
                            : visited
                              ? 'text-[#6cbcb4]'
                              : 'text-[#8c8478]'
                        }`}
                      >
                        {active ? '当前所在' : visited ? '已踏足' : '待探索'}
                      </span>
                    </div>
                    <div className="text-xs text-[#cfc4b2]/85 mt-1">{node.subtitle}</div>
                    <div className="text-[11px] text-[#b0a695] mt-1 line-clamp-2">
                      {node.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
