# Visual & Transition Recipes Cookbook

Use these concrete engineering recipes to achieve limitless custom graphics and seamless scene-to-scene metamorphosis. Mix and match recipes across acts so the presentation stays visually surprising from first beat to last.

## Recipe 1: Dual-FBO GLSL Transitions (Between Heterogeneous Worlds)

When Scene A and Scene B use completely different lighting, geometry, or even renderers (e.g., 2D Canvas texture vs. 3D WebGL world), render Scene A into `rtFrom`, Scene B into `rtTo`, and composite them with a full-screen quad driven by `uProgress` (spring-driven `0..1`) and `uVelocity`:

### 1A. Radial Velocity Warp + Chromatic Burst (Kinetic Dive)

Creates a physical lens-rush sensation that peaks mid-transition and snaps to zero distortion at rest:

```glsl
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform float uProgress;
uniform float uVelocity;
varying vec2 vUv;

void main() {
  float arch = sin(uProgress * 3.14159265);
  vec2 p = vUv - 0.5;
  float dist = length(p);

  float warp = arch * clamp(abs(uVelocity), 0.0, 2.0) * 0.10;
  vec2 uvFrom = vUv - p * (uProgress * 0.28 + warp);
  vec2 uvTo   = vUv + p * ((1.0 - uProgress) * 0.28 - warp);

  // Expanding radial soft wipe from center
  float mask = smoothstep(0.0, 1.0, uProgress * 1.45 - dist * 0.45);

  // Velocity-coupled micro RGB split (strictly 0 at rest)
  float ca = warp * 0.035;
  vec3 cFrom = vec3(
    texture2D(tFrom, uvFrom + vec2(ca, 0.0)).r,
    texture2D(tFrom, uvFrom).g,
    texture2D(tFrom, uvFrom - vec2(ca, 0.0)).b
  );
  vec3 cTo = vec3(
    texture2D(tTo, uvTo + vec2(ca, 0.0)).r,
    texture2D(tTo, uvTo).g,
    texture2D(tTo, uvTo - vec2(ca, 0.0)).b
  );

  gl_FragColor = vec4(mix(cFrom, cTo, mask), 1.0);
}
```

### 1B. Organic Liquid / Ink Displacement (Editorial to Atmospheric)

Uses directional flow noise so one frame bleeds organically into the next like ink on wet paper:

```glsl
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform float uProgress;
uniform float uDirection; // +1 forward, -1 backward
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  float n = noise(vUv * 5.0) * 0.65 + noise(vUv * 12.0) * 0.35;
  float arch = sin(uProgress * 3.14159265);
  vec2 disp = vec2(n - 0.5, (noise(vUv * 6.0 + 4.2) - 0.5)) * arch * 0.14;

  float edge = smoothstep(0.0, 1.0, uProgress * 1.4 - (vUv.x * 0.35 * uDirection + n * 0.35));
  vec4 cFrom = texture2D(tFrom, vUv + disp * uProgress);
  vec4 cTo   = texture2D(tTo,   vUv - disp * (1.0 - uProgress));

  gl_FragColor = mix(cFrom, cTo, edge);
}
```

## Recipe 2: Shared-World 3D Camera Spline (True One-Take Cinema)

When multiple consecutive beats live in the same spatial universe, place each beat at a dedicated 3D "district" along a smooth spline:

- Define two `THREE.CatmullRomCurve3` paths: `camRail` (camera positions) and `lookRail` (focal target positions).
- Map continuous progress `p` directly to normalized curve parameter `u = p / (N - 1)`.
- Evaluate `camRail.getPointAt(u)` and `lookRail.getPointAt(u)` every frame.
- Interpolate scene background color, `FogExp2` color/density, and key light color across districts using `THREE.Color.lerp()` in **Linear RGB space** (avoid muddy mid-gray transitions).
- Let the physical geometry of Beat `i` stay visible in the deep background or periphery of Beat `i+1` to reinforce spatial permanence.

## Recipe 3: 2D-to-3D Dimension Breakout (The Jaw-Dropper)

One of the highest-impact techniques in interactive presentations is starting with an ultra-clean, print-quality 2D editorial slide and physically breaking it into 3D space:

1. **Bake Crisp 2D Canvas Texture**: Create an offscreen `<canvas>` sized at `1920 x 1080` (or `2x` viewport). Draw crisp typography, Swiss grids, or charts using standard Canvas2D APIs.
2. **Mount on a 3D Plane**: Create a `THREE.CanvasTexture` with `colorSpace = THREE.SRGBColorSpace`, `anisotropy = renderer.capabilities.getMaxAnisotropy()`, and `minFilter = THREE.LinearMipmapLinearFilter`. Apply it to a subdivided `PlaneGeometry(16, 9, 32, 18)`.
3. **Break Dimension**: At `alpha = 0`, align camera Z-distance so the plane fills the viewport 1:1 (pixel-exact 2D look):

$$z_{\text{exact}} = \frac{H_{\text{plane}}}{2 \cdot \tan(\text{fov} \cdot \frac{\pi}{360})}$$

As `alpha` rises from `0` to `1`, smoothly rotate the plane in 3D, separate stacked graphic layers along the Z-axis (parallax cards), bend vertices into a wave/ribbon, or launch 3D chart bars straight out of the flat surface toward the camera.

## Recipe 4: GPU Particle Morphing (Text -> Data -> World)

Transform any word, logo, chart, or 3D mesh into any other shape via `THREE.Points` or `THREE.InstancedMesh`:

1. **Sample Target Point Clouds Offline/At Boot**:
   - **From Text/SVG**: Draw the glyph or SVG onto a hidden 2D canvas, scan `getImageData().data`, and collect `(x, y)` coordinates where alpha > 128; shuffle and normalize to `N` points (e.g., `8,000 - 30,000`).
   - **From 3D Geometry**: Sample surface points uniformly from a sphere, torus, terrain grid, or custom mesh.
2. **Store Paired BufferAttributes**: Bind `aPosA` and `aPosB` (plus per-particle random `aSeed`) to the BufferGeometry.
3. **Morph in Vertex Shader with Midpoint Curl Turbulence**:

```glsl
attribute vec3 aPosA;
attribute vec3 aPosB;
attribute float aSeed;
uniform float uProgress;
uniform float uTime;

void main() {
  // Stagger each particle slightly by its seed so the swarm flows like murmuration
  float localT = smoothstep(aSeed * 0.25, 0.75 + aSeed * 0.25, uProgress);
  vec3 pos = mix(aPosA, aPosB, localT);

  // Add swirling dispersion strictly at transition midpoint
  float arch = sin(localT * 3.14159265);
  pos.x += sin(aSeed * 25.0 + uTime * 2.0) * arch * 1.4;
  pos.y += cos(aSeed * 19.0 + uTime * 1.7) * arch * 1.4;
  pos.z += sin(aSeed * 31.0 - uTime * 2.3) * arch * 2.2;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = clamp(24.0 / -mvPos.z, 1.5, 6.0);
  gl_Position = projectionMatrix * mvPos;
}
```

## Recipe 5: Procedural Data & Kinetic Geometry (Zero External 3D Models Needed)

When you cannot load external `.glb` assets, build striking bespoke visuals procedurally:

- **Living Charts**: Extrude bar/area/line charts using `InstancedMesh` or `TubeGeometry` along animated splines. Drive bar heights with staggered springs (`delay = index * 0.03`) so data ripples into existence organically.
- **Architectural Wireframes & Grids**: Combine ultra-thin anti-aliased shader grids (using `fwidth()` screen-space derivatives in GLSL to eliminate moire aliasing) with soft distance fog.
- **Tactile Light & Materials**: Prefer subtle matte ceramic, brushed metal, or translucent glass (`MeshPhysicalMaterial` with low roughness or Fresnel rim shaders) under a restrained 3-point lighting setup rather than garish plastic specular highlights.
- **Pure Canvas2D Mastery**: If a presentation is built purely in HTML5 Canvas2D (no Three.js), you can still achieve breathtaking 3D illusions via custom perspective projection (`scale = focal / (focal + z)`), depth-sorted painters' algorithm, spring-physics bezier ribbons, kinetic glyph outlines, and compositing modes (`lighter`, `multiply`, `destination-out` radial masks).

## Recipe 6: Crisp Typography & Restrained Post-Processing

- **Typography Clarity**: Never use jagged low-res textures or heavy extruded 3D text for readable sentences. Use high-DPI offscreen Canvas2D textures (`2x` resolution) or MSDF font shaders, and keep text planes parallel to the camera at resting states.
- **Color Management**: Set `renderer.toneMapping = THREE.ACESFilmicToneMapping` and `renderer.outputColorSpace = THREE.SRGBColorSpace` for rich, filmic highlights that never clip harshly.
- **Post-Processing Restraint**: Keep Bloom subtle (high luminance threshold `> 0.85`, low strength `0.25 - 0.45`). Never leave heavy chromatic aberration, film grain, or vignette obscuring body copy at rest.
