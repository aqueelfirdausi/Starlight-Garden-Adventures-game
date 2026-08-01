import './start.css'

/**
 * The start screen: a title, a button, and the garden already alive behind it.
 *
 * There is no menu here and there is not going to be one. Everything a menu
 * would have held either does not exist (there is no difficulty, no save, no
 * sound yet) or lives inside the pause panel, which is where she will be when
 * she actually wants it. The first screen of the game asks her for exactly one
 * decision, and it is "yes".
 */

const FADE_MS = 900 // Must match the .start transition in start.css.

const TITLE_WORDS = ['Starlight', 'Garden', 'Adventures']

/**
 * @param {HTMLElement} root the overlay layer
 * @param {{onStart: () => void}} options
 */
export function createStartScreen(root, { onStart }) {
  const el = document.createElement('div')
  el.className = 'start'
  el.innerHTML =
    '<div class="start-veil"></div>' +
    `<h1 class="title">${TITLE_WORDS.map(
      (word, i) => `<span style="--i:${i}">${word}</span>`
    ).join('')}</h1>` +
    '<button class="start-btn" type="button">Start Adventure</button>'
  root.appendChild(el)

  const button = el.querySelector('.start-btn')
  let leaving = false

  function start() {
    if (leaving) return // A double-tap must not fire the game up twice.
    leaving = true
    el.classList.add('leaving')
    // Hand over immediately and let the veil fade on top of a game that is
    // already running — waiting for the fade would mean her press does nothing
    // for the best part of a second.
    onStart()
    setTimeout(() => el.remove(), FADE_MS)
  }

  button.addEventListener('click', start)

  return { el }
}
