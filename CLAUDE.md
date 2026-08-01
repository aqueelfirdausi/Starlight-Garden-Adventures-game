# Starlight Garden Adventures

A gentle browser game where you fly a glowing firefly around a meadow. Built for
my daughter, who is 6 and plays on a tablet in Chrome.

Three.js, plain JavaScript, Vite. **No game engine, no TypeScript, no React, no
state library, no CSS framework.** Do not add dependencies without asking.

---

## The design rules

These are not preferences. A change that breaks one of these is wrong even if it
is otherwise good.

- **There is no way to lose.** No timer, no score, no failure, no enemies, no
  hunger bar, nothing scary, nothing that can go wrong. Anything that reads as
  pressure is out.
- **Nothing snaps.** Every transition is eased, in 3D and in the UI. Linear
  reads as mechanical; instant reads as a bug. If something appears, it fades or
  grows in.
- **The game never says no.** An action that can't happen simply doesn't
  respond — no error, no shake, no buzz, no message. Planting with no seed in
  hand does nothing at all, and that is the finished behaviour.
- **She is six.** Numbers and icons over words. Where a word is unavoidable,
  pick the one a six-year-old already knows: "Bright Mode", not "High Contrast";
  "Keep Playing", not "Resume".
- **Be generous.** Hit radii are deliberately huge (2.5 world units to collect,
  1.8 to tap). Too forgiving is invisible to the player; too tight is
  infuriating. Never make her aim.
- **The garden is alive.** It never freezes hard — not on the start screen, not
  while paused. Pausing slows time to about a third; it does not stop it.
- **The meadow is the same every time.** All scatter comes from `makeRandom()`
  with a fixed seed. She should come back to the garden she left.

---

## Performance budget

Target: **60fps on a tablet**, in both orientations.

Current: **26 draw calls, ~104,000 triangles** (the shadow pass included). The
soft ceiling is ~150 calls, but the tablet's real limits are fill rate and
lights, not call count.

Rules that keep it there:

- **Instance everything repeated.** 2700 blades of grass are one draw call. A
  flower is 10 objects; instanced across the whole garden it is 4 draw calls no
  matter how many bloom. Never build a `Mesh` per item.
- **One shared soft-dot texture** (`softdot.js`) for every glow in the game.
  Distinct textures are separate uploads and break batching.
- **Emissive instead of lights.** Three lights total: a hemisphere fill, one
  directional (the sun by day, the moon by night — the only light that casts a
  shadow), and one point light on the firefly. 26 glowing mushrooms are emissive
  materials, not 26 lights. The mushrooms are the only objects that cast into
  the shadow map; the grass deliberately does not, because 2700 casters would
  double the shadow pass for nothing. The firefly's lamp is the single most
  expensive thing in the frame — check it first if fps drops.
- **Allocate at startup, never during play.** No `new` in a collection handler,
  an update loop, or anything a frame touches. Hoist scratch `Vector3`,
  `Matrix4`, `Color` and `Object3D` objects to the closure. Particle bursts come
  from a fixed pool (`effects.js`); buffers are sized for capacity up front and
  unused slots are hidden with a zero-scale matrix.
- **Watch getters that build objects.** `state.counts` spreads a fresh object on
  every read — fine for a one-off, a GC pause if read per frame. Per-frame
  readers use the scalar getters (`state.petals`, `state.seedsHeld`,
  `state.flowers`).
- **Skip work when there is none.** `effects.update()` returns immediately when
  no particle is alive; the HUD writes no DOM on a frame where no digit changes.
- **No post-processing.** No bloom, no extra render passes. Stacked additive
  sprites fake the bloom falloff instead.

If fps drops, look in this order: the firefly's point light, the additive
sprites (halo, trail, glows), then `GRASS_TUFTS` in `props.js`.

---

## Touch rules

Every control, without exception:

- **72px minimum** hit target. Current sizes: Flutter Up 132, Start 104, Resume
  92, pause 76, the Bright Mode row 72.
- **Visible press feedback**, arriving the instant the finger lands — a scale
  change, a glow, a filling ring. Never a control that looks inert while held.
- **Safe-area aware.** Every fixed control offsets with
  `env(safe-area-inset-*)`. The tablet has rounded corners and a gesture bar.
- **Works in portrait and landscape.** The page must never scroll, in any
  orientation, at any size. Verify at 1024×768, 768×1024, 844×390 and 390×844.
- **Pointer Events only**, and track every pointer by its own `pointerId`. That
  is the entire trick to one finger steering while another holds Flutter Up.
- **`setPointerCapture` on anything held**, so a thumb that slides off keeps
  holding it. Children drift; losing lift mid-flight feels broken. Arm the
  behaviour *before* asking for capture, so a refused capture doesn't cost her
  the action.
- **A tap slides.** 16px of slop before a press counts as a drag, and an 8px
  deadzone so a resting thumb doesn't creep.
- `touch-action: none`, `user-select: none`, `overscroll-behavior: none`,
  `-webkit-tap-highlight-color: transparent`, and `preventDefault()` on
  `contextmenu` to kill Android's long-press menu.
- Tap hit-testing uses **perpendicular distance from the ray**
  (`ray.distanceSqToPoint`), never a mesh intersection. A petal is a few pixels
  across.

---

## Code style

- **No file over 300 lines.** This is a hard limit, checked when a file is
  touched.
- **Split the same way every time**: what a thing is *made of*
  (`flowerparts.js`, `pickups.js`, `fireflyparts.js`), the small machine it
  *runs* (`flowerlife.js`, `pickuplife.js`), and where it *goes* (`flowers.js`,
  `collectibles.js`). Reach for this shape before inventing a new one.
- **Factory functions returning an object of closures.** No classes, no `this`.
  `createThing(scene, options)`.
- **`main.js` only wires modules together.** Modules don't know about each
  other; if two need to interact, `main.js` is where that is expressed.
- **Comments say WHY, not what.** Every non-obvious constant carries the reason
  it is that number and what broke at other values. Match the existing density —
  it is high on purpose, and it is the actual documentation.
- **All colours live in `palette.js`.** Never a hex literal in geometry code.
- **Frame-rate independence everywhere**: `x += (target - x) * (1 - Math.exp(-λ * dt))`,
  never `lerp(0.1)` or `v *= 0.95`. `dt` is clamped to `1/20`.
- No semicolons, 2-space indent, single quotes.

---

## Three.js gotchas (all of these cost real time)

**ShaderMaterial does not run three's output pipeline.** A custom fragment
shader must end with:

```glsl
#include <tonemapping_fragment>
#include <colorspace_fragment>
```

Without them, linear values are written into an sRGB buffer, mid channels get
crushed, and any saturated colour turns into a screaming one. The first sunset
came out flat red because of this.

**Do NOT also include the matching `_pars_fragment` chunks.** Three already
injects those declarations into every fragment shader. Including them again is a
redefinition error and the shader compiles to black.

**`THREE.Color` has no `getComponent()`,** unlike `Vector3`. Reaching for one
inside the render loop throws every frame. Write the channels out longhand
(`.r`, `.g`, `.b`) in hot paths.

**`MeshStandardMaterial` with `vertexColors` multiplies `material.color` by the
vertex colour.** So `material.color` can only ever darken — there is no way to
brighten past the baked value. High-contrast mode darkens the dirt this way and
raises the ambient light instead of trying to brighten the material.

**Sample trails by distance, not by time.** On a timer, hovering stacks all 48
points on one spot and 48 coincident additive sprites blow the core out to pure
white. Distance stepping also fixes the wisp's length in world units so it looks
identical at 30fps and 60.

**Additive blending stacks toward white.** Pick base colours well short of
white, keep opacities under 1, and set `depthWrite: false` on every additive
glow so they don't occlude each other.

**`PointsMaterial` has no per-point size.** Use `vertexColors` for per-point
fade. Use `sizeAttenuation: false` for anything very far away (stars at 380
units would attenuate to nothing) and `true` for world-space glows.

**Set `fog: false`** on anything outside the fog range. Fog ends at 66 units, so
without it every star is grey soup.

**`frustumCulled = false`** on anything whose instances roam outside the bounds
computed at construction — trails, bursts, scattered flowers, pickups.

**An `InstancedMesh` draws all `count` instances regardless.** Hide unused slots
with a zero-scale matrix; changing `count` at runtime is not how this codebase
does it.

**`computeVertexNormals()` after displacing geometry,** or every quad lights as
a flat plate. And clamp any taper just above zero — letting it reach zero
collapses the pole triangles to zero area and `computeVertexNormals()` returns
NaNs.

**Deprecations (three r185):** `PCFSoftShadowMap` is deprecated and silently
substituted — name `PCFShadowMap` directly. `Clock` is replaced by `Timer`; call
`timer.connect(document)` so the Page Visibility API stops a backgrounded tab
handing back one enormous delta.

**Re-apply `setPixelRatio` on every resize** (capped at 1.5), not just at
startup — `devicePixelRatio` changes on zoom or a display move.

**Android reports stale dimensions during an orientation flip.** Re-measure on
the next `requestAnimationFrame` *and* again after 250ms.

---

## UI gotchas (`src/ui/`)

Everything in `src/ui/` is HTML and CSS over the canvas. **Never rendered in 3D,
never an extra WebGL pass.**

- **No `backdrop-filter: blur()` over the live canvas.** It is a
  full-resolution compositor pass every frame — the one cheap-looking trick that
  is genuinely expensive here. Dim with a veil instead; it composites once.
- **`#ui` has `pointer-events: none` and its children opt back in with `auto`.**
  Switching off the layer is therefore not enough to disable a control — the
  child has to be named too.
- **Replaying a CSS animation by removing and re-adding the class needs a forced
  reflow.** Rewind the running animation via `getAnimations()` instead, which
  requires `animation-fill-mode: forwards` so the finished animation stays
  attached to the element.
- **The HUD may not touch the DOM every frame** — only on a frame where a
  displayed digit actually changes. Idle must be zero mutations.
- **Set `inert` on a closed dialog.** A hidden pause panel still in the document
  otherwise announces the game as permanently paused.
- Reduced motion is handled per-file, not with one blanket rule. The pause
  button's filling ring is feedback, not decoration, and switching it off leaves
  a child pressing a button that looks dead.

---

## Running and verifying

```bash
npm run dev -- --host
```

The `--host` flag prints a second `Network:` URL — that is the one the tablet
uses. `localhost` means the tablet itself.

Verify in the browser, not by reasoning about it. Useful handles: `window.__garden`
exposes every module in dev builds (stripped from production by
`import.meta.env.DEV`), and the bottom-left readout is live fps and draw calls.
Check `renderer.info.render.calls` after any change that adds an object.

---

## Deliberately not built

Don't add these without being asked: sound and music, post-processing/bloom, a
firefly redesign, a settings screen, difficulty, saving, or any menu beyond the
single Start button and the pause panel.
