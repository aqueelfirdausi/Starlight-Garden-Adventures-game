import * as THREE from 'three'
import { MEADOW_RADIUS } from './terrain.js'

/**
 * A pickup's life: where it appears, how it moves through being collected, and
 * how it comes back.
 *
 * The peer of flowerlife.js, and split out of collectibles.js for the same
 * reason — that file is now about placing petals and seeds in the meadow each
 * frame, and this one is about the small machine each of them runs. Nothing
 * here knows about the firefly except as a point to stay away from.
 */

// Item lifecycle. Numbers rather than strings so the per-frame switch is a
// straight integer compare.
export const ACTIVE = 0
export const POPPING = 1
export const DISSOLVING = 2
export const HIDDEN = 3
export const FADING = 4

const POP_TIME = 0.16 // Scale-up on collection.
const DISSOLVE_TIME = 0.24 // Then shrink away under cover of the burst.
const FADE_TIME = 0.9 // Slow grow-in on respawn. Nothing pops into existence.

const RESPAWN_MIN = 2.5
const RESPAWN_MAX = 4.5
const RESPAWN_CLEARANCE = 9 // Never rematerialise right on top of the player.

const TAU = Math.PI * 2

/**
 * @param {() => number} random the caller's seeded generator, so the meadow
 *        lays itself out identically every time the game is opened.
 */
export function createItems(random) {
  /** Somewhere in the meadow, but not in the player's lap. */
  function pickAnchor(target, awayFrom) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = random() * TAU
      const radius = Math.sqrt(random()) * (MEADOW_RADIUS - 3)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (!awayFrom || Math.hypot(x - awayFrom.x, z - awayFrom.z) > RESPAWN_CLEARANCE) {
        target.x = x
        target.z = z
        return
      }
    }
    // Ten misses means the meadow is crowded around her; take the last roll.
    target.x = Math.cos(random() * TAU) * (MEADOW_RADIUS - 3)
    target.z = Math.sin(random() * TAU) * (MEADOW_RADIUS - 3)
  }

  /** One petal or one seed, with the motion parameters its kind needs. */
  function make(isPetal) {
    const item = {
      anchor: { x: 0, z: 0 },
      pos: new THREE.Vector3(),
      phase: random() * TAU,
      state: ACTIVE,
      timer: 0,
      scale: 1,
      respawnDelay: 0,
    }
    pickAnchor(item.anchor, null)

    if (isPetal) {
      // Varying heights, but kept low enough to sit against the meadow rather
      // than floating up into empty sky where they read as litter.
      item.height = 1.8 + random() * 3.4
      item.driftRadius = 1.6 + random() * 2.6
      item.driftSpeed = 0.08 + random() * 0.12
      item.spinX = (random() - 0.5) * 0.5
      item.spinY = 0.22 + random() * 0.36
      item.spinZ = (random() - 0.5) * 0.34
      item.size = 0.82 + random() * 0.4
    } else {
      item.height = 1.25 + random() * 1.15 // Close to the ground.
      item.bobSpeed = 1.0 + random() * 0.7
      item.size = 0.85 + random() * 0.3
    }
    return item
  }

  /**
   * Advance one item's lifecycle, writing its render scale onto it.
   * Kept separate from placement so petals and seeds share it exactly.
   */
  function advance(item, dt, fireflyPosition) {
    item.timer += dt

    switch (item.state) {
      case POPPING:
        // Swell first — the eye reads the growth as "yes, you got it".
        item.scale = 1 + (item.timer / POP_TIME) * 0.55
        if (item.timer >= POP_TIME) {
          item.state = DISSOLVING
          item.timer = 0
        }
        break

      case DISSOLVING: {
        const t = Math.min(item.timer / DISSOLVE_TIME, 1)
        item.scale = 1.55 * (1 - t * t) // Accelerating shrink, hidden by the burst.
        if (t >= 1) {
          item.state = HIDDEN
          item.timer = 0
          item.scale = 0
          item.respawnDelay = RESPAWN_MIN + random() * (RESPAWN_MAX - RESPAWN_MIN)
        }
        break
      }

      case HIDDEN:
        if (item.timer >= item.respawnDelay) {
          pickAnchor(item.anchor, fireflyPosition)
          item.phase = random() * TAU
          item.state = FADING
          item.timer = 0
        }
        break

      case FADING: {
        const t = Math.min(item.timer / FADE_TIME, 1)
        item.scale = t * t * (3 - 2 * t) // Smoothstep: eases in and out, no snap.
        if (t >= 1) {
          item.state = ACTIVE
          item.scale = 1
        }
        break
      }

      default:
        item.scale = 1
    }
  }

  return { make, advance }
}
