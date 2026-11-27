# Narrative Choreography & Visual Direction Playbook

Great technical animation without narrative taste is just a screensaver. This playbook defines how to conceive, pace, and art-direct a presentation so viewers remember it for years.

## 1. The Anti-Template Manifesto

Never organize a cinematic presentation as "Title at top + 4 bullet points + stock icon on the right." Instead, treat every beat as a **poster, an installation, or a film shot**:

- **Compress language**: Aim for 3 to 12 words on screen per beat. Put full explanations in the presenter's toggleable speaker notes (`N`).
- **Make the metaphor literal**: If a beat discusses exponential growth, do not show a clip-art rocket. Let the slide's own coordinate grid bend into space, or let the tiny page number in the corner accelerate through Fibonacci jumps into astronomical powers.
- **Give the medium self-awareness**: Break the fourth wall sparingly and smartly. A slide can type-edit its own stale headline, crack open its margins to reveal a 3D world underneath, or let a chart line punch past the slide border into physical depth.

## 2. The 5-Act Pacing & Contrast Curve

Design the emotional energy of the deck like a symphony rather than a flat line:

| Act | Typical Share | Visual & Kinetic Character | Narrative Role |
| :--- | :--- | :--- | :--- |
| **Act 1: The Subversive Hook** | Beats 1-2 | Deceptively calm, familiar, or stark; then one unmistakable reality-bend. | Earn immediate attention by shattering expectations of a "normal slide." |
| **Act 2: Dimension Breakout** | Beats 3-5 | Rising energy, first 2D-to-3D tilt or spatial portal, introducing the visual grammar. | Establish the core problem/thesis and show the rules of this world. |
| **Act 3: Deep Craft & Exploration** | Beats 6-9 | Varied textures: one tactile diagram, one live data sculpture, one quiet typographic breath. | Deliver substantive insight while preventing sensory fatigue. |
| **Act 4: The Climax** | Beats 10-11 | Highest spatial scale, swarm convergence, dynamic camera acceleration, full visual payoff. | Synthesize the entire argument into one unforgettable visceral image. |
| **Act 5: Full-Circle Echo** | Final Beat | Sudden silence, return to opening minimalism, carrying one subtle souvenir from the journey. | Leave the audience with goosebumps and a memorable closing thought. |

## 3. Foreshadowing & Micro-Callbacks (前后呼应的细微设计)

The difference between "cool effects" and "masterpiece" lies in details viewers only fully appreciate on Beat 10 and grin about on the final beat. Pick **one or two** callback devices per deck:

- **The Mutating Counter / Marker**: A subtle metadata element (slide number, timestamp, coordinate readout, or thin progress hair-line) behaves normally in Act 1, begins drifting or responding to the story in Act 2-3, explodes in scale/meaning at the Climax, and gently resets or transforms into a symbol (like infinity or a single period) at the end.
- **The Persistent Geometric Seed**: Introduce a simple shape on Beat 1 (a single square dot, a horizon rule, a thin ring). Reuse that exact shape as the structural spine of later charts, camera targets, and 3D portals. At the finale, fold the entire 3D world back down into that single dot.
- **The Bookend Mirror**: Make the final "Questions / Closing" beat mirror the opening layout's exact margins, typography, and background tone, EXCEPT leave one living artifact from the climax subtly breathing in the corner or reacting to the cursor.
- **Linguistic Echo**: Reuse a key phrase from Beat 1 in the final beat with one word struck through or transformed, visually animated in real time.

## 4. The 6 Canonical Match-Cut Bridges

Every transition `Scene[i] -> Scene[i+1]` must declare which bridge connects them. Never leave a transition "unspecified":

1. **Geometric Inheritance (几何延续)**: A single line, circle, frame, or bar from Scene A remains in the exact screen-space coordinate while transforming into the skeleton of Scene B (e.g., an underline extends into a 3D horizon; a pie slice opens into an architectural corridor).
2. **Kinetic Momentum Handoff (动量接力)**: Scene A exits along a clear vector (e.g., sweeping upward or orbiting clockwise), and Scene B enters carrying the exact same angular or linear momentum so both scenes feel attached to one invisible flywheel.
3. **Scale / Portal Dive (尺度穿越)**: The camera pushes straight through a micro-element of Scene A (the counter of the letter "O", a glowing data node, a screen-space pixel) until it fills the viewport and reveals Scene B inside.
4. **2D-to-3D Dimension Breakout (升维破壁)**: A flat, crisp 2D editorial composition tilts along its X/Y axis in perspective, revealing thickness, layered parallax cards, or volumetric geometry erupting straight off the page.
5. **Swarm Reassembly (粒子重组)**: The ink, pixels, or vertices of Scene A release into a curl-noise fluid swarm at the midpoint of the transition (`sin(PI * progress)` peak) and magnetically snap into the exact layout of Scene B.
6. **Luminance Polarity Flip (明暗极化反转)**: A deliberate, dramatic inversion between daylight gallery white (`#FFFFFF` with `#14161C` ink) and deep nocturnal cinema (`#0A0C12` with `#F2F4F8` ink), executed either via a single expanding radial mask from the hero object or smooth Oklab/Linear ambient shift.

## 5. Typography Casting & Spatial Aesthetics

Treat typography as a cast of actors, not passive labels:

- **Voice Contrast**: Assign distinct roles to 2 or 3 typefaces:
  - **Editorial / Human Voice** (e.g., italic/roman high-contrast serif like Newsreader, Playfair, Georgia fallback) for emotional statements, quotes, and poetic pivots.
  - **Architectural Display Voice** (e.g., condensed or geometric display like Anton, Unbounded, Syne) for monumental single-word impacts and chapter titles.
  - **Instrument / Precision Voice** (e.g., monospace like Geist Mono, JetBrains Mono) for live metrics, coordinates, code, and subtle running motifs.
- **Scale Tension**: Pair massive hero display type (`8vw - 14vw`) with tiny, hyper-precise instrument captions (`11px - 13px`, tabular numerals, tracked uppercase). Avoid timid middle sizes (`20px - 28px`) everywhere.
- **Color Discipline**: Limit each act to 1 dominant ground color, 1 high-contrast ink color, and 1 surgical accent color (e.g., electric cobalt `#2B5CFF`, vermilion `#FF4D2D`, or acid amber `#FFB800`). Never throw rainbow gradients onto dark backgrounds unless narratively justified.
