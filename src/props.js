import * as THREE from 'three'
import { COLORS } from './palette.js'
import { getSoftDotTexture } from './softdot.js'
import { groundHeightAt, MEADOW_RADIUS } from './terrain.js'

/**
 * The scattered scenery: grass tufts and glowing mushrooms.
 *
 * Both are InstancedMesh, so 2700 blades of grass cost exactly one draw call.
 * Everything here is built once at startup and never touched again per frame —
 * updating 2700 instance matrices every frame is what would actually cost fps.
 */

// Blades are grouped into tufts of 3. Scattering them individually reads as
// stubble; clumping them reads as grass.
const GRASS_TUFTS = 900
const BLADES_PER_TUFT = 3
const GRASS_COUNT = GRASS_TUFTS * BLADES_PER_TUFT
const MUSHROOM_COUNT = 26

export function createGrass(random) {
  // A capsule has no hard edges and reads as a soft blade at this size.
  // 4 radial segments: at a few pixels tall nobody can count them, and this is
  // multiplied by 2700 instances so every triangle here matters.
  const geometry = new THREE.CapsuleGeometry(0.048, 0.26, 1, 4)
  // Move the pivot to the base so scaling grows blades upward out of the soil
  // instead of sinking them halfway into it.
  geometry.translate(0, 0.178, 0)

  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 1, metalness: 0 }),
    GRASS_COUNT
  )
  // Deliberately opted out of the shadow pass: 2700 casters would roughly double
  // it, and at this blade size the shadows they threw would be invisible anyway.
  // The mushrooms below are the only objects in the scene that cast.
  mesh.castShadow = false
  mesh.receiveShadow = false

  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()
  let index = 0

  for (let t = 0; t < GRASS_TUFTS; t++) {
    // Even area coverage needs sqrt — without it everything clumps in the middle.
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * (MEADOW_RADIUS + 6)
    const tuftX = Math.cos(angle) * radius
    const tuftZ = Math.sin(angle) * radius
    // One size per tuft so a clump looks like a single plant, not three strangers.
    const tuftScale = 0.62 + random() * 0.6

    for (let b = 0; b < BLADES_PER_TUFT; b++) {
      const x = tuftX + (random() - 0.5) * 0.26
      const z = tuftZ + (random() - 0.5) * 0.26

      dummy.position.set(x, groundHeightAt(x, z) - 0.05, z)
      // Blades splay outward from the tuft centre — that fan is what reads as grass.
      dummy.rotation.set((random() - 0.5) * 0.5, random() * Math.PI * 2, (random() - 0.5) * 0.5)
      const scale = tuftScale * (0.85 + random() * 0.4)
      dummy.scale.set(scale, scale * (0.85 + random() * 0.55), scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)

      // Gentle per-blade brightness. A wide range here just makes it look dirty.
      tint.setHex(COLORS.grass).multiplyScalar(0.86 + random() * 0.28)
      mesh.setColorAt(index, tint)
      index++
    }
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  return mesh
}

export function createMushrooms(random) {
  const group = new THREE.Group()

  // Half-sphere dome: rounded, no rim, and half the triangles of a full sphere.
  const capGeometry = new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
  const capMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.mushroomCap,
    // Emissive rather than real lights: 26 point lights would be unshippable.
    emissive: new THREE.Color(COLORS.mushroomGlow),
    // Low enough that the blush pink still reads as a colour. Push this up and
    // the caps blow out to featureless white dots.
    emissiveIntensity: 0.3,
    roughness: 0.6,
    metalness: 0,
  })

  const stemGeometry = new THREE.CapsuleGeometry(0.042, 0.13, 1, 6)
  stemGeometry.translate(0, 0.107, 0)

  const caps = new THREE.InstancedMesh(capGeometry, capMaterial, MUSHROOM_COUNT)
  const stems = new THREE.InstancedMesh(
    stemGeometry,
    new THREE.MeshStandardMaterial({ color: COLORS.mushroomStem, roughness: 0.85, metalness: 0 }),
    MUSHROOM_COUNT
  )
  // The only objects in the scene that cast into the shadow map, lit by the one
  // shadow-casting light in world.js — 2 extra draw calls in the shadow pass,
  // and they are what stops the mushrooms looking like stickers.
  caps.castShadow = true
  stems.castShadow = true

  const dummy = new THREE.Object3D()
  const glowPositions = new Float32Array(MUSHROOM_COUNT * 3)

  for (let i = 0; i < MUSHROOM_COUNT; i++) {
    const angle = random() * Math.PI * 2
    const radius = 4 + Math.sqrt(random()) * (MEADOW_RADIUS - 4)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const y = groundHeightAt(x, z)
    const scale = 0.65 + random() * 0.5

    dummy.position.set(x, y, z)
    dummy.rotation.set(0, random() * Math.PI * 2, 0)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    stems.setMatrixAt(i, dummy.matrix)

    dummy.position.y = y + 0.22 * scale
    dummy.updateMatrix()
    caps.setMatrixAt(i, dummy.matrix)

    glowPositions[i * 3 + 0] = x
    glowPositions[i * 3 + 1] = y + 0.24 * scale
    glowPositions[i * 3 + 2] = z
  }

  caps.instanceMatrix.needsUpdate = true
  stems.instanceMatrix.needsUpdate = true

  // One Points system for all 26 halos, sharing the global soft-dot texture.
  const glowGeometry = new THREE.BufferGeometry()
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3))
  const glow = new THREE.Points(
    glowGeometry,
    new THREE.PointsMaterial({
      map: getSoftDotTexture(),
      color: COLORS.mushroomGlow,
      size: 0.62,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false, // Additive glows must never occlude each other.
      fog: true,
    })
  )

  group.add(stems, caps, glow)
  group.userData.glowMaterial = glow.material
  return group
}
