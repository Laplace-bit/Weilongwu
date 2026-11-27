# Motion Physics & Single-Canvas Engine Blueprint

Silky smoothness is mathematical continuity. Visual jank comes from two places: derivative discontinuities in animation curves (sudden starts/stops on interruption) and runtime frame drops (DOM reflow, shader compilation, GC spikes). Use this architecture as the default backbone.

## 1. Single-Canvas Stage & Inert Chrome Layout

Keep the entire presentation inside one full-viewport canvas with minimal on-demand UI chrome:

```html
<canvas id="stage" tabindex="0" aria-label="Interactive Presentation"></canvas>
<div id="ui" aria-live="polite"></div>
```

Core CSS discipline:

- `#stage { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }`
- `#ui { position: fixed; inset: 0; pointer-events: none; }` and `#ui > * { pointer-events: auto; }`
- Add `body.idle { cursor: none; }` triggered after 2.5 seconds without pointer movement.
- Keep speaker notes (`.notes`), overview grid (`.over`), and help overlay (`.help`) unmounted or hidden until summoned by keyboard shortcut.

## 2. Continuous Timeline + Interruptible Second-Order Spring

Never drive transitions with fixed-duration `setTimeout` or non-interruptible tweens. Drive a continuous floating-point `progress` from `0` to `sceneCount - 1` using a second-order damped harmonic oscillator:

$$a(t) = -k(x(t) - x_{\text{target}}) - c \cdot v(t)$$

When damping ratio $\zeta = \frac{c}{2\sqrt{k}} = 1$, the motion is **critically damped** (fastest possible arrival with zero wobble). If the user taps Next or Prev halfway through a transition, `target` changes while `velocity` is preserved, guaranteeing $C^2$ smooth trajectories every time.

```javascript
export class Spring {
  constructor(initial = 0, stiffness = 110, damping = 21) {
    this.value = initial;
    this.target = initial;
    this.velocity = 0;
    this.stiffness = stiffness; // k
    this.damping = damping;     // c = 2 * sqrt(k) for critical damping
  }

  snap(v) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  step(dt) {
    // Sub-step integration guarantees numerical stability on any refresh rate
    const clamped = Math.min(dt, 0.05);
    const steps = 4;
    const h = clamped / steps;
    for (let i = 0; i < steps; i++) {
      const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  get settled() {
    return Math.abs(this.target - this.value) < 0.0005 && Math.abs(this.velocity) < 0.0005;
  }
}

// Framerate-independent exponential smoothing (60Hz and 144Hz behave identically)
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.min(dt, 0.05)));
}

// Smooth symmetric arch: 0 at start, 1 at midpoint, 0 at end
export function transitionArch(t) {
  return Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
}
```

## 3. Virtual Mass Layering (错峰惯性)

When every element shares the same easing curve, the brain perceives a flat sticker sliding across glass. Assign distinct physical weight classes to visual layers:

| Visual Layer | Stiffness (`k`) | Damping (`c`) | Damping Ratio ($\zeta$) | Perceived Feel |
| :--- | :--- | :--- | :--- | :--- |
| **Foreground Typography / HUD** | `180 - 220` | `26 - 30` | `~1.0` (Crisp) | Lightweight, snaps cleanly into reading position. |
| **Hero 3D Object / Chart** | `100 - 130` | `17 - 20` | `~0.85` (Micro-bounce) | Alive, tactile, subtle physical follow-through. |
| **Main Camera Rig / Timeline** | `75 - 100` | `18 - 20` | `~1.0` (Critically damped) | Smooth cinematic dolly, never causes motion sickness. |
| **Background World / Fog / Light** | `35 - 55` | `14 - 16` | `~1.1` (Overdamped) | Heavy atmospheric lag, creates genuine spatial depth. |

## 4. Dynamic FOV & Velocity-Coupled Camera Rig

In 3D scenes, couple the perspective camera's Field of View and micro-roll to instantaneous transition speed so fast moves feel exhilarating and slow settles feel calm:

```javascript
function updateCameraDynamics(camera, baseFov, speed, pointerX, pointerY, dt, reducedMotion) {
  const speedFactor = reducedMotion ? 0 : Math.min(Math.abs(speed), 3.0);
  const targetFov = baseFov + speedFactor * 6.5; // Widen FOV gently during high-speed travel
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = damp(camera.fov, targetFov, 8, dt);
    camera.updateProjectionMatrix();
  }
  // Subtle resting parallax breath (pointerX/Y normalized in [-1, 1])
  const parallaxScale = reducedMotion ? 0 : 0.18;
  camera.position.x = damp(camera.position.x, camera.userData.baseX + pointerX * parallaxScale, 4, dt);
  camera.position.y = damp(camera.position.y, camera.userData.baseY - pointerY * parallaxScale, 4, dt);
}
```

## 5. Scene Lifecycle & Director Contract

Structure every beat as a self-contained module implementing one clean interface so you can compose arbitrarily complex 2D, 3D, or shader scenes seamlessly:

```javascript
/**
 * SceneModule Contract
 * @property {string} id - URL hash slug (e.g. "opening", "scale-break", "finale")
 * @property {string} title - Title shown in overview grid
 * @property {string} notes - Presenter notes shown when pressing N
 * @property {function} init(shared) - Allocate all geometries, textures, and shaders ONCE
 * @property {function} update(state) - Receive { localT, weight, velocity, time, dt, pointer, reducedMotion }
 * @property {function} render(renderer, targetFBO) - Draw only when weight > 0.001
 * @property {function} resize(width, height, dpr) - Reflow aspect ratios cleanly
 */
```

### Continuous Progress Mapping

Given continuous timeline progress `p` in `[0, scenes.length - 1]`:

- `fromIndex = Math.floor(p)`
- `toIndex = Math.min(fromIndex + 1, scenes.length - 1)`
- `alpha = p - fromIndex` (ranges `0.0 -> 1.0`)
- Active scenes:
  - When `alpha < 0.001`: render **only** `scenes[fromIndex]` directly to screen (bypass FBO overhead).
  - When `alpha > 0.999`: render **only** `scenes[toIndex]` directly to screen.
  - Otherwise: update both `scenes[fromIndex]` (with exit weight `1 - alpha`) and `scenes[toIndex]` (with enter weight `alpha`), and run the declared bridge transition between them.

## 6. Unified Input & Hash Synchronization

Normalize all navigation inputs into a single `goTo(index)` method:

- **Keyboard**: `ArrowRight` / `ArrowDown` / `PageDown` / `Space` -> `next()`; `ArrowLeft` / `ArrowUp` / `PageUp` -> `prev()`; `Home` -> `0`; `End` -> `N - 1`; `N` -> toggle notes; `G` or `O` -> toggle overview; `H` or `?` -> toggle help; `Escape` -> close overlays.
- **Wheel**: Accumulate `deltaY` and apply a `320ms` gesture cooldown (or trackpad momentum threshold) so a single two-finger flick advances exactly one beat instead of skipping four.
- **Touch**: Track pointer start/end delta; horizontal swipe `> 40px` changes beat.
- **URL Hash**: Update via `history.replaceState(null, "", "#" + scenes[targetIndex].id)` and listen to `hashchange` for deep-linking.

## 7. Zero-Jank Performance Guardrails

- **Asset & Font Pre-Warming**: Run `await document.fonts.ready` plus all image/texture loads behind a clean progress bar before revealing Beat 0. Call `renderer.compile(scene, camera)` for every 3D scene during boot so the first transition never stalls on GPU shader compilation.
- **DPR Cap**: Always cap `const dpr = Math.min(window.devicePixelRatio || 1, 2)`. Higher DPR wastes GPU fill rate with imperceptible gain.
- **Zero Per-Frame Allocations**: Pre-allocate reusable `Vector3`, `Matrix4`, `Color`, and typed arrays outside `requestAnimationFrame`. Never instantiate geometries, materials, or textures during transitions.
- **Half-Resolution Post-Processing**: If using Bloom or radial blur RenderTargets, size them at `0.5x` viewport width/height (75% fewer fragment invocations).
- **Tab Visibility Pause**: On `document.visibilitychange`, pause clock accumulation when hidden so returning to the tab never causes a physics explosion.
