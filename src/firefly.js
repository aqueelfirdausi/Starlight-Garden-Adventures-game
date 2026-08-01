import * as THREE from 'three'
import { getSoftDotTexture } from './softdot.js'
import { groundHeightAt, MEADOW_RADIUS } from './terrain.js'

/**
 * The player: a warm gold orb with a soft halo and a short wisp of light behind it.
 *
 * Movement is deliberately heavy and slippery — acceleration in, exponential drag
 * out — so it coasts to a stop rather than stopping dead. The brief was "moving
 * something through warm water" and every constant below is tuned for that.
 */

const ACCEL = 20 // Horizontal push from a fully extended drag.
const DRAG = 1.6 // Higher = stops sooner. This is the "warm water" number.
const RISE_ACCEL = 15
const SINK_ACCEL = 5.5 // Well under gravity — she drifts down, never drops.
const VERTICAL_DRAG = 1.5

const GROUND_CLEARANCE = 1.2
const CEILING = 12
const BOUNDS_PUSH = 6 // How firmly the invisible edge nudges her back.

// Floor and ceiling are springs with their own damping, tuned to roughly
// critical (damp ≈ 2·√spring). Underdamped values let her bob through the grass
// before settling, which looks like a bug to anyone watching.
const FLOOR_SPRING = 60
const FLOOR_DAMP = 15.5
const CEILING_SPRING = 18
const CEILING_DAMP = 8.5

const TRAIL_POINTS = 48
// Spacing between trail samples, in world units rather than seconds. See the
// sampling loop in update() for why this is not a timer.
const TRAIL_MIN_STEP = 0.085

// Deeply saturated amber rather than pale gold. Additive sprites stack toward
// white, so the base colour has to start well short of it to survive.
const GOLD = 0xffc247
const HALO = 0xffa53d
// Where the glow shifts to on collection — paler and warmer than the resting
// amber, so a pickup reads as a flare of warmth rather than just "brighter".
const WARM = 0xffe0ad
const PULSE_DECAY = 1.7 // ~0.6s for the flare to fall away.

function createBody() {
  const group = new THREE.Group()

  // Slightly egg-shaped rather than a ball: a sphere shows no rotation, so the
  // tilt-into-travel would be completely invisible on one.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 14, 10),
    new THREE.MeshBasicMaterial({ color: GOLD, fog: false })
  )
  core.scale.set(0.92, 0.82, 1.25)

  // Two stacked sprites fake a bloom falloff: a tight bright centre inside a
  // wide soft one. Real bloom is a post-process, which Phase 1 doesn't have.
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
  outer.scale.setScalar(3.4)

  // Unshadowed, as the budget requires. It exists so the grass lights up as she
  // passes, which is most of what sells her as a real light source.
  const lamp = new THREE.PointLight(HALO, 14, 16, 2)
  lamp.castShadow = false

  group.add(core, inner, outer, lamp)
  return { group, core, inner, outer, lamp }
}

function createTrail(startPosition) {
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
      opacity: 0, // Starts invisible; update() fades it in with speed.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  )
  points.frustumCulled = false // The ring spans space the bounding sphere lags behind.

  return { points, positions, colors, geometry }
}

export function createFirefly(scene) {
  const position = new THREE.Vector3(0, groundHeightAt(0, 0) + 3.5, 6)
  const velocity = new THREE.Vector3()

  const body = createBody()
  const trail = createTrail(position)
  scene.add(body.group, trail.points)

  const baseColor = new THREE.Color(GOLD)
  let head = 0
  const lastSample = position.clone()

  // Smoothed rotation targets — applied gradually so she banks, never snaps.
  let yaw = 0
  let pitch = 0
  let roll = 0
  let lastYaw = 0

  const tmp = new THREE.Vector3()

  // 0..1, spiked by pulse() when something is collected and decaying every frame.
  let warmPulse = 0
  const haloColor = new THREE.Color(HALO)
  const warmColor = new THREE.Color(WARM)

  function pushTrailSample(x, y, z) {
    head = (head + 1) % TRAIL_POINTS
    trail.positions[head * 3 + 0] = x
    trail.positions[head * 3 + 1] = y
    trail.positions[head * 3 + 2] = z

    // Repaint the fade so the newest sample is brightest. 48 points is small
    // enough that rewriting all of them beats any cleverness.
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const age = ((head - i + TRAIL_POINTS) % TRAIL_POINTS) / TRAIL_POINTS
      const fade = (1 - age) * (1 - age) * 0.95
      trail.colors[i * 3 + 0] = baseColor.r * fade
      trail.colors[i * 3 + 1] = baseColor.g * fade
      trail.colors[i * 3 + 2] = baseColor.b * fade
    }

    trail.geometry.attributes.position.needsUpdate = true
    trail.geometry.attributes.color.needsUpdate = true
  }

  /**
   * @param {number} dt      seconds since last frame
   * @param {number} elapsed seconds since start, for the idle bob
   * @param {{steerX:number, steerY:number, rise:boolean}} input
   *        steerX/steerY are screen-space, -1..1, Y positive = up the screen.
   * @param {number} night 0 by day, 1 at midnight. Additive glow over a bright
   *        sky just reads as haze, so the halo and the lamp both ride this
   *        rather than being tuned once for one time of day.
   */
  function update(dt, elapsed, input, night = 1) {
    // Screen-space drag maps straight to world axes because the camera never
    // rotates — up the screen is always "away", which stays true as she turns.
    velocity.x += input.steerX * ACCEL * dt
    velocity.z += -input.steerY * ACCEL * dt

    velocity.y += (input.rise ? RISE_ACCEL : -SINK_ACCEL) * dt

    // Soft radial bound: a spring that only switches on past the edge, so she
    // is turned around by the meadow rather than stopped by a wall.
    const distance = Math.hypot(position.x, position.z)
    if (distance > MEADOW_RADIUS) {
      const over = distance - MEADOW_RADIUS
      const strength = Math.min(over, 6) * BOUNDS_PUSH * dt
      velocity.x -= (position.x / distance) * strength
      velocity.z -= (position.z / distance) * strength
    }

    // Same idea vertically, against the grass and against an invisible ceiling.
    const ground = groundHeightAt(position.x, position.z)
    const floor = ground + GROUND_CLEARANCE
    if (position.y < floor) {
      // The damping term is why she cushions onto her hover height instead of
      // dipping through the grass and bouncing back out of it.
      const penetration = Math.min(floor - position.y, 4)
      velocity.y += (penetration * FLOOR_SPRING - velocity.y * FLOOR_DAMP) * dt
    }
    const ceiling = ground + CEILING
    if (position.y > ceiling) {
      const overshoot = Math.min(position.y - ceiling, 4)
      velocity.y -= (overshoot * CEILING_SPRING + velocity.y * CEILING_DAMP) * dt
    }

    // Exponential damping is frame-rate independent, unlike v *= 0.95.
    const horizontalDamp = Math.exp(-DRAG * dt)
    velocity.x *= horizontalDamp
    velocity.z *= horizontalDamp
    velocity.y *= Math.exp(-VERTICAL_DRAG * dt)

    position.addScaledVector(velocity, dt)

    // --- Presentation ------------------------------------------------------
    const speed = Math.hypot(velocity.x, velocity.z)

    // Bob fades out as she gets going, so it reads as hovering, not wobbling.
    const bobAmount = 0.14 * (1 - Math.min(speed / 6, 1) * 0.8)
    const bob = Math.sin(elapsed * 1.7) * bobAmount

    body.group.position.set(position.x, position.y + bob, position.z)

    // Only re-aim when actually moving; below the threshold the heading from a
    // near-zero velocity is just noise and she would spin on the spot.
    if (speed > 0.35) {
      const targetYaw = Math.atan2(velocity.x, velocity.z)
      // Shortest way round, so crossing the -PI/PI seam doesn't whip her about.
      let delta = targetYaw - yaw
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      yaw += delta * (1 - Math.exp(-6 * dt))
    }

    const targetPitch = THREE.MathUtils.clamp(-velocity.y * 0.09, -0.3, 0.3)
    pitch += (targetPitch - pitch) * (1 - Math.exp(-5 * dt))

    // Bank out of how fast the heading itself is changing — that is what makes
    // a turn look like a turn.
    const yawRate = dt > 0 ? (yaw - lastYaw) / dt : 0
    lastYaw = yaw
    const targetRoll = THREE.MathUtils.clamp(-yawRate * 0.22, -0.45, 0.45)
    roll += (targetRoll - roll) * (1 - Math.exp(-4 * dt))

    body.group.rotation.set(pitch, yaw, roll)

    // Brighten slightly with speed — a moving firefly should feel more alive.
    // Kept below 1 on purpose: two stacked additive sprites over a bright core
    // clip straight to white through the tone mapper, and she stops looking gold.
    const glow = 0.55 + Math.min(speed / 8, 1) * 0.18

    // Collection flare. Squared so it falls off softly rather than switching off.
    warmPulse = Math.max(0, warmPulse - PULSE_DECAY * dt)
    const flare = warmPulse * warmPulse

    // Never scaled to zero: she is the player, and must stay findable at noon.
    const glowScale = 0.38 + 0.62 * night
    // The lamp goes much further down — a point light on the grass in daylight
    // does nothing but wash out the colour it lands on.
    const lampScale = 0.12 + 0.88 * night

    body.inner.material.opacity = (glow + flare * 0.3) * glowScale
    body.outer.material.opacity = (0.2 + Math.min(speed / 8, 1) * 0.12 + flare * 0.26) * glowScale
    body.outer.scale.setScalar(3.4 + flare * 2.1) // Halo swells with the flare.
    body.lamp.intensity = (12 + Math.min(speed / 8, 1) * 6 + flare * 20) * lampScale
    body.lamp.color.copy(haloColor).lerp(warmColor, flare)

    // Sample by DISTANCE, not by time. On a timer, hovering stacks all 48 points
    // on one spot and 48 coincident additive sprites blow the core out to white.
    // Stepping by distance also fixes the wisp's length in world units, so it
    // looks identical at 30fps and 60.
    tmp.copy(body.group.position)
    let guard = 0
    let gap = lastSample.distanceTo(tmp)
    while (gap >= TRAIL_MIN_STEP && guard++ < TRAIL_POINTS) {
      lastSample.lerp(tmp, TRAIL_MIN_STEP / gap) // Advance exactly one step along the path.
      pushTrailSample(lastSample.x, lastSample.y, lastSample.z)
      gap = lastSample.distanceTo(tmp)
    }

    // Fade the whole wisp out when she settles, so a frozen streak doesn't hang
    // in the air behind a hovering firefly.
    const target = THREE.MathUtils.clamp(velocity.length() / 2.5, 0, 1) * glowScale
    const material = trail.points.material
    material.opacity += (target - material.opacity) * (1 - Math.exp(-3 * dt))
  }

  return {
    group: body.group,
    position,
    velocity,
    update,

    /** Flare the glow warmer. Called when something is collected. */
    pulse() {
      warmPulse = 1
    },
  }
}
