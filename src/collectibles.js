import * as THREE from 'three'
import { COLORS } from './palette.js'
import { groundHeightAt, makeRandom, MEADOW_RADIUS } from './terrain.js'
import { createPetalMesh, createSeedGlow, createSeedMesh } from './pickups.js'

/**
 * The two things worth flying toward: drifting star-petals and hovering seeds.
 *
 * Each type is a single InstancedMesh, so all 36 petals cost one draw call. The
 * per-frame work is writing 64 instance matrices, which is cheap; what would
 * NOT be cheap is a Mesh each, so there deliberately isn't one.
 */

// Tuned by eye against the camera's field of view: enough that one is almost
// always in shot, few enough that the meadow doesn't look littered.
const PETAL_COUNT = 22
const SEED_COUNT = 18

// Deliberately huge. This is for a six-year-old: brushing anywhere near a petal
// should collect it. Too forgiving is invisible; too tight is infuriating.
const COLLECT_RADIUS = 2.5
// How far off a tap ray still counts as a hit, in world units at the item.
const TAP_RADIUS = 1.8

const RESPAWN_MIN = 2.5
const RESPAWN_MAX = 4.5
const RESPAWN_CLEARANCE = 9 // Never rematerialise right on top of the player.

const POP_TIME = 0.16 // Scale-up on collection.
const DISSOLVE_TIME = 0.24 // Then shrink away under cover of the burst.
const FADE_TIME = 0.9 // Slow grow-in on respawn. Nothing pops into existence.

// Item lifecycle. Numbers rather than strings so the per-frame switch is a
// straight integer compare.
const ACTIVE = 0
const POPPING = 1
const DISSOLVING = 2
const HIDDEN = 3
const FADING = 4

const TAU = Math.PI * 2

export function createCollectibles(scene, { onCollect } = {}) {
  const random = makeRandom(90210)
  const counts = { petals: 0, seeds: 0, total: 0 }

  const petals = createPetalMesh(PETAL_COUNT)
  const seeds = createSeedMesh(SEED_COUNT)
  // The glow buffer is rewritten each frame from the seed states below.
  const glow = createSeedGlow(SEED_COUNT)
  const glowPositions = glow.positions

  scene.add(petals, seeds, glow.points)

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

  function makeItem(isPetal) {
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

  const petalItems = Array.from({ length: PETAL_COUNT }, () => makeItem(true))
  const seedItems = Array.from({ length: SEED_COUNT }, () => makeItem(false))

  const dummy = new THREE.Object3D()

  function collect(item, isPetal) {
    item.state = POPPING
    item.timer = 0
    if (isPetal) counts.petals++
    else counts.seeds++
    counts.total++

    if (onCollect) {
      onCollect({
        position: item.pos,
        color: isPetal ? COLORS.petalBurst : COLORS.seedBurst,
        kind: isPetal ? 'petal' : 'seed',
      })
    }
  }

  /**
   * Advance one item's lifecycle and return its render scale.
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

  function update(dt, elapsed, fireflyPosition) {
    // --- Petals: slow lissajous arcs at varying heights ---------------------
    for (let i = 0; i < PETAL_COUNT; i++) {
      const item = petalItems[i]
      advance(item, dt, fireflyPosition)

      const a = elapsed * item.driftSpeed + item.phase
      const x = item.anchor.x + Math.cos(a) * item.driftRadius
      // The 0.8 ratio is what turns a circle into a drifting arc.
      const z = item.anchor.z + Math.sin(a * 0.8 + 1.1) * item.driftRadius
      item.pos.set(
        x,
        groundHeightAt(x, z) + item.height + Math.sin(elapsed * 0.6 + item.phase) * 0.45,
        z
      )

      if (item.state === ACTIVE && item.pos.distanceToSquared(fireflyPosition) < COLLECT_RADIUS * COLLECT_RADIUS) {
        collect(item, true)
      }

      dummy.position.copy(item.pos)
      dummy.rotation.set(
        elapsed * item.spinX + item.phase,
        elapsed * item.spinY + item.phase,
        elapsed * item.spinZ
      )
      dummy.scale.setScalar(item.size * item.scale)
      dummy.updateMatrix()
      petals.setMatrixAt(i, dummy.matrix)
    }
    petals.instanceMatrix.needsUpdate = true

    // --- Seeds: bobbing in place, low over the grass ------------------------
    for (let i = 0; i < SEED_COUNT; i++) {
      const item = seedItems[i]
      advance(item, dt, fireflyPosition)

      const x = item.anchor.x
      const z = item.anchor.z
      item.pos.set(
        x,
        groundHeightAt(x, z) + item.height + Math.sin(elapsed * item.bobSpeed + item.phase) * 0.22,
        z
      )

      if (item.state === ACTIVE && item.pos.distanceToSquared(fireflyPosition) < COLLECT_RADIUS * COLLECT_RADIUS) {
        collect(item, false)
      }

      dummy.position.copy(item.pos)
      dummy.rotation.set(0, elapsed * 0.3 + item.phase, 0)
      dummy.scale.setScalar(item.size * item.scale)
      dummy.updateMatrix()
      seeds.setMatrixAt(i, dummy.matrix)

      // Park the halo inside the pod, and let it shrink away with it.
      const p = i * 3
      glowPositions[p + 0] = x
      glowPositions[p + 1] = item.scale > 0.02 ? item.pos.y : -999 // Off-scene when gone.
      glowPositions[p + 2] = z
    }
    seeds.instanceMatrix.needsUpdate = true
    glow.geometry.attributes.position.needsUpdate = true
  }

  /**
   * Nearest collectible to a tap ray, or null.
   *
   * Perpendicular distance from the ray rather than a mesh intersection: a
   * petal is a few pixels across, and requiring a child to hit it exactly would
   * make tapping useless. This is the "generous hit radius".
   */
  function pick(raycaster) {
    let best = null
    let bestIsPetal = false
    let bestDistance = TAP_RADIUS * TAP_RADIUS

    for (let i = 0; i < PETAL_COUNT; i++) {
      const item = petalItems[i]
      if (item.state !== ACTIVE) continue
      const d = raycaster.ray.distanceSqToPoint(item.pos)
      if (d < bestDistance) {
        bestDistance = d
        best = item
        bestIsPetal = true
      }
    }

    for (let i = 0; i < SEED_COUNT; i++) {
      const item = seedItems[i]
      if (item.state !== ACTIVE) continue
      const d = raycaster.ray.distanceSqToPoint(item.pos)
      if (d < bestDistance) {
        bestDistance = d
        best = item
        bestIsPetal = false
      }
    }

    return best ? { item: best, isPetal: bestIsPetal } : null
  }

  return {
    update,

    /** True if a tap here would hit something — used to suppress steering. */
    hitTest(raycaster) {
      return pick(raycaster) !== null
    },

    /** Collect whatever the tap ray hits. Returns true if something was taken. */
    collectAt(raycaster) {
      const hit = pick(raycaster)
      if (!hit) return false
      collect(hit.item, hit.isPetal)
      return true
    },

    /** Running totals, for the Phase 5 HUD to read. */
    get counts() {
      return { ...counts }
    },
  }
}
