import './ui.css'
import { createHud } from './hud.js'
import { createPauseMenu } from './pause.js'
import { createStartScreen } from './startscreen.js'

/**
 * The game shell: what turns a running scene into something she opens.
 *
 * This is the only file in src/ui that main.js knows about. It owns the two
 * pieces of state the frame loop has to ask about — how fast time is running,
 * and whether the garden is accepting her — and nothing else.
 *
 * Not a state machine with modes. There are two booleans, started and paused,
 * and every question the loop asks is answered from them.
 */

// Paused time doesn't stop, it slows. The garden keeps drifting behind the
// panel at a third of speed: still visibly alive, clearly not being played.
const PAUSED_TIME_SCALE = 0.32
// How fast the slowdown itself eases. About a second either way, so pausing
// feels like the garden settling rather than like a switch being thrown.
const TIME_EASE = 2.6

/**
 * @param {object} options
 * @param {object} options.state    the garden state, read by the HUD
 * @param {object} options.contrast the high-contrast switch from contrast.js
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onPause] fired when the pause panel opens
 */
export function createUI({ state, contrast, onStart, onPause }) {
  const root = document.createElement('div')
  root.id = 'shell'
  document.body.appendChild(root)

  let started = false
  let paused = false
  let timeScale = 1

  const hud = createHud(root, state)

  const pause = createPauseMenu(root, {
    contrast,
    onPause() {
      paused = true
      if (onPause) onPause()
    },
    onResume() {
      paused = false
    },
  })

  createStartScreen(root, {
    onStart() {
      started = true
      // The class is what fades in Flutter Up, the HUD and the pause button
      // together, so the game's furniture arrives as one thing rather than
      // three. Everything else about "started" is decided by the boolean.
      document.body.classList.add('playing')
      if (onStart) onStart()
    },
  })

  return {
    /**
     * @param {number} dt REAL seconds, not scaled — the UI has to keep its own
     *        time or the pause transition would slow itself down as it ran.
     */
    update(dt) {
      const target = paused ? PAUSED_TIME_SCALE : 1
      timeScale += (target - timeScale) * (1 - Math.exp(-TIME_EASE * dt))
      hud.update(dt)
    },

    /** Multiplier on the frame delta the world is stepped with. */
    get timeScale() {
      return timeScale
    },

    /**
     * True only while she is actually playing. Gates the things that would
     * otherwise let a paused or not-yet-started game quietly play itself:
     * proximity collection and proximity planting.
     */
    get live() {
      return started && !paused
    },

    get started() {
      return started
    },

    get paused() {
      return paused
    },

    /** Leave the pause panel from outside. */
    resume() {
      pause.close()
    },
  }
}
