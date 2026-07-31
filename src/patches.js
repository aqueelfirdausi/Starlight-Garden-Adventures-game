import * as THREE from 'three'
import { COLORS } from './palette.js'
import { getSoftDotTexture } from './softdot.js'
import { groundHeightAt, makeRandom, MEADOW_RADIUS } from './terrain.js'

/**
 * Soft dirt patches: the places a seed can be planted.
 *
 * All 14 discs are merged into ONE static geometry rather than instanced. They
 * never move, and each one's rim has to follow the terrain underneath it, which
 * an InstancedMesh can't do — every instance would share the same flat disc and
 * cut into the hillside. Merging gets terrain-hugging discs for one draw call.
 *
 * The invitation glow is a separate Points layer so individual patches can be
 * switched off as they're planted, which a single shared material can't express.
 */

export const PATCH_COUNT = 14

const PATCH_RADIUS = 1.05
const RING_SEGMENTS = 16
const LIFT = 0.04 // Above the terrain, so the disc doesn't z-fight the ground.
const MIN_SEPARATION = 7.5 // Keeps them well spread rather than clustered.

// Generous, matching the collectible rules — she should not have to aim.
const PLANT_RADIUS = 2.6
const TAP_RADIUS = 2.0

const GLOW_FADE = 2.2 // How fast the invitation eases in and out.
const TAU = Math.PI * 2

/**
 * Build every disc into one buffer. Each disc is a triangle fan whose rim
 * vertices are individually dropped onto the terrain.
 */
function buildDirtGeometry(patches, random) {
  const perPatch = RING_SEGMENTS + 1 // centre + ring
  const vertexCount = patches.length * perPatch
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const indices = []

  const centre = new THREE.Color(COLORS.dirt)
  const rim = new THREE.Color(COLORS.dirtRim)

  patches.forEach((patch, p) => {
    const base = p * perPatch

    positions[base * 3 + 0] = patch.x
    positions[base * 3 + 1] = groundHeightAt(patch.x, patch.z) + LIFT
    positions[base * 3 + 2] = patch.z
    colors[base * 3 + 0] = centre.r
    colors[base * 3 + 1] = centre.g
    colors[base * 3 + 2] = centre.b

    for (let i = 0; i < RING_SEGMENTS; i++) {
      const angle = (i / RING_SEGMENTS) * TAU
      // Jittered radius so the outline is organic rather than a drawn circle.
      const r = patch.radius * (0.82 + random() * 0.3)
      const x = patch.x + Math.cos(angle) * r
      const z = patch.z + Math.sin(angle) * r
      const v = base + 1 + i

      positions[v * 3 + 0] = x
      positions[v * 3 + 1] = groundHeightAt(x, z) + LIFT
      positions[v * 3 + 2] = z
      // Rim blends to the ground colour, which is what softens the edge.
      colors[v * 3 + 0] = rim.r
      colors[v * 3 + 1] = rim.g
      colors[v * 3 + 2] = rim.b

      const next = base + 1 + ((i + 1) % RING_SEGMENTS)
      indices.push(base, next, v)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createPatches(scene, { state, onPlant } = {}) {
  const random = makeRandom(4242)
  const patches = []

  // Rejection sampling for spread. Ten tries then take what we get, so a
  // crowded meadow can never spin here forever.
  for (let i = 0; i < PATCH_COUNT; i++) {
    let x = 0
    let z = 0
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = random() * TAU
      const radius = 5 + Math.sqrt(random()) * (MEADOW_RADIUS - 8)
      x = Math.cos(angle) * radius
      z = Math.sin(angle) * radius
      const clear = patches.every((p) => Math.hypot(p.x - x, p.z - z) > MIN_SEPARATION)
      if (clear) break
    }
    patches.push({
      x,
      z,
      y: groundHeightAt(x, z),
      radius: PATCH_RADIUS * (0.85 + random() * 0.35),
      planted: false,
      pos: new THREE.Vector3(x, groundHeightAt(x, z), z),
    })
  }

  const dirt = new THREE.Mesh(
    buildDirtGeometry(patches, random),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      // Lower roughness than the surrounding moss is the whole "damp" effect —
      // it catches a little moonlight where the dry grass doesn't.
      roughness: 0.62,
      metalness: 0,
      // Belt and braces against z-fighting on the shallower slopes.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  )
  dirt.receiveShadow = true

  // One halo per patch. vertexColors lets a planted patch go to black, which
  // under additive blending means it simply stops existing.
  const glowPositions = new Float32Array(PATCH_COUNT * 3)
  const glowColors = new Float32Array(PATCH_COUNT * 3)
  patches.forEach((patch, i) => {
    glowPositions[i * 3 + 0] = patch.x
    glowPositions[i * 3 + 1] = patch.y + 0.12 // Hugs the dirt rather than hovering over it.
    glowPositions[i * 3 + 2] = patch.z
  })

  const glowGeometry = new THREE.BufferGeometry()
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3))
  glowGeometry.setAttribute('color', new THREE.BufferAttribute(glowColors, 3))

  const glow = new THREE.Points(
    glowGeometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      size: 1.5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    })
  )
  glow.frustumCulled = false

  scene.add(dirt, glow)

  const glowColor = new THREE.Color(COLORS.patchGlow)
  let glowStrength = 0 // Eased, so the invitation never blinks on or off.

  function plant(patch) {
    if (patch.planted) return false
    // Ask state first. No seed means nothing happens at all — no sound, no
    // shake, no message. The patch simply doesn't respond.
    if (!state || !state.trySpendSeed()) return false

    patch.planted = true
    if (onPlant) onPlant(patch)
    return true
  }

  function update(dt, elapsed, fireflyPosition) {
    const carrying = state ? state.seedsHeld > 0 : false

    // Proximity planting.
    if (carrying && fireflyPosition) {
      for (let i = 0; i < patches.length; i++) {
        const patch = patches[i]
        if (patch.planted) continue
        const dx = patch.x - fireflyPosition.x
        const dz = patch.z - fireflyPosition.z
        const dy = patch.y - fireflyPosition.y
        if (dx * dx + dy * dy + dz * dz < PLANT_RADIUS * PLANT_RADIUS) {
          plant(patch)
          break // One per frame, so a low pass doesn't empty her pockets.
        }
      }
    }

    glowStrength += ((carrying ? 1 : 0) - glowStrength) * (1 - Math.exp(-GLOW_FADE * dt))

    // Slow shared pulse. Faint on purpose: an invitation, not a marker. These
    // numbers are low because additive blending over dark dirt reads far
    // brighter than the colour suggests — at 0.5 it looked like a spotlight.
    const pulse = (0.34 + Math.sin(elapsed * 1.15) * 0.15) * glowStrength
    for (let i = 0; i < patches.length; i++) {
      const lit = patches[i].planted ? 0 : pulse
      glowColors[i * 3 + 0] = glowColor.r * lit
      glowColors[i * 3 + 1] = glowColor.g * lit
      glowColors[i * 3 + 2] = glowColor.b * lit
    }
    glowGeometry.attributes.color.needsUpdate = true
  }

  /** Nearest plantable patch to a tap ray, using the same generous rule as pickups. */
  function pick(raycaster) {
    if (!state || state.seedsHeld <= 0) return null // Inert without a seed.
    let best = null
    let bestDistance = TAP_RADIUS * TAP_RADIUS
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i]
      if (patch.planted) continue
      const d = raycaster.ray.distanceSqToPoint(patch.pos)
      if (d < bestDistance) {
        bestDistance = d
        best = patch
      }
    }
    return best
  }

  return {
    update,
    patches,

    /** True only when a tap here would actually plant something. */
    hitTest(raycaster) {
      return pick(raycaster) !== null
    },

    plantAt(raycaster) {
      const patch = pick(raycaster)
      return patch ? plant(patch) : false
    },
  }
}
