# Starlight Garden Adventures

A gentle browser game where you fly a glowing firefly around a moonlit meadow.

Built for my daughter. There is no way to lose, no timer, nothing scary, and
nothing that can go wrong — you just fly around and it's pretty.

**Who it's for:** children roughly 6–9 years old, playing on a tablet.

**Built with:** [Three.js](https://threejs.org/) for the 3D, plain JavaScript,
and [Vite](https://vite.dev/) to run and build it. No game engine, no
TypeScript, no React.

---

## Running it on your computer

You need [Node.js](https://nodejs.org/) installed first.

Install the dependencies once:

```bash
npm install
```

Then start the dev server:

```bash
npm run dev
```

That gives you a `http://localhost:5173` link that works on **this computer
only**.

## Running it on the tablet

This is the important one, because the whole game is designed for touch and
you can't really judge it with a mouse.

```bash
npm run dev -- --host
```

The `--host` flag makes Vite print a **second** URL, called `Network:`, that
looks something like `http://192.168.1.42:5173`. **That Network URL is the one
you type into Chrome on the tablet.** The `localhost` one will not work there —
to the tablet, "localhost" means the tablet itself.

Both devices have to be on the same Wi-Fi.

The page updates on the tablet as soon as you save a file, so you can leave it
open while you work.

## Building it

```bash
npm run build
```

This writes a finished copy of the game into a `dist/` folder — plain files
that any web host can serve. Nothing in `dist/` is committed to git; the host
builds its own copy.

To check the built version before deploying:

```bash
npm run preview
```

---

## Current status

### What's in the game (Phases 1–5)

- A meadow with soft rolling hills, about 2700 blades of grass and a scattering
  of small glowing mushrooms. It's generated from a fixed seed, so it looks
  exactly the same every time you open it.
- A firefly you fly around: a warm gold orb with a soft halo and a short trail
  of light. It bobs when it's hovering and tilts into its turns.
- Touch controls — drag anywhere on screen to steer, hold the **Flutter Up**
  button to rise, let go to drift back down. Both work at the same time.
- A follow camera that lags gently behind, and soft invisible edges that turn
  you around instead of stopping you.
- Star-petals to gather and glowing seeds to collect, either by flying through
  them or by tapping them.
- Dirt patches you can plant a seed in. A flower creature grows out of it,
  opens its face, and waves hello.
- A seven-minute day/night cycle, a sky full of stars, and constellations you
  earn by planting — one for every three flowers.
- A start screen, a small HUD, a pause you have to hold to open, and a
  **Bright Mode** toggle for when the meadow is hard to read.
- Works in portrait and landscape, and holds 60fps.

### Still to come

- Sound and music
- Post-processing (bloom), if there's performance budget left for it
- A redesign of the firefly herself

### Performance notes to myself

The game draws the whole scene in **26 draw calls** with about **104,000
triangles**, well inside the budget. That count includes the shadow pass, and
it doesn't move as flowers are planted or constellations appear — everything
added after Phase 1 went into buffers that were already allocated at startup.

The start screen, HUD and pause menu are plain HTML over the canvas. They cost
**zero** draw calls, and the HUD only touches the DOM on the frames where a
number actually changes.

If it ever starts to stutter on the tablet, the three things to look at first,
in order:

1. The point light attached to the firefly (in `src/firefly.js`) — it's the
   most expensive single thing in the frame, and Bright Mode makes it stronger.
2. The see-through glowing sprites — the halo, the trail, the mushroom glows.
3. The amount of grass — change `GRASS_TUFTS` in `src/props.js`.

---

## How the code is organised

Small files, one job each, all in `src/`.

Where a thing is big enough to split, it's split the same way every time: one
file for what something is *made of*, one for the little machine it *runs*, and
one for where it *goes*. No file is over 300 lines.

| File | What it does |
| --- | --- |
| `main.js` | Starts everything up and runs the frame loop |
| `world.js` | Puts the meadow together — sky, fog, lighting |
| `terrain.js` | The shape of the ground, and how high it is at any point |
| `props.js` | The grass and the mushrooms |
| `firefly.js` | The firefly — how she flies |
| `fireflyparts.js` | What the firefly is made of, and her trail |
| `controls.js` | Reading touches from the screen |
| `camera.js` | The camera that follows the firefly |
| `collectibles.js` | Where the star-petals and seeds go, and who collects them |
| `pickups.js` | What a petal and a seed are made of |
| `pickuplife.js` | A pickup's life — appearing, being collected, coming back |
| `patches.js` | The dirt patches you can plant in |
| `flowers.js` | Where the parts of a flower creature go |
| `flowerparts.js` | What a flower creature is made of |
| `flowerlife.js` | A flower's life — sprouting, opening, waving, blinking |
| `sky.js` | The day/night cycle, and the stars |
| `constellations.js` | The constellations you earn by planting |
| `effects.js` | The little bursts of light when something happens |
| `state.js` | What the garden remembers — petals, seeds, flowers |
| `contrast.js` | The Bright Mode switch, and where it lands |
| `palette.js` | Every colour in the game, in one place |
| `softdot.js` | The soft round glow image, shared by everything that glows |

Everything in `src/ui/` is HTML and CSS drawn over the canvas, never in 3D:

| File | What it does |
| --- | --- |
| `ui/shell.js` | The game shell — owns "started" and "paused", and how fast time runs |
| `ui/startscreen.js` | The title and the one button |
| `ui/hud.js` | The three counters, and the rule that they only redraw on change |
| `ui/pause.js` | The hold-to-open pause button, and the panel behind it |

The number in the bottom-left corner while playing is the frame rate and the
draw call count. It's a debug readout, not part of the game.
