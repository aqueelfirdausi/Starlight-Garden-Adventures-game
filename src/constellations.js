import * as THREE from 'three'
import { getSoftDotTexture } from './softdot.js'

/**
 * Constellations she earns by planting flowers.
 *
 * Each one sketches itself in, segment by segment, as though drawn by hand —
 * the second endpoint of each line creeps out from the first rather than the
 * line appearing whole. That is the difference between a drawing and a pop.
 *
 * Everything lives in two shared buffers (one Points, one LineSegments), so
 * four constellations cost two draw calls, not eight.
 */

export const FLOWERS_PER_CONSTELLATION = 3

const SKY_RADIUS = 300
const SKY_SCALE = 58 // How big a shape is on the sky, in world units.
const DRAW_SPEED = 1.8 // Segments per second. Slow enough to watch, fast enough to finish.
const POINT_FADE = 0.45 // How long a star takes to brighten once reached.
// Below this the sky is too bright to draw against, so a crossed threshold
// waits here until nightfall.
const NIGHT_ENOUGH = 0.55

const MAX_POINTS = 10
const MAX_SEGMENTS = 12

/**
 * Shapes in flat -1..1 space. Segments are listed in drawing order, and that
 * order is also the order the stars light up, so each shape should read as one
 * continuous stroke wherever possible.
 */
const SHAPES = [
  {
    name: 'flower',
    // Alternating long and short radii — that is what makes an outline read as
    // petals rather than as an octagon.
    points: [
      [0, 1], [0.4, 0.4], [1, 0], [0.4, -0.4],
      [0, -1], [-0.4, -0.4], [-1, 0], [-0.4, 0.4],
    ],
    segments: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]],
  },
  {
    name: 'butterfly',
    points: [
      [0, 0.55], [0, -0.5], // body
      [-0.9, 0.95], [-1.05, 0.1], [-0.7, -0.65], // left wing
      [0.9, 0.95], [1.05, 0.1], [0.7, -0.65], // right wing
    ],
    segments: [
      [0, 1],
      [0, 2], [2, 3], [3, 4], [4, 1],
      [0, 5], [5, 6], [6, 7], [7, 1],
    ],
  },
  {
    name: 'star',
    // A pentagram: five points, drawn by skipping every other one.
    points: [
      [0, 1], [0.951, 0.309], [0.588, -0.809], [-0.588, -0.809], [-0.951, 0.309],
    ],
    segments: [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]],
  },
  {
    name: 'cat',
    points: [
      [-0.85, 0.35], [-0.7, 1.0], [-0.3, 0.55], // left ear
      [0.3, 0.55], [0.7, 1.0], [0.85, 0.35], // right ear
      [0.6, -0.75], [0, -1.0], [-0.6, -0.75], // chin
    ],
    segments: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
      [5, 6], [6, 7], [7, 8], [8, 0],
    ],
  },
]

// Where each shape hangs. Spread around the sky so she has to look about, and
// kept well above the horizon so the meadow never cuts through one.
const PLACEMENTS = [
  { azimuth: 0.5, elevation: 0.62 },
  { azimuth: 2.1, elevation: 0.45 },
  { azimuth: 3.7, elevation: 0.70 },
  { azimuth: 5.1, elevation: 0.52 },
]

const COLOR = new THREE.Color(0xdfe6ff)

/** Project a shape's flat coordinates onto a patch of sky facing the origin. */
function placeShape(shape, placement) {
  const { azimuth, elevation } = placement
  const dir = new THREE.Vector3(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth)
  )
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize()
  const up = new THREE.Vector3().crossVectors(dir, right).normalize()

  return shape.points.map(([x, y]) =>
    new THREE.Vector3()
      .copy(dir)
      .multiplyScalar(SKY_RADIUS)
      .addScaledVector(right, x * SKY_SCALE)
      .addScaledVector(up, y * SKY_SCALE)
  )
}

export function createConstellations(scene, { state, onReveal } = {}) {
  const capacity = SHAPES.length

  const pointPositions = new Float32Array(capacity * MAX_POINTS * 3)
  const pointColors = new Float32Array(capacity * MAX_POINTS * 3)
  const linePositions = new Float32Array(capacity * MAX_SEGMENTS * 2 * 3)
  const lineColors = new Float32Array(capacity * MAX_SEGMENTS * 2 * 3)

  const pointGeometry = new THREE.BufferGeometry()
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3))
  pointGeometry.setAttribute('color', new THREE.BufferAttribute(pointColors, 3))

  const points = new THREE.Points(
    pointGeometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      sizeAttenuation: false,
      size: 11, // Deliberately larger than the background stars.
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  )

  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  )

  points.frustumCulled = false
  lines.frustumCulled = false
  scene.add(points, lines)

  // Build every shape's geometry up front; only the colours change at runtime.
  const built = SHAPES.map((shape, index) => {
    const worldPoints = placeShape(shape, PLACEMENTS[index])
    // A star lights when the segment that reaches it finishes. The first
    // segment's start point lights immediately.
    const litAt = new Array(shape.points.length).fill(Infinity)
    litAt[shape.segments[0][0]] = 0
    shape.segments.forEach(([, b], s) => {
      litAt[b] = Math.min(litAt[b], s + 1)
    })

    const base = index * MAX_POINTS
    worldPoints.forEach((p, i) => {
      pointPositions[(base + i) * 3 + 0] = p.x
      pointPositions[(base + i) * 3 + 1] = p.y
      pointPositions[(base + i) * 3 + 2] = p.z
    })

    return { shape, worldPoints, litAt, progress: 0, revealed: false, drawing: false }
  })
  pointGeometry.attributes.position.needsUpdate = true

  let revealedCount = 0

  function writeConstellation(entry, index, visibility) {
    const pBase = index * MAX_POINTS
    for (let i = 0; i < entry.shape.points.length; i++) {
      const since = entry.progress - entry.litAt[i]
      const lit = Math.min(Math.max(since / POINT_FADE, 0), 1)
      const v = lit * visibility
      pointColors[(pBase + i) * 3 + 0] = COLOR.r * v
      pointColors[(pBase + i) * 3 + 1] = COLOR.g * v
      pointColors[(pBase + i) * 3 + 2] = COLOR.b * v
    }

    const lBase = index * MAX_SEGMENTS * 2
    for (let s = 0; s < entry.shape.segments.length; s++) {
      const [ai, bi] = entry.shape.segments[s]
      const a = entry.worldPoints[ai]
      const b = entry.worldPoints[bi]
      // How far this segment has been drawn: 0 before its turn, 1 once done.
      const grow = Math.min(Math.max(entry.progress - s, 0), 1)

      const v0 = (lBase + s * 2) * 3
      const v1 = v0 + 3
      linePositions[v0 + 0] = a.x
      linePositions[v0 + 1] = a.y
      linePositions[v0 + 2] = a.z
      // The travelling end. This is what makes it look drawn rather than placed.
      linePositions[v1 + 0] = a.x + (b.x - a.x) * grow
      linePositions[v1 + 1] = a.y + (b.y - a.y) * grow
      linePositions[v1 + 2] = a.z + (b.z - a.z) * grow

      // Written out longhand: THREE.Color has no getComponent(), unlike Vector3,
      // and reaching for one throws inside the render loop every frame.
      const v = (grow > 0 ? 1 : 0) * visibility * 0.55
      lineColors[v0 + 0] = COLOR.r * v
      lineColors[v0 + 1] = COLOR.g * v
      lineColors[v0 + 2] = COLOR.b * v
      lineColors[v1 + 0] = COLOR.r * v
      lineColors[v1 + 1] = COLOR.g * v
      lineColors[v1 + 2] = COLOR.b * v
    }
  }

  function update(dt, night) {
    // Only proper night. A threshold crossed at noon simply waits here.
    const visibility = Math.min(Math.max((night - NIGHT_ENOUGH) / 0.3, 0), 1)

    const earned = state ? Math.floor(state.counts.flowers / FLOWERS_PER_CONSTELLATION) : 0
    const target = Math.min(earned, capacity)
    const anyDrawing = built.some((e) => e.drawing)

    if (revealedCount < target && visibility > 0.6 && !anyDrawing) {
      const entry = built[revealedCount]
      entry.drawing = true
      entry.revealed = true
      revealedCount++
      if (onReveal) onReveal(entry.shape.name)
    }

    let dirty = false
    for (let i = 0; i < built.length; i++) {
      const entry = built[i]
      if (!entry.revealed) continue

      if (entry.drawing) {
        entry.progress += dt * DRAW_SPEED
        if (entry.progress >= entry.shape.segments.length + POINT_FADE) {
          entry.progress = entry.shape.segments.length + POINT_FADE
          entry.drawing = false
        }
      }
      writeConstellation(entry, i, visibility)
      dirty = true
    }

    if (dirty) {
      pointGeometry.attributes.color.needsUpdate = true
      lineGeometry.attributes.position.needsUpdate = true
      lineGeometry.attributes.color.needsUpdate = true
    }
  }

  return {
    update,
    get revealed() {
      return revealedCount
    },
    get names() {
      return built.filter((e) => e.revealed).map((e) => e.shape.name)
    },
  }
}
