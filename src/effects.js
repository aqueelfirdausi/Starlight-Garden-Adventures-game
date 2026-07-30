import * as THREE from 'three'
import { getSoftDotTexture } from './softdot.js'

/**
 * The reward moment: a soft particle burst when something is collected.
 *
 * ONE pooled Points system handles every burst in the game. Nothing is ever
 * allocated during play — a `new` inside a collection handler is exactly the
 * kind of thing that causes a garbage-collection hitch, and a hitch at the
 * moment of reward is the worst possible time for one.
 */

const MAX_PARTICLES = 260 // ~14 simultaneous bursts before the ring wraps.
const PER_BURST = 18

const SPEED_MIN = 1.4
const SPEED_MAX = 3.2
const LIFE_MIN = 0.65
const LIFE_MAX = 1.15
const DRAG = 2.4 // Particles slow as they spread, so the burst blooms and settles.
const SINK = 1.1 // A touch of gravity so the spray drifts down as it fades.

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3)
  const colors = new Float32Array(MAX_PARTICLES * 3)
  const velocities = new Float32Array(MAX_PARTICLES * 3)
  const baseColors = new Float32Array(MAX_PARTICLES * 3)
  const life = new Float32Array(MAX_PARTICLES)
  const maxLife = new Float32Array(MAX_PARTICLES)

  // Every particle starts dead. Colour 0 with additive blending contributes
  // nothing, so dead slots are invisible without needing to be moved away.
  life.fill(1)
  maxLife.fill(1)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      size: 0.42,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false, // Additive sparks must not occlude each other.
      fog: false,
    })
  )
  points.frustumCulled = false // Bursts happen anywhere; the bounds would lag.
  scene.add(points)

  let cursor = 0
  let alive = 0
  const scratch = new THREE.Color()

  /**
   * Spray particles outward from a point.
   * @param {THREE.Vector3} origin
   * @param {number} colorHex tint for this burst, usually the item's own colour
   */
  function burst(origin, colorHex) {
    scratch.setHex(colorHex)

    for (let i = 0; i < PER_BURST; i++) {
      const index = cursor
      cursor = (cursor + 1) % MAX_PARTICLES
      if (life[index] >= maxLife[index]) alive++ // Was dead, now reused.

      const p = index * 3
      positions[p + 0] = origin.x
      positions[p + 1] = origin.y
      positions[p + 2] = origin.z

      // Even spread over a sphere. Using raw random angles instead of this
      // acos() clusters particles at the poles and the burst looks lopsided.
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)

      velocities[p + 0] = Math.sin(phi) * Math.cos(theta) * speed
      // Biased upward so the spray lifts before it settles, rather than
      // spraying evenly like something broke.
      velocities[p + 1] = Math.cos(phi) * speed * 0.7 + 1.1
      velocities[p + 2] = Math.sin(phi) * Math.sin(theta) * speed

      baseColors[p + 0] = scratch.r
      baseColors[p + 1] = scratch.g
      baseColors[p + 2] = scratch.b

      life[index] = 0
      maxLife[index] = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN)
    }
  }

  function update(dt) {
    if (alive === 0) return // Nothing burning; skip the whole buffer walk.

    const damp = Math.exp(-DRAG * dt)
    let stillAlive = 0

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] >= maxLife[i]) continue

      life[i] += dt
      const p = i * 3

      if (life[i] >= maxLife[i]) {
        // Just died — blank the colour so the slot stops drawing.
        colors[p + 0] = 0
        colors[p + 1] = 0
        colors[p + 2] = 0
        continue
      }

      velocities[p + 1] -= SINK * dt
      velocities[p + 0] *= damp
      velocities[p + 1] *= damp
      velocities[p + 2] *= damp

      positions[p + 0] += velocities[p + 0] * dt
      positions[p + 1] += velocities[p + 1] * dt
      positions[p + 2] += velocities[p + 2] * dt

      // Squared fade: holds bright briefly, then drops away quickly. A linear
      // fade reads as the spark dimming evenly, which looks mechanical.
      const remaining = 1 - life[i] / maxLife[i]
      const fade = remaining * remaining
      colors[p + 0] = baseColors[p + 0] * fade
      colors[p + 1] = baseColors[p + 1] * fade
      colors[p + 2] = baseColors[p + 2] * fade

      stillAlive++
    }

    alive = stillAlive
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  return { burst, update, points }
}
