import * as THREE from 'three'
import { getSoftDotTexture } from './softdot.js'
import { makeRandom } from './terrain.js'

/**
 * The day/night cycle.
 *
 * Every colour and intensity in the scene comes out of ONE keyframe table, so
 * the sky, the fog, the sun and the ambient fill can never drift out of step
 * with each other. That is the whole reason this is a table rather than a set
 * of independent sine waves: the mood breaks the moment one of them lags.
 *
 * No lights are created or destroyed here. The single directional light that
 * Phase 1 built is simply moved and recoloured — it is the sun by day and the
 * moon by night, which is also why the moon rises exactly as the sun sets.
 */

export const CYCLE_SECONDS = 420 // 7 minutes end to end. Tune after watching her.
const START_T = 0.66 // Open in golden hour: prettiest first impression, night soon after.

const STAR_COUNT = 420
const STAR_RADIUS = 380 // Inside the sky dome at 400.
const TAU = Math.PI * 2

/**
 * The whole mood of the game, as a timeline.
 *
 * `t` runs 0..1 where 0 is midnight, 0.25 sunrise, 0.5 midday, 0.75 sunset.
 * Golden hour gets three closely-spaced stops either side of 0.66 so the warm
 * light lingers instead of flicking past — it is the best-looking minute in the
 * cycle and it earns the extra keyframes.
 */
const STOPS = [
  { t: 0.00, skyTop: 0x0d1330, skyHorizon: 0x2a3566, fog: 0x232d5c, sun: 0xcfd8ff, sunI: 1.30, hemiSky: 0x5a68a8, hemiGround: 0x2c4234, hemiI: 0.85, stars: 1.00, night: 1.00 },
  { t: 0.16, skyTop: 0x1c2450, skyHorizon: 0x5f5788, fog: 0x424268, sun: 0xd8dcff, sunI: 1.05, hemiSky: 0x6b6ba0, hemiGround: 0x334229, hemiI: 0.92, stars: 0.62, night: 0.80 },
  { t: 0.25, skyTop: 0x3d4a86, skyHorizon: 0xff9e6b, fog: 0xa8767f, sun: 0xffb070, sunI: 1.75, hemiSky: 0x9a8fc0, hemiGround: 0x4a5238, hemiI: 1.12, stars: 0.05, night: 0.28 },
  { t: 0.34, skyTop: 0x6d8fd0, skyHorizon: 0xffcf94, fog: 0xcdb096, sun: 0xffd3a0, sunI: 2.30, hemiSky: 0xb6c8e8, hemiGround: 0x5c6b42, hemiI: 1.24, stars: 0.00, night: 0.05 },
  { t: 0.50, skyTop: 0x6ea3e0, skyHorizon: 0xbcd8f2, fog: 0xa9c4dd, sun: 0xfff4dd, sunI: 2.55, hemiSky: 0xcfe2f7, hemiGround: 0x6a7f4d, hemiI: 1.35, stars: 0.00, night: 0.00 },
  // Golden hour. The hemisphere light goes WARM here, not just the sun: with the
  // sun grazing the meadow at a shallow angle the ground catches very little
  // direct light, so if the ambient stays cool the whole field reads as mud.
  // Warm ambient is also what real golden hour actually looks like.
  { t: 0.60, skyTop: 0x7c9ad8, skyHorizon: 0xffd7a2, fog: 0xd0b697, sun: 0xffcb8c, sunI: 2.60, hemiSky: 0xe3d3c4, hemiGround: 0x6f6b45, hemiI: 1.34, stars: 0.00, night: 0.02 },
  { t: 0.66, skyTop: 0x7f93cf, skyHorizon: 0xffb877, fog: 0xd9a681, sun: 0xffb877, sunI: 2.70, hemiSky: 0xf0c9a2, hemiGround: 0x71643f, hemiI: 1.36, stars: 0.00, night: 0.05 },
  { t: 0.72, skyTop: 0x6a6fae, skyHorizon: 0xff9463, fog: 0xc08375, sun: 0xffa268, sunI: 2.50, hemiSky: 0xe8a983, hemiGround: 0x635634, hemiI: 1.28, stars: 0.02, night: 0.16 },
  { t: 0.78, skyTop: 0x454a8c, skyHorizon: 0xff7f5e, fog: 0x9c6673, sun: 0xff8756, sunI: 1.85, hemiSky: 0xc08a86, hemiGround: 0x53492f, hemiI: 1.10, stars: 0.22, night: 0.42 },
  { t: 0.86, skyTop: 0x23295c, skyHorizon: 0x6a5f95, fog: 0x4d4a7d, sun: 0xb9c4ff, sunI: 1.25, hemiSky: 0x6d70ad, hemiGround: 0x35462f, hemiI: 0.90, stars: 0.78, night: 0.82 },
  { t: 1.00, skyTop: 0x0d1330, skyHorizon: 0x2a3566, fog: 0x232d5c, sun: 0xcfd8ff, sunI: 1.30, hemiSky: 0x5a68a8, hemiGround: 0x2c4234, hemiI: 0.85, stars: 1.00, night: 1.00 },
]

// Pre-built Colors so sampling never allocates.
const KEYS = STOPS.map((s) => ({
  t: s.t,
  skyTop: new THREE.Color(s.skyTop),
  skyHorizon: new THREE.Color(s.skyHorizon),
  fog: new THREE.Color(s.fog),
  sun: new THREE.Color(s.sun),
  sunI: s.sunI,
  hemiSky: new THREE.Color(s.hemiSky),
  hemiGround: new THREE.Color(s.hemiGround),
  hemiI: s.hemiI,
  stars: s.stars,
  night: s.night,
}))

const smoothstep = (x) => x * x * (3 - 2 * x)

function createStarField(random) {
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  const base = new Float32Array(STAR_COUNT)
  const phase = new Float32Array(STAR_COUNT)

  for (let i = 0; i < STAR_COUNT; i++) {
    // Upper hemisphere only, and never right down at the horizon where the
    // meadow would cut through them.
    const y = 0.08 + random() * 0.92
    const ring = Math.sqrt(1 - y * y)
    const a = random() * TAU
    positions[i * 3 + 0] = Math.cos(a) * ring * STAR_RADIUS
    positions[i * 3 + 1] = y * STAR_RADIUS
    positions[i * 3 + 2] = Math.sin(a) * ring * STAR_RADIUS

    base[i] = 0.35 + random() * 0.65
    phase[i] = random() * TAU
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      // Fixed pixel size, not world size: a star 380 units away would otherwise
      // attenuate to nothing.
      sizeAttenuation: false,
      size: 4,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false, // Fog ends at 66 units; without this every star is grey soup.
    })
  )
  points.frustumCulled = false

  return { points, colors, base, phase, geometry }
}

export function createSkyCycle(scene, { skyMaterial, lights, fog }) {
  const random = makeRandom(31337)
  const stars = createStarField(random)
  scene.add(stars.points)

  const { hemi, moon: sun } = lights

  // Scratch, reused every frame.
  const cSkyTop = new THREE.Color()
  const cSkyHorizon = new THREE.Color()
  const cFog = new THREE.Color()
  const cSun = new THREE.Color()
  const cHemiSky = new THREE.Color()
  const cHemiGround = new THREE.Color()

  let t = START_T
  let night = 0
  let swell = 0 // Brief celebration boost, spiked by celebrate().

  function apply(elapsed) {
    // Find the bracketing keyframes. The table ends with a duplicate of the
    // first stop at t=1, so there is no wrap-around case to get wrong.
    let i = 0
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++
    const a = KEYS[i]
    const b = KEYS[i + 1]
    // Eased rather than linear, so the ramp has no visible corners at stops.
    const k = smoothstep(Math.min(Math.max((t - a.t) / (b.t - a.t), 0), 1))

    cSkyTop.copy(a.skyTop).lerp(b.skyTop, k)
    cSkyHorizon.copy(a.skyHorizon).lerp(b.skyHorizon, k)
    cFog.copy(a.fog).lerp(b.fog, k)
    cSun.copy(a.sun).lerp(b.sun, k)
    cHemiSky.copy(a.hemiSky).lerp(b.hemiSky, k)
    cHemiGround.copy(a.hemiGround).lerp(b.hemiGround, k)

    const sunI = a.sunI + (b.sunI - a.sunI) * k
    const hemiI = a.hemiI + (b.hemiI - a.hemiI) * k
    const starOpacity = a.stars + (b.stars - a.stars) * k
    night = a.night + (b.night - a.night) * k

    skyMaterial.uniforms.topColor.value.copy(cSkyTop)
    skyMaterial.uniforms.horizonColor.value.copy(cSkyHorizon)
    if (fog) fog.color.copy(cFog)

    sun.color.copy(cSun)
    // The swell brightens everything briefly when a constellation arrives.
    sun.intensity = sunI * (1 + swell * 0.35)
    hemi.color.copy(cHemiSky)
    hemi.groundColor.copy(cHemiGround)
    hemi.intensity = hemiI * (1 + swell * 0.5)

    // --- Where the light comes from ---------------------------------------
    // t=0.25 is sunrise, so shifting by a quarter turn puts elevation at zero
    // there and at its peak at midday.
    const angle = (t - 0.25) * TAU
    const elevation = Math.sin(angle)
    const horizontal = Math.cos(angle)

    // Below the horizon the sun becomes the moon: the same arc, mirrored. That
    // is also physically what a full moon does, which is a happy accident.
    const daytime = elevation >= 0
    const sign = daytime ? 1 : -1
    // Never let the light lie fully flat. Two reasons: a truly horizontal light
    // throws shadows far past the shadow camera's box and they clip visibly,
    // and a meadow lit edge-on receives almost nothing and goes muddy. This is
    // still shallow enough to read as sidelong.
    const y = Math.max(Math.abs(elevation), 0.32)
    sun.position.set(sign * horizontal * 0.92 * 45, y * 45, (sign * 0.36 + 0.1) * 45)

    // --- Stars -------------------------------------------------------------
    stars.points.material.opacity = starOpacity
    if (starOpacity > 0.01) {
      const c = stars.colors
      for (let s = 0; s < STAR_COUNT; s++) {
        // Slow, per-star twinkle. Never drops far — stars should shimmer, not blink.
        const twinkle = stars.base[s] * (0.78 + 0.22 * Math.sin(elapsed * 1.3 + stars.phase[s]))
        c[s * 3 + 0] = twinkle
        c[s * 3 + 1] = twinkle
        c[s * 3 + 2] = twinkle
      }
      stars.geometry.attributes.color.needsUpdate = true
    }
  }

  apply(0)

  return {
    update(dt, elapsed) {
      t = (t + dt / CYCLE_SECONDS) % 1
      swell = Math.max(0, swell - dt * 0.7) // ~1.4s falloff.
      apply(elapsed)
    },

    /** 0 in daylight, 1 at midnight. Glows ride this so they suit every hour. */
    get night() {
      return night
    },

    /** Position in the cycle, 0..1. Exposed for testing and for tuning. */
    get time() {
      return t
    },
    setTime(value) {
      t = ((value % 1) + 1) % 1
    },

    /** Soft swell of light across the whole garden. */
    celebrate() {
      swell = 1
    },
  }
}
