/**
 * Touch input: drag anywhere to steer, hold the button to rise.
 *
 * Pointer Events only, and every pointer is tracked by its own pointerId. That
 * is the whole trick to multi-touch here — one finger dragging and another
 * holding Flutter Up are two independent ids that never overwrite each other.
 */

const DEADZONE = 8 // px, so a resting thumb doesn't creep.
const INPUT_EASE = 7 // How fast steer follows the finger. Lower = more syrup.
// How far a finger may wander and still count as a tap rather than a drag.
// Generous, because a child's "tap" always slides a little.
const TAP_SLOP = 16

/**
 * @param {object} options
 * @param {{isTarget:Function, collect:Function}} [options.tap]
 *        Optional collectible hit-testing. When a pointer lands on something
 *        tappable it is held back from steering until it either moves far
 *        enough to clearly be a drag, or is released as a tap.
 */
export function createControls({ canvas, button, tap }) {
  // Raw = where the finger actually is. Smoothed = what the firefly is told.
  // Easing between them is why touch-down nudges rather than jolts.
  let rawX = 0
  let rawY = 0
  let steerX = 0
  let steerY = 0

  let steerPointerId = null
  let risePointerId = null

  // Every finger currently down on the canvas, not just the steering one.
  // Children rest spare fingers on the screen constantly; when the steering
  // finger lifts we hand control to one that is still down instead of stopping.
  const touches = new Map() // pointerId -> { originX, originY, x, y }

  // Pointers that landed on a collectible and have not yet declared themselves
  // a tap or a drag. These are deliberately NOT in `touches`, which is what
  // stops a tap from also steering the firefly.
  const pendingTaps = new Map() // pointerId -> { originX, originY }

  // Drag distance for full tilt, sized off the screen so the gesture feels the
  // same on a small phone and a big tablet, in either orientation.
  let maxRadius = 110
  function measure() {
    const shortSide = Math.min(window.innerWidth, window.innerHeight)
    maxRadius = Math.max(70, Math.min(150, shortSide * 0.22))
  }
  measure()

  function updateRawFromActive() {
    const touch = touches.get(steerPointerId)
    if (!touch) {
      rawX = 0
      rawY = 0
      return
    }

    const dx = touch.x - touch.originX
    const dy = touch.y - touch.originY
    const distance = Math.hypot(dx, dy)

    if (distance <= DEADZONE) {
      rawX = 0
      rawY = 0
      return
    }

    // Rescale past the deadzone so control starts from zero at its edge instead
    // of jumping to whatever the deadzone was worth.
    const scaled = Math.min((distance - DEADZONE) / (maxRadius - DEADZONE), 1)
    rawX = (dx / distance) * scaled
    rawY = -(dy / distance) * scaled // Screen Y grows downward; steering doesn't.
  }

  // --- Steering (canvas) ---------------------------------------------------
  // The button sits above the canvas in the DOM, so a pointer that lands on it
  // never reaches this handler at all. No hit-testing needed.
  /** Begin steering with this pointer, anchored wherever it currently is. */
  function beginSteering(pointerId, x, y) {
    touches.set(pointerId, { originX: x, originY: y, x, y })
    // First finger down takes the wheel; later ones just wait their turn.
    if (steerPointerId === null) {
      steerPointerId = pointerId
      rawX = 0
      rawY = 0
    }
  }

  function onCanvasPointerDown(event) {
    // Landing on a collectible holds this pointer back rather than steering
    // with it. It becomes a drag only if it actually moves.
    if (tap && tap.isTarget(event.clientX, event.clientY)) {
      pendingTaps.set(event.pointerId, { originX: event.clientX, originY: event.clientY })
      event.preventDefault()
      return
    }

    beginSteering(event.pointerId, event.clientX, event.clientY)
    event.preventDefault()
  }

  function onPointerMove(event) {
    const pending = pendingTaps.get(event.pointerId)
    if (pending) {
      const moved = Math.hypot(event.clientX - pending.originX, event.clientY - pending.originY)
      if (moved > TAP_SLOP) {
        // Clearly a drag after all. Re-anchor at the current point so control
        // starts from here instead of snapping by the distance already moved.
        pendingTaps.delete(event.pointerId)
        beginSteering(event.pointerId, event.clientX, event.clientY)
      }
      return
    }

    const touch = touches.get(event.pointerId)
    if (!touch) return
    touch.x = event.clientX
    touch.y = event.clientY
    if (event.pointerId === steerPointerId) updateRawFromActive()
  }

  function onPointerUp(event) {
    // Released without ever becoming a drag — that's a tap.
    if (pendingTaps.delete(event.pointerId)) {
      if (event.type !== 'pointercancel' && tap) tap.collect(event.clientX, event.clientY)
      return
    }

    if (!touches.delete(event.pointerId)) return
    if (event.pointerId !== steerPointerId) return

    // Hand over to whichever finger is still down, re-anchoring its origin to
    // where it currently is so control doesn't snap to a stale drag distance.
    const next = touches.keys().next()
    if (next.done) {
      steerPointerId = null
      // Release to neutral, not to a stop — the firefly's drag does the glide.
      rawX = 0
      rawY = 0
      return
    }

    steerPointerId = next.value
    const touch = touches.get(steerPointerId)
    touch.originX = touch.x
    touch.originY = touch.y
    rawX = 0
    rawY = 0
  }

  // --- Flutter Up (button) -------------------------------------------------
  function onButtonPointerDown(event) {
    if (risePointerId !== null) return
    risePointerId = event.pointerId
    button.classList.add('held')
    // Capture so a thumb that slides off the button keeps holding it — children
    // drift, and losing lift mid-flight feels broken.
    if (button.setPointerCapture) button.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onButtonPointerUp(event) {
    if (event.pointerId !== risePointerId) return
    risePointerId = null
    button.classList.remove('held')
  }

  function onContextMenu(event) {
    event.preventDefault() // Kill the long-press menu on Android.
  }

  canvas.addEventListener('pointerdown', onCanvasPointerDown)
  // Move/up live on window so a drag that leaves the canvas still tracks.
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('resize', measure)

  button.addEventListener('pointerdown', onButtonPointerDown)
  button.addEventListener('pointerup', onButtonPointerUp)
  button.addEventListener('pointercancel', onButtonPointerUp)
  button.addEventListener('lostpointercapture', onButtonPointerUp)
  window.addEventListener('contextmenu', onContextMenu)

  return {
    get steerX() {
      return steerX
    },
    get steerY() {
      return steerY
    },
    get rise() {
      return risePointerId !== null
    },

    /**
     * Drop every finger the game is currently tracking.
     *
     * Called when the pause panel opens. The panel covers the canvas so no
     * further events arrive, which means a thumb that was mid-hold on Flutter
     * Up would otherwise still be "down" when she resumes — she would let go
     * during the pause and come back to a firefly climbing on its own.
     */
    release() {
      touches.clear()
      pendingTaps.clear()
      steerPointerId = null
      rawX = 0
      rawY = 0
      if (risePointerId !== null) {
        risePointerId = null
        button.classList.remove('held')
      }
    },

    /** Ease the reported steer toward the finger. Call once per frame. */
    update(dt) {
      const t = 1 - Math.exp(-INPUT_EASE * dt)
      steerX += (rawX - steerX) * t
      steerY += (rawY - steerY) * t
    },

    dispose() {
      canvas.removeEventListener('pointerdown', onCanvasPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', measure)
      button.removeEventListener('pointerdown', onButtonPointerDown)
      button.removeEventListener('pointerup', onButtonPointerUp)
      button.removeEventListener('pointercancel', onButtonPointerUp)
      button.removeEventListener('lostpointercapture', onButtonPointerUp)
      window.removeEventListener('contextmenu', onContextMenu)
    },
  }
}
