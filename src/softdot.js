import * as THREE from 'three'

/**
 * One soft round glow texture, shared by every glowing thing in the game:
 * the firefly's halo, its trail, and the mushroom glows.
 *
 * WHY one shared texture: each distinct texture is its own GPU upload and can
 * break batching. Generating it in code also means zero image files to load,
 * so the meadow appears instantly instead of popping in.
 */

let cached = null

export function getSoftDotTexture() {
  if (cached) return cached

  const size = 64 // Plenty — it is a blurry blob, it never shows pixels.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  // Eased falloff rather than a straight ramp — a linear fade reads as a hard
  // edged disc, this reads as light.
  gradient.addColorStop(0.0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.72)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.22)')
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  cached = new THREE.CanvasTexture(canvas)
  cached.colorSpace = THREE.SRGBColorSpace
  // No mipmaps: the texture is always drawn small and additively, so mip
  // generation is wasted memory and the minified levels only dull the glow.
  cached.generateMipmaps = false
  cached.minFilter = THREE.LinearFilter
  cached.magFilter = THREE.LinearFilter
  return cached
}
