import * as THREE from 'three'
import { getSoftDotTexture } from './softdot.js'

/**
 * What the firefly is MADE of: geometry, materials, and the trail buffer.
 *
 * Split out of firefly.js the same way flowerparts.js was split out of
 * flowers.js, so that file can be about how she flies without fifty lines of
 * sprite setup sitting in the middle of it. Nothing here reads input or knows
 * about time — it is all construction.
 */

// Deeply saturated amber rather than pale gold. Additive sprites stack toward
// white, so the base colour has to start well short of it to survive.
export const GOLD = 0xffc247
export const HALO = 0xffa53d
// Where the glow shifts to on collection — paler and warmer than the resting
// amber, so a pickup reads as a flare of warmth rather than just "brighter".
export const WARM = 0xffe0ad

// Resting size of the outer halo sprite. firefly.js swells past this on a
// collection flare, so both files need the same starting number.
export const HALO_SCALE = 3.4

export const TRAIL_POINTS = 48

export function createBody() {
  const group = new THREE.Group()

  // Slightly egg-shaped rather than a ball: a sphere shows no rotation, so the
  // tilt-into-travel would be completely invisible on one.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 14, 10),
    new THREE.MeshBasicMaterial({ color: GOLD, fog: false })
  )
  core.scale.set(0.92, 0.82, 1.25)

  // Two stacked sprites fake a bloom falloff: a tight bright centre inside a
  // wide soft one. Real bloom is a post-process, which the game doesn't have.
  const texture = getSoftDotTexture()
  const inner = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: GOLD,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  )
  inner.scale.setScalar(1.5)

  const outer = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: HALO,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  )
  outer.scale.setScalar(HALO_SCALE)

  // Unshadowed, as the budget requires. It exists so the grass lights up as she
  // passes, which is most of what sells her as a real light source.
  const lamp = new THREE.PointLight(HALO, 14, 16, 2)
  lamp.castShadow = false

  group.add(core, inner, outer, lamp)
  return { group, core, inner, outer, lamp }
}

/**
 * The wisp of light behind her: a fixed ring of points that is written to in
 * place, so the trail never allocates after startup.
 *
 * @param {THREE.Vector3} startPosition where to seed every slot
 * @returns {{points: THREE.Points, push: (x:number, y:number, z:number) => void}}
 */
export function createTrail(startPosition) {
  const positions = new Float32Array(TRAIL_POINTS * 3)
  const colors = new Float32Array(TRAIL_POINTS * 3)

  // Seed the whole ring at the spawn point, otherwise every unused slot sits at
  // the world origin and the first frame shows a bright streak to nowhere.
  for (let i = 0; i < TRAIL_POINTS; i++) {
    positions[i * 3 + 0] = startPosition.x
    positions[i * 3 + 1] = startPosition.y
    positions[i * 3 + 2] = startPosition.z
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      size: 0.44,
      sizeAttenuation: true,
      vertexColors: true, // Per-point fade — PointsMaterial has no per-point size.
      transparent: true,
      opacity: 0, // Starts invisible; firefly.js fades it in with speed.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  )
  points.frustumCulled = false // The ring spans space the bounding sphere lags behind.

  const baseColor = new THREE.Color(GOLD)
  let head = 0

  return {
    points,

    /** Add one sample at the head of the ring and repaint the fade behind it. */
    push(x, y, z) {
      head = (head + 1) % TRAIL_POINTS
      positions[head * 3 + 0] = x
      positions[head * 3 + 1] = y
      positions[head * 3 + 2] = z

      // Repaint the fade so the newest sample is brightest. 48 points is small
      // enough that rewriting all of them beats any cleverness.
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const age = ((head - i + TRAIL_POINTS) % TRAIL_POINTS) / TRAIL_POINTS
        const fade = (1 - age) * (1 - age) * 0.95
        colors[i * 3 + 0] = baseColor.r * fade
        colors[i * 3 + 1] = baseColor.g * fade
        colors[i * 3 + 2] = baseColor.b * fade
      }

      geometry.attributes.position.needsUpdate = true
      geometry.attributes.color.needsUpdate = true
    },
  }
}
