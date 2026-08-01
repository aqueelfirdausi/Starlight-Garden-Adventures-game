import * as THREE from 'three'
import { COLORS } from './palette.js'
import { getSoftDotTexture } from './softdot.js'

/**
 * What the two collectibles are made of: geometry and materials only.
 *
 * Split out from collectibles.js so that file can be about behaviour —
 * spawning, collecting, respawning — without 100 lines of vertex maths in the
 * middle of it.
 */

/**
 * A leaf: a sphere squashed flat and tapered to a soft point at each end.
 *
 * Two things here are easy to get wrong. The outline in the XZ plane comes from
 * the sphere's WIDTH segments, so a coarse count renders a visible hexagon
 * instead of a leaf. And the taper is clamped just above zero — letting it
 * reach zero collapses the pole triangles to zero area and
 * computeVertexNormals() hands back NaNs.
 */
export function createPetalGeometry() {
  const geometry = new THREE.SphereGeometry(0.5, 18, 8)
  const position = geometry.attributes.position

  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i)
    const t = z + 0.5 // 0..1 from one tip to the other
    const taper = Math.max(Math.pow(Math.sin(t * Math.PI), 0.65), 0.08)
    // Width must stay well under length or the "leaf" is just a rounded square.
    // Final proportions are roughly 0.28 wide x 0.09 thick x 0.62 long.
    position.setX(i, position.getX(i) * 0.28 * taper)
    position.setY(i, position.getY(i) * 0.09 * taper)
    position.setZ(i, z * 0.62)
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

export function createPetalMesh(count) {
  const mesh = new THREE.InstancedMesh(
    createPetalGeometry(),
    new THREE.MeshStandardMaterial({
      color: COLORS.petal,
      emissive: new THREE.Color(COLORS.petalEmissive),
      emissiveIntensity: 0.25, // Just enough to catch the eye without glowing.
      roughness: 0.45,
      metalness: 0,
      side: THREE.DoubleSide, // A petal seen edge-on must not vanish.
    }),
    count
  )
  mesh.castShadow = false
  mesh.frustumCulled = false // Instances roam well outside the initial bounds.
  return mesh
}

export function createSeedMesh(count) {
  // A rounded pod: a small sphere pulled slightly tall. No edges anywhere.
  const geometry = new THREE.SphereGeometry(0.115, 10, 8)
  geometry.scale(1, 1.32, 1)

  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: COLORS.seed,
      emissive: new THREE.Color(COLORS.seedEmissive),
      // Enough to read as lit from within, but low enough that the moonlight
      // still shapes the pod. Higher and it flattens into a pink sticker.
      emissiveIntensity: 0.45,
      roughness: 0.55,
      metalness: 0,
    }),
    count
  )
  mesh.castShadow = false
  mesh.frustumCulled = false
  return mesh
}

/**
 * One shared halo layer for every seed, on the same soft-dot texture as the
 * firefly and the mushrooms. Returns the buffer so the caller can move the
 * halos each frame without touching three's object graph.
 */
export function createSeedGlow(count) {
  const positions = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      color: COLORS.seedGlow,
      size: 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false, // Additive glows must never occlude each other.
      fog: true,
    })
  )
  points.frustumCulled = false

  return { points, positions, geometry }
}

/**
 * How a pickup looks in high-contrast mode.
 *
 * Emissive does the heavy lifting rather than the base colour. A petal lit only
 * by moonlight sits in the same tonal band as the grass around it, and no
 * amount of recolouring separates the two until it starts emitting light of its
 * own — which is also why the seed's halo grows rather than just brightening.
 *
 * Six material writes on a toggle and nothing per frame: every petal shares one
 * material and every seed shares another, so all 40 pickups change at once.
 */
const NORMAL_LOOK = {
  petal: COLORS.petal,
  petalEmissive: 0.25,
  seed: COLORS.seed,
  seedEmissive: 0.45,
  glowOpacity: 0.5,
  glowSize: 0.5,
}
const CONTRAST_LOOK = {
  petal: COLORS.petalHi,
  petalEmissive: 0.95,
  seed: COLORS.seedHi,
  seedEmissive: 1.15,
  glowOpacity: 0.9,
  glowSize: 0.72,
}

export function setPickupContrast({ petals, seeds, glow }, on) {
  const look = on ? CONTRAST_LOOK : NORMAL_LOOK
  petals.material.color.setHex(look.petal)
  petals.material.emissiveIntensity = look.petalEmissive
  seeds.material.color.setHex(look.seed)
  seeds.material.emissiveIntensity = look.seedEmissive
  glow.points.material.opacity = look.glowOpacity
  glow.points.material.size = look.glowSize
}
