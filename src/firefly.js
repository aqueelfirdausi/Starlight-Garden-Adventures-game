import * as THREE from 'three'
import { groundHeightAt, MEADOW_RADIUS } from './terrain.js'
import { createBody, createTrail, HALO, HALO_SCALE, TRAIL_POINTS, WARM } from './fireflyparts.js'

/**
 * The player: a warm gold orb with a soft halo and a short wisp of light behind it.
 *
 * Movement is deliberately heavy and slippery — acceleration in, exponential drag
 * out — so it coasts to a stop rather than stopping dead. The brief was "moving
 * something through warm water" and every constant below is tuned for that.
 *
 * What she is built from lives in fireflyparts.js; this file is only how she moves.
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

// Spacing between trail samples, in world units rather than seconds. See the
// sampling loop in update() for why this is not a timer.
const TRAIL_MIN_STEP = 0.085

const PULSE_DECAY = 1.7 // ~0.6s for the collection flare to fall away.

// High-contrast mode. She is the thing a child's eye has to track across a
// whole meadow, so this is the largest boost of any of the contrast targets.
const CONTRAST_GLOW = 0.45 // Extra fraction on the sprite opacities.
const CONTRAST_LAMP = 0.75 // Extra fraction on the point light.
const CONTRAST_EASE = 3.5 // Toggling is a fade, not a switch. Nothing here snaps.

export function createFirefly(scene) {
  const position = new THREE.Vector3(0, groundHeightAt(0, 0) + 3.5, 6)
  const velocity = new THREE.Vector3()

  const body = createBody()
  const trail = createTrail(position)
  scene.add(body.group, trail.points)

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

  // 0..1 eased toward contrastTarget, so switching high contrast on mid-flight
  // reads as the meadow brightening rather than as a light being flicked.
  let contrast = 0
  let contrastTarget = 0

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

    contrast += (contrastTarget - contrast) * (1 - Math.exp(-CONTRAST_EASE * dt))

    // Never scaled to zero: she is the player, and must stay findable at noon.
    const glowScale = (0.38 + 0.62 * night) * (1 + contrast * CONTRAST_GLOW)
    // The lamp goes much further down — a point light on the grass in daylight
    // does nothing but wash out the colour it lands on.
    const lampScale = (0.12 + 0.88 * night) * (1 + contrast * CONTRAST_LAMP)

    body.inner.material.opacity = (glow + flare * 0.3) * glowScale
    body.outer.material.opacity = (0.2 + Math.min(speed / 8, 1) * 0.12 + flare * 0.26) * glowScale
    // Halo swells with the flare, and sits wider in high contrast so the shape
    // she is chasing is bigger, not just brighter.
    body.outer.scale.setScalar(HALO_SCALE + flare * 2.1 + contrast * 0.9)
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
      trail.push(lastSample.x, lastSample.y, lastSample.z)
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

    /** High-contrast mode: a stronger, wider glow and a much brighter lamp. */
    setContrast(on) {
      contrastTarget = on ? 1 : 0
    },
  }
}
