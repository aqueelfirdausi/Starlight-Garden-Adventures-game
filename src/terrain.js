import * as THREE from 'three'
import { COLORS } from './palette.js'

/**
 * The shape of the land: how high the ground is anywhere, and the mesh that
 * draws it.
 *
 * This lives apart from world.js because the firefly and the camera both need
 * groundHeightAt() but neither should have to pull in grass, mushrooms and
 * lighting to get it.
 */

// How far from the middle the meadow stays interesting. The firefly's soft
// bounds and the scenery scatter both read this, so they can never disagree.
export const MEADOW_RADIUS = 30

const GROUND_SIZE = 92 // Comfortably past the fog, so no edge is ever visible.

/**
 * Terrain height, as a plain function rather than a baked heightmap.
 *
 * WHY: the firefly and the camera both need the ground height at an arbitrary
 * point, every frame. Sampling a mesh would mean raycasting; three sine waves
 * is a few nanoseconds and is guaranteed to agree with the visible mesh
 * because the mesh is built from this exact function.
 */
export function groundHeightAt(x, z) {
  return (
    Math.sin(x * 0.075) * Math.cos(z * 0.085) * 1.9 +
    Math.sin(x * 0.15 + 1.7) * Math.cos(z * 0.13 - 0.6) * 0.75 +
    Math.sin((x + z) * 0.042 + 2.3) * 0.85
  )
}

/**
 * Seeded RNG so the meadow is identical on every load. A child should come back
 * to the same garden she left, not a reshuffled one.
 */
export function makeRandom(seed) {
  let t = seed
  return function random() {
    t += 0x6d2b79f5
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function createGround() {
  const segments = 72 // Enough that the hills read as curves, not polygons.
  const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, segments, segments)
  geometry.rotateX(-Math.PI / 2) // Lay it flat, +Y up.

  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    position.setY(i, groundHeightAt(position.getX(i), position.getZ(i)))
  }
  position.needsUpdate = true

  // Recomputing normals after displacing is what removes the faceted look —
  // without this every quad lights as a flat plate.
  geometry.computeVertexNormals()

  // Baked-in patchiness. Vertex colours cost nothing at runtime and stop 10k
  // triangles of identical green reading as a bedsheet.
  const colors = new Float32Array(position.count * 3)
  const base = new THREE.Color(COLORS.ground)
  const tint = new THREE.Color(COLORS.groundTint)
  const patch = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const blend = 0.5 + 0.5 * Math.sin(x * 0.13 + 0.7) * Math.cos(z * 0.11 - 1.4)
    patch.copy(base).lerp(tint, blend)
    colors[i * 3 + 0] = patch.r
    colors[i * 3 + 1] = patch.g
    colors[i * 3 + 2] = patch.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: false,
    })
  )
  ground.receiveShadow = true
  return ground
}
