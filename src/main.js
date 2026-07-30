import * as THREE from 'three'
import './style.css'
import { createWorld } from './world.js'
import { createFirefly } from './firefly.js'
import { createControls } from './controls.js'
import { createCameraRig } from './camera.js'
import { createEffects } from './effects.js'
import { createCollectibles } from './collectibles.js'

/**
 * Bootstrap: renderer, camera, resize, frame loop, fps readout.
 *
 * Everything game-shaped lives in the four modules above. This file only wires
 * them together, so it can be swapped for a different host without touching them.
 */

const canvas = document.getElementById('scene')
const button = document.getElementById('flutter')
const fpsLabel = document.getElementById('fps')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
})
// Pixel ratio is capped in resize() below, which also runs once at startup.
renderer.shadowMap.enabled = true
// PCFSoftShadowMap is deprecated in r185 and three silently substitutes this
// anyway, so naming it directly changes nothing except the console warning.
renderer.shadowMap.type = THREE.PCFShadowMap
// Rolls the additive glows off gently instead of clipping them to flat white.
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500)

const world = createWorld(scene)
const firefly = createFirefly(scene)
const effects = createEffects(scene)

// The reward moment, assembled here: the item's own burst plus a warm flare on
// the firefly. Collectibles doesn't know about effects and effects doesn't know
// about the firefly — main is the only place that knows about all three.
const collectibles = createCollectibles(scene, {
  onCollect({ position, color }) {
    effects.burst(position, color)
    firefly.pulse()
  },
})

// Screen tap -> world ray. Reused every tap; a Raycaster per touch would be
// garbage for no reason.
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
function rayFromScreen(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1
  ndc.y = -(clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(ndc, camera)
  return raycaster
}

const controls = createControls({
  canvas,
  button,
  tap: {
    isTarget: (x, y) => collectibles.hitTest(rayFromScreen(x, y)),
    collect: (x, y) => collectibles.collectAt(rayFromScreen(x, y)),
  },
})
const cameraRig = createCameraRig(camera, firefly.position)

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  cameraRig.setViewport(camera.aspect)
  // Re-applied every resize, not just at startup: devicePixelRatio changes when
  // the browser zooms or the window moves to another display, and a stale value
  // silently renders at the wrong resolution.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(width, height, false)
}

window.addEventListener('resize', resize)
// Android reports stale dimensions during an orientation flip, so re-measure
// once the browser has settled. Cheap insurance against a squashed first frame.
window.addEventListener('orientationchange', () => {
  requestAnimationFrame(resize)
  setTimeout(resize, 250)
})
resize()

// Dev-only handle for poking at the game from the browser console. Stripped
// from production builds by Vite's dead-code elimination.
if (import.meta.env.DEV) {
  window.__garden = { renderer, scene, camera, world, firefly, controls, cameraRig, collectibles, effects }
}

// Timer replaces the deprecated Clock. connect(document) makes it use the Page
// Visibility API, so returning from a backgrounded tab doesn't hand back one
// enormous delta.
const timer = new THREE.Timer()
timer.connect(document)
let elapsed = 0

let fpsFrames = 0
let fpsClock = 0

renderer.setAnimationLoop(() => {
  timer.update()
  // Still clamped on top of Timer's visibility handling: a single slow frame on
  // the tablet would otherwise step the firefly a long way in one go.
  const dt = Math.min(timer.getDelta(), 1 / 20)
  elapsed += dt

  controls.update(dt)
  firefly.update(dt, elapsed, controls)
  collectibles.update(dt, elapsed, firefly.position)
  effects.update(dt)
  cameraRig.update(dt)
  world.update(elapsed)

  renderer.render(scene, camera)

  fpsFrames++
  fpsClock += dt
  if (fpsClock >= 0.5) {
    fpsLabel.textContent = `${Math.round(fpsFrames / fpsClock)} fps · ${renderer.info.render.calls} calls`
    fpsFrames = 0
    fpsClock = 0
  }
})
