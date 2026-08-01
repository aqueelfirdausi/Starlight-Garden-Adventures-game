import * as THREE from 'three'
import { COLORS } from './palette.js'
import { groundHeightAt, makeRandom } from './terrain.js'
import { createPetalMesh, createSeedGlow, createSeedMesh, setPickupContrast } from './pickups.js'
import { ACTIVE, createItems, POPPING } from './pickuplife.js'

/**
 * The two things worth flying toward: drifting star-petals and hovering seeds.
 *
 * This file is about where they GO — the arcs the petals trace, the bob of a
 * seed, and who is close enough to collect one. What an item is made of is in
 * pickups.js; the small machine each one runs is in pickuplife.js.
 *
 * Each type is a single InstancedMesh, so all 22 petals cost one draw call. The
 * per-frame work is writing 40 instance matrices, which is cheap; what would
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

export function createCollectibles(scene, { onCollect, state } = {}) {
  const random = makeRandom(90210)

  const petals = createPetalMesh(PETAL_COUNT)
  const seeds = createSeedMesh(SEED_COUNT)
  // The glow buffer is rewritten each frame from the seed states below.
  const glow = createSeedGlow(SEED_COUNT)
  const glowPositions = glow.positions

  scene.add(petals, seeds, glow.points)

  // Draws from the same seeded generator that placed the meshes, so the whole
  // meadow still lays itself out identically on every open.
  const items = createItems(random)
  const petalItems = Array.from({ length: PETAL_COUNT }, () => items.make(true))
  const seedItems = Array.from({ length: SEED_COUNT }, () => items.make(false))

  const dummy = new THREE.Object3D()

  function collect(item, isPetal) {
    item.state = POPPING
    item.timer = 0
    // Tallies live in state.js now, because planting has to spend the seeds
    // this earns and both sides need the same numbers.
    if (isPetal) state.addPetal()
    else state.addSeed()

    if (onCollect) {
      onCollect({
        position: item.pos,
        color: isPetal ? COLORS.petalBurst : COLORS.seedBurst,
        kind: isPetal ? 'petal' : 'seed',
      })
    }
  }

  /**
   * @param {boolean} live false while the start screen or pause panel is up.
   *        Everything still drifts and bobs, but flying into a petal doesn't
   *        take it — a paused game must not quietly play itself.
   */
  function update(dt, elapsed, fireflyPosition, live = true) {
    // --- Petals: slow lissajous arcs at varying heights ---------------------
    for (let i = 0; i < PETAL_COUNT; i++) {
      const item = petalItems[i]
      items.advance(item, dt, fireflyPosition)

      const a = elapsed * item.driftSpeed + item.phase
      const x = item.anchor.x + Math.cos(a) * item.driftRadius
      // The 0.8 ratio is what turns a circle into a drifting arc.
      const z = item.anchor.z + Math.sin(a * 0.8 + 1.1) * item.driftRadius
      item.pos.set(
        x,
        groundHeightAt(x, z) + item.height + Math.sin(elapsed * 0.6 + item.phase) * 0.45,
        z
      )

      if (live && item.state === ACTIVE && item.pos.distanceToSquared(fireflyPosition) < COLLECT_RADIUS * COLLECT_RADIUS) {
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
      items.advance(item, dt, fireflyPosition)

      const x = item.anchor.x
      const z = item.anchor.z
      item.pos.set(
        x,
        groundHeightAt(x, z) + item.height + Math.sin(elapsed * item.bobSpeed + item.phase) * 0.22,
        z
      )

      if (live && item.state === ACTIVE && item.pos.distanceToSquared(fireflyPosition) < COLLECT_RADIUS * COLLECT_RADIUS) {
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

    /** High-contrast mode. What it means to a pickup is pickups.js's business. */
    setContrast(on) {
      setPickupContrast({ petals, seeds, glow }, on)
    },

    /** Running totals. Kept here for Phase 2 compatibility; state.js owns them. */
    get counts() {
      return state.counts
    },
  }
}
