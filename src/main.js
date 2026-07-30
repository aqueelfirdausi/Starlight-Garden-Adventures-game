import * as THREE from 'three'
import './style.css'
import { createWorld } from './world.js'
import { createFirefly } from './firefly.js'
import { createControls } from './controls.js'
import { createCameraRig } from './camera.js'

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
renderer.shadowMap.type = THREE.PCFSoftShadowMap
// Rolls the additive glows off gently instead of clipping them to flat white.
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500)

const world = createWorld(scene)
const firefly = createFirefly(scene)
const controls = createControls({ canvas, button })
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
  window.__garden = { renderer, scene, camera, world, firefly, controls, cameraRig }
}

const clock = new THREE.Clock()
let elapsed = 0

let fpsFrames = 0
let fpsClock = 0

renderer.setAnimationLoop(() => {
  // Clamped: after the tablet sleeps or the tab is backgrounded, delta can be
  // many seconds, which would fling the firefly across the meadow in one step.
  const dt = Math.min(clock.getDelta(), 1 / 20)
  elapsed += dt

  controls.update(dt)
  firefly.update(dt, elapsed, controls)
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
