import './hud.css'

/**
 * The HUD: petals gathered, seeds held, flowers grown.
 *
 * A record, not a scoreboard. No bars, no goals, no "3 more to go" — the only
 * thing it ever does is quietly agree with something she already saw happen.
 *
 * The performance rule this file exists to keep: it samples three numbers off
 * state.js every frame, and touches the DOM only on the frames where a
 * displayed digit actually changes. An idle garden costs three property reads
 * and three float compares per frame, and no layout at all.
 */

// How fast a number climbs to its new value, per second. Fast enough that it
// never lags behind her, slow enough that catching two petals at once visibly
// counts through rather than jumping.
const EASE = 7

// Icons, not labels. Each one is the thing itself: a star-petal, a seed pod,
// an open flower — drawn at the same weight so no count looks more important.
const ICONS = {
  petals: '<path d="M12 2.4c3.8 4 5.9 7.2 5.9 10.1a5.9 5.9 0 0 1-11.8 0C6.1 9.6 8.2 6.4 12 2.4z"/>',
  seeds:
    '<ellipse cx="12" cy="13.6" rx="5.1" ry="6.5"/><circle cx="12" cy="4.4" r="1.8" opacity=".7"/>',
  flowers:
    '<g opacity=".72"><circle cx="12" cy="5.6" r="3.1"/><circle cx="17.5" cy="8.8" r="3.1"/>' +
    '<circle cx="17.5" cy="15.2" r="3.1"/><circle cx="12" cy="18.4" r="3.1"/>' +
    '<circle cx="6.5" cy="15.2" r="3.1"/><circle cx="6.5" cy="8.8" r="3.1"/></g>' +
    '<circle cx="12" cy="12" r="3.3"/>',
}

// Order is left to right, and it is the order she earns them in: petals first,
// then seeds, then the flowers those seeds become.
const COUNTERS = [
  { key: 'petals', label: 'Star-petals gathered', read: (s) => s.petals },
  { key: 'seeds', label: 'Seeds held', read: (s) => s.seedsHeld },
  { key: 'flowers', label: 'Flowers grown', read: (s) => s.flowers },
]

function chipMarkup({ key, label }) {
  return (
    `<div class="hud-chip" data-key="${key}" role="img" aria-label="${label}">` +
    `<span class="hud-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg></span>` +
    `<span class="hud-value">0</span></div>`
  )
}

export function createHud(root, state) {
  const el = document.createElement('div')
  el.className = 'hud'
  el.innerHTML = COUNTERS.map(chipMarkup).join('')
  root.appendChild(el)

  const counters = COUNTERS.map((counter) => {
    const chip = el.querySelector(`.hud-chip[data-key="${counter.key}"]`)
    return {
      read: counter.read,
      chip,
      value: chip.querySelector('.hud-value'),
      shown: 0, // Float, mid-ease.
      target: 0, // The real tally.
      text: '0', // What is actually in the DOM right now.
    }
  })

  /**
   * The soft pulse on change.
   *
   * The usual way to replay a CSS animation is to strip the class, read
   * offsetWidth to force a reflow, and put it back. That reflow lands in the
   * middle of a frame in which the garden is already mid-bloom, so instead the
   * class goes on once and every later pulse just rewinds the animation that is
   * already attached. The keyframes end where they start, so the animation can
   * safely be left filling forwards for that to be possible.
   */
  function pulse(chip) {
    if (!chip.classList.contains('bump')) {
      chip.classList.add('bump')
      return
    }
    for (const animation of chip.getAnimations()) animation.currentTime = 0
  }

  /**
   * @param {number} dt seconds of REAL time — the HUD is deliberately not
   *        slowed by the pause time scale, so a number that was still climbing
   *        when she paused finishes climbing at its normal speed.
   */
  function update(dt) {
    for (let i = 0; i < counters.length; i++) {
      const counter = counters[i]
      const target = counter.read(state)

      if (target !== counter.target) {
        counter.target = target
        pulse(counter.chip)
      }

      const gap = counter.target - counter.shown
      if (gap === 0) continue // Settled: no maths, no DOM, nothing.

      counter.shown += gap * (1 - Math.exp(-EASE * dt))
      // Land exactly rather than approaching forever, so `gap === 0` above is
      // reachable and the idle path is genuinely free.
      if (Math.abs(counter.target - counter.shown) < 0.02) counter.shown = counter.target

      const text = String(Math.round(counter.shown))
      if (text !== counter.text) {
        counter.text = text
        counter.value.textContent = text
      }
    }
  }

  return { update, el }
}
