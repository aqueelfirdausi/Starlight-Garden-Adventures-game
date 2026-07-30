import * as THREE from 'three'
import { groundHeightAt } from './terrain.js'

/**
 * Follow camera. Sits behind and above the firefly and lags into place.
 *
 * WHY it never rotates with her: a camera that swings to match heading makes
 * "up the screen" mean a different direction every second, so a child drags up
 * and goes sideways. Keeping the yaw fixed means the controls are the same at
 * every moment, and it avoids the swooping that makes kids feel sick.
 */

const BASE_OFFSET = new THREE.Vector3(0, 5.6, 11.5)
const LOOK_LIFT = 1.3 // Aim a little above her, so she sits low in frame with sky above.

const POSITION_LAMBDA = 2.6 // Lower = more lag. This is the "camera on a string" feel.
const LOOK_LAMBDA = 4.2
const MIN_CAMERA_CLEARANCE = 1.6 // Never let the camera dip into a hill.

export function createCameraRig(camera, targetPosition) {
  const desired = new THREE.Vector3()
  const lookTarget = new THREE.Vector3(targetPosition.x, targetPosition.y + LOOK_LIFT, targetPosition.z)

  // Portrait sees much less horizontally at the same vertical FOV, so the
  // camera backs off to keep a similar amount of meadow on screen.
  let distanceScale = 1
  function setViewport(aspect) {
    distanceScale = aspect < 1 ? THREE.MathUtils.lerp(1.34, 1.0, THREE.MathUtils.clamp(aspect, 0.5, 1)) : 1
  }
  setViewport(camera.aspect || 1)

  let initialised = false

  function update(dt) {
    desired.copy(BASE_OFFSET).multiplyScalar(distanceScale).add(targetPosition)

    // Keep the lens above the terrain even when she flies into a dip.
    const floor = groundHeightAt(desired.x, desired.z) + MIN_CAMERA_CLEARANCE
    if (desired.y < floor) desired.y = floor

    if (!initialised) {
      // Snap on the first frame, or the camera visibly flies in from the origin.
      camera.position.copy(desired)
      lookTarget.set(targetPosition.x, targetPosition.y + LOOK_LIFT, targetPosition.z)
      initialised = true
    } else {
      // Exponential smoothing: identical feel at any frame rate, unlike lerp(0.1).
      camera.position.lerp(desired, 1 - Math.exp(-POSITION_LAMBDA * dt))

      // Damping the aim separately from the position is what stops the horizon
      // jittering when she changes direction sharply.
      lookTarget.x += (targetPosition.x - lookTarget.x) * (1 - Math.exp(-LOOK_LAMBDA * dt))
      lookTarget.y += (targetPosition.y + LOOK_LIFT - lookTarget.y) * (1 - Math.exp(-LOOK_LAMBDA * dt))
      lookTarget.z += (targetPosition.z - lookTarget.z) * (1 - Math.exp(-LOOK_LAMBDA * dt))
    }

    camera.lookAt(lookTarget)
  }

  return { update, setViewport }
}
