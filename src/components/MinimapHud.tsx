import React, { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../types/game';

interface MinimapHudProps {
  hud: HudSnapshot;
  isTouchMode: boolean;
  onOpenFullMap: () => void;
}

const BLIP_COLORS: Record<string, string> = {
  villager: '#d8edd2',
  dog: '#f6a844',
  cat: '#f2957e',
  poultry: '#f6df6e',
  livestock: '#8ac4ea',
};

/**
 * GTA-style real-time architectural radar minimap showing:
 * - Accurate Hakka Double-Weilongwu floorplan (Half-Moon Pond, He-Ping, Three Halls, Wings, Double Rings)
 * - Live player position, real-time heading arrow & camera FOV cone
 * - Live roaming villagers & animals (with gold highlight ring during social/play interactions)
 * - Rotating Radar (GTA default) / North-Up toggle + Zoom toggle
 */
export const MinimapHud: React.FC<MinimapHudProps> = ({
  hud,
  isTouchMode,
  onOpenFullMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rotateWithCamera, setRotateWithCamera] = useState(true);
  const [zoomWide, setZoomWide] = useState(false);

  const sizePx = isTouchMode ? 104 : 156;
  const viewHalfMeters = zoomWide ? 48 : 28;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelSize = Math.round(sizePx * dpr);
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const cx = sizePx * 0.5;
    const cy = sizePx * 0.5;
    const scale = (sizePx * 0.5) / viewHalfMeters;

    // 1. Dark architectural radar background
    ctx.fillStyle = '#121d2d';
    ctx.fillRect(0, 0, sizePx, sizePx);

    // Subtle concentric range rings
    ctx.strokeStyle = 'rgba(217, 168, 78, 0.10)';
    ctx.lineWidth = 1;
    for (const rFrac of [0.35, 0.7]) {
      ctx.beginPath();
      ctx.arc(cx, cy, sizePx * 0.5 * rFrac, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Transform world coordinates (x right, z south/down) into minimap radar space
    //    Camera yaw = 0 looks North (-Z). Rotating canvas by +cameraYaw puts look direction straight UP (-Y)!
    const mapRot = rotateWithCamera ? hud.cameraYaw : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mapRot);
    ctx.scale(scale, scale);
    ctx.translate(-hud.playerX, -hud.playerZ);

    // Meadow & valley grass tone outside compound
    ctx.fillStyle = 'rgba(42, 70, 56, 0.34)';
    ctx.fillRect(-62, -62, 124, 128);

    // Half-Moon Pond (半月塘): straight north shore at z = 38, semicircle curving south to z = 49.5
    ctx.fillStyle = 'rgba(46, 124, 146, 0.72)';
    ctx.strokeStyle = 'rgba(148, 212, 224, 0.55)';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.arc(0, 38.0, 14.2, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // He-Ping Forecourt (禾坪) paved courtyard
    ctx.fillStyle = 'rgba(186, 168, 134, 0.24)';
    ctx.fillRect(-19.5, 22.0, 39.0, 15.6);

    // Outer Weilong Horseshoe Ring (外围龙)
    ctx.strokeStyle = 'rgba(212, 198, 174, 0.48)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, -7.2, 27.6, Math.PI, Math.PI * 2, false);
    ctx.stroke();

    // Inner Weilong Horseshoe Ring (内围龙)
    ctx.strokeStyle = 'rgba(226, 212, 188, 0.58)';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.arc(0, -7.2, 20.6, Math.PI, Math.PI * 2, false);
    ctx.stroke();

    // Huatai Cobble Semicircle (化胎)
    ctx.fillStyle = 'rgba(202, 182, 148, 0.22)';
    ctx.beginPath();
    ctx.arc(0, -7.2, 17.8, Math.PI, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();

    // Central Hall Core + East/West Transverse Wings (三堂两横)
    ctx.fillStyle = 'rgba(226, 214, 192, 0.34)';
    ctx.strokeStyle = 'rgba(235, 196, 118, 0.45)';
    ctx.lineWidth = 0.4;
    // Lower Hall, Middle Hall, Upper Hall
    ctx.fillRect(-10.8, 16.5, 21.6, 5.2);
    ctx.fillRect(-10.8, 5.6, 21.6, 4.8);
    ctx.fillRect(-10.8, -5.8, 21.6, 5.4);
    // West & East Transverse Wings
    ctx.fillRect(-18.6, -6.2, 6.8, 28.0);
    ctx.fillRect(11.8, -6.2, 6.8, 28.0);
    // Skywell cutouts (天窗/天井)
    ctx.fillStyle = 'rgba(24, 38, 58, 0.62)';
    ctx.fillRect(-6.8, 10.6, 13.6, 5.7);
    ctx.fillRect(-6.8, -0.2, 13.6, 5.6);

    // Main Entrance Doumen Gate marker
    ctx.fillStyle = hud.doumenOpen ? '#7ad99c' : '#d86446';
    ctx.fillRect(-2.0, 21.3, 4.0, 0.8);

    // 3. Live Roaming Villager & Animal Blips
    const blips = hud.minimapBlips || [];
    const blipR = zoomWide ? 1.05 : 0.72;
    for (let i = 0; i < blips.length; i++) {
      const b = blips[i];
      const color = BLIP_COLORS[b.kind] || '#d8edd2';

      if (b.playing) {
        ctx.strokeStyle = 'rgba(245, 200, 92, 0.85)';
        ctx.lineWidth = zoomWide ? 0.5 : 0.36;
        ctx.beginPath();
        ctx.arc(b.x, b.z, blipR * 2.15, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(b.x, b.z, b.kind === 'poultry' ? blipR * 0.72 : blipR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 4. Live Player Camera FOV Cone & Crisp Directional Arrow (centered in GTA radar!)
    const camRelAngle = rotateWithCamera ? 0 : -hud.cameraYaw;
    const playerRelAngle = rotateWithCamera ? hud.cameraYaw - hud.playerYaw : -hud.playerYaw;

    // Camera FOV cone
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(camRelAngle);
    const fovGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, sizePx * 0.34);
    fovGrad.addColorStop(0, 'rgba(235, 184, 84, 0.38)');
    fovGrad.addColorStop(1, 'rgba(235, 184, 84, 0.0)');
    ctx.fillStyle = fovGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, sizePx * 0.34, -Math.PI * 0.5 - 0.46, -Math.PI * 0.5 + 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Player chevron arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerRelAngle);
    ctx.fillStyle = '#f8d26a';
    ctx.strokeStyle = '#141d2a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -7.2);
    ctx.lineTo(5.2, 5.4);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-5.2, 5.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 5. Rotating Cardinal North Indicator ("N") pinned along the radar perimeter
    const northAngle = -Math.PI * 0.5 + mapRot;
    const nRad = sizePx * 0.5 - 11;
    const nx = cx + Math.cos(northAngle) * nRad;
    const ny = cy + Math.sin(northAngle) * nRad;
    ctx.fillStyle = 'rgba(20, 30, 46, 0.92)';
    ctx.beginPath();
    ctx.arc(nx, ny, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(235, 184, 84, 0.65)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f2c86b';
    ctx.font = 'bold 9px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5);

    ctx.restore();
  }, [
    hud.playerX,
    hud.playerZ,
    hud.playerYaw,
    hud.cameraYaw,
    hud.doumenOpen,
    hud.minimapBlips,
    rotateWithCamera,
    zoomWide,
    sizePx,
    viewHalfMeters,
  ]);

  return (
    <div
      data-testid="gta-minimap"
      className={`fixed pointer-events-auto z-20 ${
        isTouchMode ? 'top-[78px] left-3' : 'bottom-4 left-4'
      }`}
      style={{
        paddingTop: isTouchMode ? 'env(safe-area-inset-top)' : undefined,
        paddingBottom: !isTouchMode ? 'env(safe-area-inset-bottom)' : undefined,
      }}
    >
      <div
        className="relative rounded-md border border-[#d9a84e]/45 shadow-xl overflow-hidden"
        style={{
          width: `${sizePx}px`,
          backgroundColor: 'rgba(18, 29, 45, 0.92)',
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="点击查看完整围龙屋建筑平面图"
          title="点击打开完整方位图 (G)"
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenFullMap();
          }}
          className="block cursor-pointer focus:outline-none"
          style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: `${sizePx}px`, height: `${sizePx}px`, display: 'block' }}
          />
        </button>

        {/* Bottom coordinate / control strip */}
        <div
          className="flex items-center justify-between px-1.5 py-1 border-t border-[#d9a84e]/25 text-[10px] text-[#e7dcc5]"
          style={{ backgroundColor: 'rgba(15, 24, 38, 0.94)' }}
        >
          <span className="font-mono tabular-nums truncate">
            {Math.round(hud.playerX)}, {Math.round(hud.playerZ)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              tabIndex={-1}
              title={rotateWithCamera ? '当前：GTA 跟随旋转（点击切上北下南）' : '当前：上北下南（点击切 GTA 旋转）'}
              onClick={(e) => {
                e.currentTarget.blur();
                setRotateWithCamera((v) => !v);
              }}
              className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#f2c86b] cursor-pointer leading-none"
            >
              {rotateWithCamera ? '旋' : '北'}
            </button>
            <button
              type="button"
              tabIndex={-1}
              title={zoomWide ? '放大雷达视野' : '缩小以俯瞰全景'}
              onClick={(e) => {
                e.currentTarget.blur();
                setZoomWide((v) => !v);
              }}
              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#f5efe6] cursor-pointer leading-none"
            >
              {zoomWide ? '+' : '−'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
