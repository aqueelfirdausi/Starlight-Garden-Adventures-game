import './pause.css'

/**
 * Pause: a button she can find, and cannot hit by accident.
 *
 * The accident case this is built against is real and specific — a tablet held
 * in two hands, a palm or a knuckle grazing a corner mid-flight. So the button
 * lives in the far diagonal from Flutter Up, and opening it takes a deliberate
 * two-thirds of a second with a ring closing under her finger the whole time.
 * A brush shows a flicker of arc and nothing more.
 *
 * Resuming is the opposite: one plain tap on a very large button, because
 * getting back to the garden should never need explaining.
 */

// Long enough that no brush completes it, short enough that a six-year-old
// doesn't conclude the button is broken and give up. Must match the
// .pause-btn.holding .ring-fill transition duration in pause.css.
const HOLD_MS = 650

const MARKUP = `
  <button class="pause-btn" type="button" aria-label="Pause the garden">
    <svg class="pause-ring" viewBox="0 0 76 76" aria-hidden="true">
      <circle class="ring-track" cx="38" cy="38" r="33"></circle>
      <circle class="ring-fill" cx="38" cy="38" r="33"></circle>
    </svg>
    <span class="pause-glyph" aria-hidden="true"><i></i><i></i></span>
  </button>

  <div class="panel" role="dialog" aria-modal="true" aria-label="Paused">
    <div class="panel-veil"></div>
    <div class="panel-card">
      <p class="panel-title">Paused</p>
      <button class="btn-resume" type="button">Keep Playing</button>
      <button
        class="btn-contrast"
        type="button"
        role="switch"
        aria-checked="false"
        aria-label="Bright mode, high contrast"
      >
        <span>Bright Mode</span>
        <span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span>
      </button>
    </div>
  </div>
`

/**
 * @param {HTMLElement} root the overlay layer
 * @param {object} options
 * @param {() => void} options.onPause   fired once the hold completes
 * @param {() => void} options.onResume
 * @param {{enabled: boolean, toggle: () => boolean}} options.contrast
 */
export function createPauseMenu(root, { onPause, onResume, contrast }) {
  const holder = document.createElement('div')
  holder.innerHTML = MARKUP
  while (holder.firstElementChild) root.appendChild(holder.firstElementChild)

  const button = root.querySelector('.pause-btn')
  const panel = root.querySelector('.panel')
  const resume = root.querySelector('.btn-resume')
  const toggle = root.querySelector('.btn-contrast')

  let open = false
  let holdTimer = 0
  let holdPointer = null

  // A closed panel is invisible but still in the document, so it has to be
  // taken out of the tree assistive tech walks — otherwise the game announces
  // itself as permanently paused.
  panel.inert = true

  function cancelHold() {
    if (holdTimer) clearTimeout(holdTimer)
    holdTimer = 0
    holdPointer = null
    button.classList.remove('holding')
  }

  function setOpen(value) {
    if (open === value) return
    open = value
    panel.classList.toggle('open', open)
    panel.inert = !open
    if (open) onPause()
    else onResume()
  }

  function onHoldStart(event) {
    if (holdPointer !== null) return
    holdPointer = event.pointerId
    button.classList.add('holding')
    // Arm the hold BEFORE asking for pointer capture. Capture is the nicety —
    // it lets the hold survive the drift a small finger always has — but a
    // browser that refuses it must not also cost her the pause.
    holdTimer = setTimeout(() => {
      cancelHold()
      setOpen(true)
    }, HOLD_MS)
    if (button.setPointerCapture) button.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onHoldEnd(event) {
    if (event.pointerId !== holdPointer) return
    cancelHold()
  }

  button.addEventListener('pointerdown', onHoldStart)
  button.addEventListener('pointerup', onHoldEnd)
  button.addEventListener('pointercancel', onHoldEnd)
  button.addEventListener('lostpointercapture', onHoldEnd)

  resume.addEventListener('click', () => setOpen(false))

  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-checked', String(contrast.toggle()))
  })

  return {
    get paused() {
      return open
    },

    /** Close without going through the panel's own button. */
    close() {
      setOpen(false)
    },
  }
}
