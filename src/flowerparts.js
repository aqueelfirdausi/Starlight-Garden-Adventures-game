import * as THREE from 'three'
import { COLORS } from './palette.js'

/**
 * The pieces a flower creature is made of: four InstancedMeshes shared by every
 * flower in the garden.
 *
 * This is what keeps blooms cheap. A flower is 10 separate objects — stem, six
 * petals, centre, two eyes — so building them as Meshes would cost 10 draw
 * calls each and blow the budget by the fourth flower. Instanced across the
 * whole garden it is 4 draw calls no matter how many bloom.
 */

export const PETALS_PER_FLOWER = 6

// Where the stem's tip sits when its Y scale is 1. Capsule length plus both
// caps, after the geometry is shifted so its base sits on y=0.
export const STEM_TIP = 1.068

/** Zero-scale every instance so unplanted slots draw nothing. */
function hideAll(mesh, count) {
  const empty = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, empty)
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false // Flowers are scattered; shared bounds are useless.
  mesh.castShadow = false
  return mesh
}

export function createStemMesh(capacity) {
  const geometry = new THREE.CapsuleGeometry(0.034, 1, 1, 6)
  geometry.translate(0, 0.534, 0) // Pivot at the base, so scaling grows upward.

  return hideAll(
    new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: COLORS.flowerStem, roughness: 0.8, metalness: 0 }),
      capacity
    ),
    capacity
  )
}

export function createPetalMesh(capacity) {
  const geometry = new THREE.SphereGeometry(1, 8, 6)
  geometry.scale(0.085, 0.028, 0.15)
  // Pivot at the inner tip so a petal opens by rotating about where it joins
  // the centre, which is how a real one unfurls.
  geometry.translate(0, 0, 0.15)

  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xffffff, // Tinted per instance; white keeps the tint honest.
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide, // Petals are thin and get seen from underneath.
    }),
    capacity * PETALS_PER_FLOWER
  )

  // instanceColor has to exist before the first frame or three skips the
  // attribute entirely and every petal renders flat white.
  const white = new THREE.Color(0xffffff)
  for (let i = 0; i < capacity * PETALS_PER_FLOWER; i++) mesh.setColorAt(i, white)
  mesh.instanceColor.needsUpdate = true

  return hideAll(mesh, capacity * PETALS_PER_FLOWER)
}

export function createCentreMesh(capacity) {
  return hideAll(
    new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshStandardMaterial({
        color: COLORS.flowerCentre,
        emissive: new THREE.Color(COLORS.flowerCentre),
        emissiveIntensity: 0.3, // A soft pollen glow, so the face reads at night.
        roughness: 0.6,
        metalness: 0,
      }),
      capacity
    ),
    capacity
  )
}

/**
 * Shared by the eyes and the mouth so the two features can never drift apart.
 *
 * Basic, not Standard: a face should read as flat dark marks at any angle, and
 * a lit material makes the eyes glint like wet marbles.
 */
const faceMaterial = new THREE.MeshBasicMaterial({ color: COLORS.flowerEye })

export function createEyeMesh(capacity) {
  return hideAll(
    new THREE.InstancedMesh(new THREE.SphereGeometry(0.023, 6, 5), faceMaterial, capacity * 2),
    capacity * 2
  )
}

/** How much of a circle the smile spans. Wider reads as a grin, narrower as a smirk. */
const SMILE_ARC = Math.PI * 0.62

export function createMouthMesh(capacity) {
  // A partial torus: a curved tube, so the smile is rounded in cross-section
  // as well as in outline. Same softness as the spherical eyes.
  const geometry = new THREE.TorusGeometry(0.048, 0.011, 5, 9, SMILE_ARC)

  // The arc is born spanning 0..SMILE_ARC. Swing it to the bottom of its circle,
  // then lay it flat into the face plane.
  //
  // On this face, local -Z is UP (the eyes sit at z=0.045, the mouth at 0.070).
  // A smile therefore needs its ENDS at smaller z than its middle: the curve
  // bulges toward the chin and turns up at the corners. Getting this backwards
  // produces a perfectly convincing frown, so it is asserted in the tests.
  geometry.rotateZ(-Math.PI / 2 - SMILE_ARC / 2)
  geometry.rotateX(-Math.PI / 2)

  return hideAll(new THREE.InstancedMesh(geometry, faceMaterial, capacity), capacity)
}
