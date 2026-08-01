/**
 * A flower creature's life, as a small state machine: sprout, open, wave, idle.
 *
 * Split out of flowers.js, which is now only about where the parts of a flower
 * go in space. Nothing in here touches three.js — it is pure timing, so the
 * feel of a bloom can be retuned without reading a line of matrix maths.
 *
 * The bloom is the emotional centre of the game, so it is deliberately slow —
 * about two seconds from dirt to open face, with every curve eased. Nothing
 * here is allowed to be linear, because linear reads as a spawn rather than
 * something growing.
 */

const SPROUT_TIME = 0.85 // Stem pushes up.
const OPEN_TIME = 1.15 // Petals unfurl. Together: ~2s to a full face.
const WAVE_TIME = 1.5 // The hello.

const BLINK_TIME = 0.17
const BLINK_MIN = 2.6
const BLINK_MAX = 7.5

export const SPROUT = 0
export const OPEN = 1
export const WAVE = 2
export const IDLE = 3

// Nothing linear. Cubic out for growth, a little overshoot for the petals.
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t) => {
  const s = 1.15 // Gentle. Any more and the opening snaps, which the game never does.
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)
}

/** The mutable fields a flower needs to run its own life. Spread into it at plant time. */
export function createLife() {
  return {
    stage: SPROUT,
    t: 0,
    blinkIn: BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN),
    blinking: false,
    blinkT: 0,
    // Set true the frame the face finishes opening, so the caller can fire the
    // bloom burst once it knows where the head actually ended up.
    pendingBloom: false,
  }
}

/**
 * Advance one flower's stage machine.
 * @returns {{growth:number, openness:number, headScale:number, lean:number,
 *            waveSway:number, wave:number}} this frame's animation values
 */
export function advance(flower, dt) {
  flower.t += dt
  let growth = 1
  let openness = 1
  let headScale = 1
  let lean = 0
  let waveSway = 0
  let wave = 0 // 0..1 envelope, also drives how wide the smile opens.

  if (flower.stage === SPROUT) {
    const t = Math.min(flower.t / SPROUT_TIME, 1)
    growth = easeOutCubic(t)
    openness = 0
    headScale = 0.22 * growth // A tight bud riding up on the stem.
    if (t >= 1) {
      flower.stage = OPEN
      flower.t = 0
    }
  } else if (flower.stage === OPEN) {
    const t = Math.min(flower.t / OPEN_TIME, 1)
    openness = easeOutBack(t)
    headScale = 0.22 + 0.78 * easeOutCubic(t)
    if (t >= 1) {
      flower.stage = WAVE
      flower.t = 0
      flower.pendingBloom = true // Burst fires once the head position is known.
    }
  } else if (flower.stage === WAVE) {
    const t = Math.min(flower.t / WAVE_TIME, 1)
    // One rise-and-fall envelope, with a slower rock inside it. Reads as a
    // lean toward her and a wave, not a wobble.
    const envelope = Math.sin(t * Math.PI)
    wave = envelope // Rises and returns to 0, so the smile eases back on its own.
    lean = envelope * 0.3
    waveSway = Math.sin(t * Math.PI * 3) * envelope * 0.15
    if (t >= 1) {
      flower.stage = IDLE
      flower.t = 0
    }
  }

  return { growth, openness, headScale, lean, waveSway, wave }
}

/** How open the eyes are this frame, 0..1. Also schedules the next blink. */
export function blinkFactor(flower, dt) {
  // Eyes only exist once the face is open.
  if (flower.stage === SPROUT || flower.stage === OPEN) return 0

  if (flower.blinking) {
    flower.blinkT += dt
    const t = flower.blinkT / BLINK_TIME
    if (t >= 1) {
      flower.blinking = false
      flower.blinkT = 0
      flower.blinkIn = BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN)
      return 1
    }
    // Down and back up. Never fully zero, so the eye stays a thin line.
    return Math.max(t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2, 0.08)
  }

  flower.blinkIn -= dt
  if (flower.blinkIn <= 0) {
    flower.blinking = true
    flower.blinkT = 0
  }
  return 1
}
