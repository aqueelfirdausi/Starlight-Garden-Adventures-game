/**
 * Touch input: drag anywhere to steer, hold the button to rise.
 *
 * Pointer Events only, and every pointer is tracked by its own pointerId. That
 * is the whole trick to multi-touch here — one finger dragging and another
 * holding Flutter Up are two independent ids that never overwrite each other.
 */

const DEADZONE = 8 // px, so a resting thumb doesn't creep.
const INPUT_EASE = 7 // How fast steer follows the finger. Lower = more syrup.

export function createControls({ canvas, button }) {
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
  function onCanvasPointerDown(event) {
    touches.set(event.pointerId, {
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    })
    // First finger down takes the wheel; later ones just wait their turn.
    if (steerPointerId === null) {
      steerPointerId = event.pointerId
      rawX = 0
      rawY = 0
    }
    event.preventDefault()
  }

  function onPointerMove(event) {
    const touch = touches.get(event.pointerId)
    if (!touch) return
    touch.x = event.clientX
    touch.y = event.clientY
    if (event.pointerId === steerPointerId) updateRawFromActive()
  }

  function onPointerUp(event) {
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
