import * as THREE from 'three'
import { COLORS } from './palette.js'
import {
  createCentreMesh,
  createEyeMesh,
  createMouthMesh,
  createPetalMesh,
  createStemMesh,
  PETALS_PER_FLOWER,
  STEM_TIP,
} from './flowerparts.js'
import { advance, blinkFactor, createLife, IDLE, WAVE } from './flowerlife.js'

/**
 * Flower creatures: sprout, unfurl, wake up, wave hello, then live there.
 *
 * This file is where the parts of a flower GO — stem, head, petals, eyes,
 * mouth, all written straight into instanced matrices. What a flower is made of
 * is in flowerparts.js; how it grows and blinks is in flowerlife.js.
 */

const HEAD_TILT = 0.6 // Tips the face forward so it looks at her, not the sky.
const GAZE_TIME = 2.6 // Full look-up-and-back when a constellation arrives.
const GAZE_LIFT = 0.85 // Radians of extra tilt back. Enough to clearly face the sky.
const PETAL_CLOSED = -1.45 // Radians: petals stand upright, forming a bud.
const PETAL_OPEN = -0.28 // Laid back and slightly raised, like a real bloom.

const TAU = Math.PI * 2

export function createFlowers(scene, { state, onBloom, capacity = 14 } = {}) {
  const stems = createStemMesh(capacity)
  const petals = createPetalMesh(capacity)
  const centres = createCentreMesh(capacity)
  const eyes = createEyeMesh(capacity)
  const mouths = createMouthMesh(capacity)
  scene.add(stems, petals, centres, eyes, mouths)

  const flowers = []

  // Counts down when a constellation arrives and the whole garden looks up.
  let gaze = 0

  // Scratch objects, reused every frame for every flower. Allocating matrices
  // inside the loop would make the garden garbage-collect as it grows.
  const stemEuler = new THREE.Euler()
  const stemQuat = new THREE.Quaternion()
  const localEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  const localQuat = new THREE.Quaternion()
  const headQuat = new THREE.Quaternion()
  const headPos = new THREE.Vector3()
  const scaleV = new THREE.Vector3()
  const mHead = new THREE.Matrix4()
  const mLocal = new THREE.Matrix4()
  const mRotY = new THREE.Matrix4()
  const mRotX = new THREE.Matrix4()
  const mOut = new THREE.Matrix4()
  const petalScale = new THREE.Vector3(1, 1, 1)
  const eyeScale = new THREE.Vector3(1, 1, 1)
  const mouthScale = new THREE.Vector3(1, 1, 1)

  /**
   * Plant a flower at a patch, facing whoever planted it.
   * @param {{x:number, y:number, z:number}} patch
   * @param {THREE.Vector3} [facing] usually the firefly, so it wakes up looking at her
   */
  function plant(patch, facing) {
    if (flowers.length >= capacity) return null

    const yaw = facing
      ? Math.atan2(facing.x - patch.x, facing.z - patch.z)
      : Math.random() * TAU

    const flower = {
      base: new THREE.Vector3(patch.x, patch.y, patch.z),
      yaw,
      color: new THREE.Color(COLORS.flowerPalette[(Math.random() * COLORS.flowerPalette.length) | 0]),
      height: 0.72 + Math.random() * 0.42,
      // Random offsets so no two flowers ever breathe or sway in step.
      phase: Math.random() * TAU,
      phase2: Math.random() * TAU,
      // Staggered so the garden looks up as a ripple, not as one machine.
      gazeDelay: Math.random() * 0.55,
      headPos: new THREE.Vector3(),
      ...createLife(),
    }

    const index = flowers.length
    flowers.push(flower)
    for (let p = 0; p < PETALS_PER_FLOWER; p++) {
      petals.setColorAt(index * PETALS_PER_FLOWER + p, flower.color)
    }
    petals.instanceColor.needsUpdate = true

    if (state) state.addFlower()
    return flower
  }

  function update(dt, elapsed) {
    // GAZE_TIME is the full look-up-and-back arc, shared by every flower but
    // entered at its own moment via gazeDelay.
    if (gaze > 0) gaze = Math.max(0, gaze - dt)

    for (let i = 0; i < flowers.length; i++) {
      const flower = flowers[i]
      const { growth, openness, headScale, lean, waveSway, wave } = advance(flower, dt)

      // Idle sway on two different frequencies so it never looks like a metronome.
      const swayX = Math.sin(elapsed * 0.55 + flower.phase) * 0.045
      const swayZ = Math.sin(elapsed * 0.43 + flower.phase2) * 0.05
      // Lean toward the direction the flower faces. Small-angle mapping: a tilt
      // about X leans toward +Z, a tilt about Z leans toward -X.
      const tiltX = swayX + lean * Math.cos(flower.yaw)
      const tiltZ = swayZ - lean * Math.sin(flower.yaw) + waveSway

      stemEuler.set(tiltX, 0, tiltZ)
      stemQuat.setFromEuler(stemEuler)

      const stemLength = flower.height * growth
      scaleV.set(1, stemLength, 1)
      mOut.compose(flower.base, stemQuat, scaleV)
      stems.setMatrixAt(i, mOut)

      headPos.set(0, stemLength * STEM_TIP, 0).applyQuaternion(stemQuat).add(flower.base)
      flower.headPos.copy(headPos) // Published for the celebration bursts.

      // Looking up at a new constellation: tipping the head back means reducing
      // the forward tilt. Each flower runs the arc on its own small delay.
      const gazeT = gaze - flower.gazeDelay
      const lookUp = gazeT > 0 ? Math.sin((gazeT / GAZE_TIME) * Math.PI) * GAZE_LIFT : 0

      // Head inherits the stem's lean, then turns to face her and tips forward.
      // Applied in this order so the tilt follows the yaw instead of the world.
      localEuler.set(HEAD_TILT - lookUp, flower.yaw, 0)
      localQuat.setFromEuler(localEuler)
      headQuat.copy(stemQuat).multiply(localQuat)

      // Slow breathing, only once it has settled — a sprouting bud shouldn't pulse.
      // Kept as a raw -1..1 signal so the mouth can ride the same rhythm as the head.
      const breathSignal = flower.stage === IDLE ? Math.sin(elapsed * 0.8 + flower.phase) : 0
      const scale = headScale * (1 + breathSignal * 0.035)
      scaleV.set(scale, scale, scale)
      mHead.compose(headPos, headQuat, scaleV)

      if (flower.pendingBloom) {
        flower.pendingBloom = false
        if (onBloom) onBloom(headPos, flower.color.getHex())
      }

      centres.setMatrixAt(i, mHead)

      const petalPitch = PETAL_CLOSED + (PETAL_OPEN - PETAL_CLOSED) * openness
      for (let p = 0; p < PETALS_PER_FLOWER; p++) {
        // A hair of independent drift per petal, so the head isn't rigid.
        const drift = flower.stage === IDLE ? Math.sin(elapsed * 0.9 + flower.phase + p) * 0.022 : 0
        mRotY.makeRotationY((p / PETALS_PER_FLOWER) * TAU)
        mRotX.makeRotationX(petalPitch + drift)
        mLocal.multiplyMatrices(mRotY, mRotX)
        mLocal.scale(petalScale)
        mOut.multiplyMatrices(mHead, mLocal)
        petals.setMatrixAt(i * PETALS_PER_FLOWER + p, mOut)
      }

      const blink = blinkFactor(flower, dt)
      eyeScale.set(blink > 0 ? 1 : 0, blink, blink > 0 ? 1 : 0)
      for (let e = 0; e < 2; e++) {
        mLocal.makeTranslation(e === 0 ? -0.042 : 0.042, 0.055, 0.045)
        mLocal.scale(eyeScale)
        mOut.multiplyMatrices(mHead, mLocal)
        eyes.setMatrixAt(i * 2 + e, mOut)
      }

      // The smile. Sits below the eyes on the face, and wakes with them so the
      // whole expression arrives at once rather than assembling piece by piece.
      if (flower.stage === WAVE || flower.stage === IDLE) {
        // X widens it, Z deepens the curve into a more open grin. The wave
        // envelope returns to zero by itself, which is the "easing back".
        mouthScale.set(1 + wave * 0.3 + breathSignal * 0.05, 1, 1 + wave * 0.5 + breathSignal * 0.07)
      } else {
        mouthScale.set(0, 0, 0)
      }
      // Sits proud of the centre and clear of the petal plane. At y=0.03 the
      // smile was buried inside the petals and invisible from the front.
      mLocal.makeTranslation(0, 0.058, 0.07)
      mLocal.scale(mouthScale)
      mOut.multiplyMatrices(mHead, mLocal)
      mouths.setMatrixAt(i, mOut)
    }

    if (flowers.length === 0) return
    stems.instanceMatrix.needsUpdate = true
    petals.instanceMatrix.needsUpdate = true
    centres.instanceMatrix.needsUpdate = true
    eyes.instanceMatrix.needsUpdate = true
    mouths.instanceMatrix.needsUpdate = true
  }

  return {
    plant,
    update,

    /** The whole garden tips its head back to look at the sky. */
    lookUp() {
      gaze = GAZE_TIME + 0.55 // Longest gazeDelay, so the last flower still gets a full arc.
    },

    /** Live head positions, for effects that want to fire at each flower. */
    get heads() {
      return flowers.map((f) => f.headPos)
    },

    get count() {
      return flowers.length
    },
  }
}
