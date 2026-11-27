---
name: cinematic-slide-craft
description: Design and engineer breathtaking, cinema-grade interactive presentations, keynote decks, and visual storytelling web experiences in single-canvas HTML/WebGL/Three.js/Canvas2D. Use whenever the user asks to create an extraordinary presentation, interactive slide deck, 3D or WebGL keynote, creative pitch deck, animated showcase, or asks for silky-smooth transitions, generative graphics, match-cut choreography, and unforgettable slide craftsmanship (制作惊艳PPT、交互式演示文稿、3D幻灯片、电影级转场动画、创意演示网页).
---

# Cinematic Slide Craft

Transform any topic, pitch, or technical talk into a single-canvas, physics-driven, cinema-grade interactive presentation. Every frame should feel intentionally art-directed, every transition should behave like an unbreakable physical continuum, and every detail should reward attentive viewers with subtle narrative callbacks.

## When to Use

- The user wants a jaw-dropping, bespoke web presentation, keynote, or interactive slide deck rather than a static PowerPoint template.
- The user wants rich custom graphics (2D generative art, 3D WebGL/Three.js worlds, particle morphs, kinetic typography, data sculptures) combined with ultra-smooth, interruptible transitions.
- The user wants a presentation where form and content fuse into a memorable narrative arc with foreshadowing, callbacks, and tactile polish.

## Core Philosophy: Direct a Continuous Film, Not Disconnected Slides

Traditional slide decks feel lifeless because they treat presentation as discrete rectangles swapping opacity. To create something unforgettable, internalize four laws:

1. **Continuous Physics Over Hard Cuts**: Never swap "Slide A off, Slide B on" with rigid CSS timers. Drive the entire deck with a continuous floating-point progress value and second-order damped springs so users can scrub, reverse, or interrupt mid-transition without a single velocity discontinuity.
2. **Match-Cut Continuity Over Generic Wipes**: Adjacent scenes must grow out of each other. Carry at least one surviving visual anchor (a line, point, counter, color field, letterform, or momentum vector) across every boundary so the eye stays locked while the world transforms around it.
3. **Foreshadowing & Running Motifs**: Plant quiet details early (a page counter, a wireframe grid, a blinking cursor, a recurring color accent) that evolve subtly across acts and deliver an emotional or witty payoff in the finale.
4. **Motion-Coupled Spectacle, Resting Clarity**: Bind visual drama (FOV stretch, chromatic dispersion, particle turbulence, bloom spikes) to instantaneous transition velocity or `sin(PI * progress)`. In motion, the deck feels electric; at rest, typography and graphics snap to razor-sharp legibility.

## Required Reference Reading

Before designing scenes or writing engine code, load all three playbooks in `references/` using `skills:get_skill_resources`:

- `references/narrative-choreography.md` - Story architecture, subversive hooks, running motifs, match-cut bridges, typography casting, and light/dark polarity pacing.
- `references/motion-physics-engine.md` - Single-canvas WebGL/Canvas2D engine skeleton, spring physics, framerate-independent damping, virtual mass layering, input handling, and zero-jank performance contracts.
- `references/transition-and-visual-recipes.md` - Concrete recipes and shaders for Dual-FBO transitions, 2D-to-3D breakouts, GPU particle morphs, spline flythroughs, procedural data sculptures, and crisp high-DPI text.

## End-to-End Production Workflow

Follow these five phases in order. Do not jump straight to coding before locking Phases 1 and 2.

### Phase 1: Concept Inversion & Narrative Arc

1. **Distill the Core Thesis**: Reduce the user's topic to one provocative tension (e.g., mundane vs. sublime, chaos vs. order, micro vs. macro, illusion vs. mechanism).
2. **Design the Subversive Opening**: Hook the audience within 3 seconds by establishing an expectation and breaking it (for example, starting with a deceptively austere editorial/default frame that suddenly reveals physical depth, self-edits, or shatters into particles).
3. **Plant One Running Motif (Callback Thread)**: Invent a subtle, recurring element that lives across the entire presentation and mutates as the story escalates, returning transformed at the final slide to close the loop.
4. **Map the 5-Act Pacing Curve**: Structure beats across Hook -> Escalation -> Deep Immersion -> Climax -> Full-Circle Resolution. Alternate high-density visual spectacle with stark, quiet breathing rooms so contrast creates awe.

### Phase 2: Visual Continuity Storyboard

Before writing code, draft a compact scene plan covering every beat:

- **One Beat, One Idea**: Never crowd a slide with bullet lists. Prefer one bold typographic statement, one living visual metaphor, or one interactive data sculpture per beat.
- **Explicit Match-Cut Bridge**: For every pair `Scene[i] -> Scene[i+1]`, define the exact visual anchor that persists and the transition mechanism (Geometric Inheritance, Scale/Portal Dive, 2D-to-3D Breakout, Particle Swarm Reassembly, Spline Camera Flythrough, or Dual-FBO Shader Warp).
- **Typography Casting & Polarity**: Pair 2 to 3 contrasting font voices (e.g., editorial serif + heavy display + technical monospace) and plan deliberate luminance flips (e.g., stark gallery white `#FFFFFF` vs. deep obsidian `#0A0C12`) with Linear/Oklab color interpolation.

### Phase 3: Physics-First Engine Construction

Build the presentation as a self-contained, single-canvas application (default: single HTML file or clean modular bundle with zero broken external dependencies):

1. **Single Full-Viewport Canvas**: Render all scenes into one fixed `<canvas id="stage">` to eliminate DOM layout reflow and context switching. Keep `#ui` pointer-events inert unless presenter chrome is toggled.
2. **Unified State & Continuous Timeline**: Maintain `targetIndex` (integer), `progress` (spring-driven float in `[0, N-1]`), and `velocity`. Sync slide slugs to `location.hash` so any beat is bookmarkable and jumpable.
3. **Interruptible Motion Core**: Use the `Spring` solver and framerate-independent `damp()` from `references/motion-physics-engine.md`. Never use raw `current += (target - current) * 0.1` without `dt` compensation.
4. **Virtual Mass Layering**: Give foreground typography, hero geometry, camera rig, and background atmosphere distinct stiffness and inertia so scenes peel apart with tactile parallax during transitions.
5. **Pre-Warming & Zero-GC Loop**: Wait for `document.fonts.ready` and asset decodes behind a clean minimal loader, pre-compile shaders (`renderer.compile`), cap DPR at `Math.min(devicePixelRatio, 2)`, clamp `dt <= 0.05`, and cull inactive scenes (`weight <= 0.001`).

### Phase 4: Visual Craft & Limitless Custom Graphics

Match the rendering technique to what each narrative beat truly calls for rather than forcing one gimmick across every slide:

- **2D Editorial & Typographic Precision**: Render razor-sharp kinetic typography, diagrams, and vector illustrations onto high-DPI offscreen canvases or crisp Canvas2D layers.
- **2D-to-3D Dimension Breakouts**: Map high-DPI 2D slide canvases onto 3D planes, then tilt, extrude, peel, or fold them into volumetric space when the narrative shifts scale.
- **Procedural 3D Worlds & Data Sculptures**: Build custom geometry, animated ribbons, instanced particle clouds, parametric charts, and interactive light rigs that react subtly to pointer parallax and transition velocity.
- **Custom GLSL Shaders**: Use custom vertex/fragment shaders for particle morphing, fluid/ink dissolves, radial velocity warps, and subtle atmospheric grain.

### Phase 5: Presenter Chrome & Verification Gate

Include unobtrusive, presenter-grade controls that stay completely invisible during normal viewing:

- **Navigation**: Arrow keys, Space, click/tap zones, inertial mouse wheel, touch swipe, and direct URL hash jump.
- **On-Demand Chrome**: Toggle speaker notes (`N`), thumbnail overview grid (`G` or `O`), shortcut help (`?` or `H`), and auto-hide cursor when idle.
- **Accessibility**: Respect `prefers-reduced-motion: reduce` by swapping high-velocity camera plunges for gentle cross-dissolves while preserving all content and callbacks.

Before delivering the final code, verify all 8 acceptance gates:

1. **Zero-Jank Interruptibility**: Rapidly pressing Next/Prev 5 times mid-transition reverses and settles smoothly with zero jumps, NaNs, or stuck overlays.
2. **Every Boundary Has a Bridge**: No two consecutive beats rely on a lazy plain fade unless intentionally paired as a quiet narrative breath.
3. **Callback Integrity**: The opening motif or visual seed pays off visibly in the closing act.
4. **Resting Legibility**: When `|velocity| < 0.01`, all text has crisp contrast, zero accidental blur/chromatic ghosting, and generous breathing margins.
5. **Framerate Independence**: All motion integrates `dt` (clamped at `0.05s`) so 60Hz and 120Hz displays feel identical.
6. **Responsive Framing**: Resizing between 16:9 desktop, ultrawide, and narrow mobile viewports recalculates camera aspect/FOV and canvas DPR cleanly without clipping hero typography.
7. **Resource Hygiene**: Inactive scenes skip heavy simulation and draw calls; no per-frame `new Vector3` / texture leaks inside `requestAnimationFrame`.
8. **Self-Contained Reliability**: All fonts have clean fallbacks if offline, CDN imports (if used) are pinned and resilient, or pure Canvas2D/WebGL works out of the box with zero missing files.

## Gotchas

- **Do not drown content in neon WebGL clutter**: Glowing purple particles behind illegible text is amateurish. Restraint, negative space, crisp editorial typography, and stark contrast create far greater awe than permanent bloom.
- **Do not let transitions outstay their welcome**: Ideal beat transitions settle in `0.7s - 1.3s`. Too fast feels abrupt; too slow feels sluggish during a live talk.
- **Do not use raw CSS transitions for WebGL sync**: Driving HTML text with CSS easing while driving WebGL with JS springs causes visible desync. Drive both from the exact same physics state or render text directly into the unified canvas pipeline.
- **Do not forget the "silent slide"**: A deck at 100% intensity on every beat becomes exhausting by beat 4. Place at least one ultra-minimal, quiet typographic pause right before the climax so the climax hits twice as hard.
