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

### What Phase 1 includes

- A moonlit meadow with soft rolling hills, about 2700 blades of grass and a
  scattering of small glowing mushrooms. The meadow is generated from a fixed
  seed, so it looks exactly the same every time you open it.
- A firefly you fly around: a warm gold orb with a soft halo and a short trail
  of light. It bobs when it's hovering and tilts into its turns.
- Touch controls — drag anywhere on screen to steer, hold the **Flutter Up**
  button to rise, let go to drift back down. Both work at the same time.
- A follow camera that lags gently behind, and soft invisible edges that turn
  you around instead of stopping you.
- Works in portrait and landscape, and holds 60fps.

### Still to come

- Collectibles — seeds, and flowers you can plant and grow
- A day/night cycle, and constellations in the sky
- A start screen
- Sound and music
- Post-processing (bloom), if there's performance budget left for it

### Performance notes to myself

The game currently draws the whole scene in **12 draw calls** with about
**84,000 triangles**, well inside the budget. If it ever starts to stutter on
the tablet, the three things to look at first, in order:

1. The point light attached to the firefly (in `src/firefly.js`) — it's the
   most expensive single thing in the frame.
2. The see-through glowing sprites — the halo, the trail, the mushroom glows.
3. The amount of grass — change `GRASS_TUFTS` in `src/props.js`.

---

## How the code is organised

Small files, one job each, all in `src/`.

| File | What it does |
| --- | --- |
| `main.js` | Starts everything up and runs the frame loop |
| `world.js` | Puts the meadow together — sky, fog, lighting |
| `terrain.js` | The shape of the ground, and how high it is at any point |
| `props.js` | The grass and the mushrooms |
| `firefly.js` | The firefly — how it moves and how it looks |
| `controls.js` | Reading touches from the screen |
| `camera.js` | The camera that follows the firefly |
| `palette.js` | Every colour in the game, in one place |
| `softdot.js` | The soft round glow image, shared by everything that glows |

The number in the top-left corner while playing is the frame rate and the draw
call count. It's a debug readout, not part of the game.
