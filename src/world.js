import * as THREE from 'three'
import { COLORS } from './palette.js'
import { createGround, groundHeightAt, makeRandom, MEADOW_RADIUS } from './terrain.js'
import { createGrass, createMushrooms } from './props.js'

/**
 * Assembles the moonlit meadow: sky, fog, lighting, and the scenery from
 * props.js. The whole world costs about 8 draw calls, which leaves most of the
 * ~150 budget free for whatever Phase 2 brings.
 */

function createSky() {
  // A gradient in a shader costs one draw call and no texture memory. depthTest
  // is off and renderOrder is -1, so it paints first and everything covers it.
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(COLORS.skyTop) },
      horizonColor: { value: new THREE.Color(COLORS.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDir;

      void main() {
        // pow() keeps the colour band low and tight to the horizon instead of
        // washing halfway up the sky.
        float h = pow(smoothstep(-0.15, 0.72, vDir.y), 0.85);
        gl_FragColor = vec4(mix(horizonColor, topColor, h), 1.0);

        // A ShaderMaterial does not run three's output pipeline on its own.
        // Without these the sky is written as linear values into an sRGB buffer,
        // which crushes the mid channels and turns any saturated colour into a
        // screaming one — the first sunset came out as flat red.
        //
        // Only the _fragment chunks belong here. Three already injects the
        // matching _pars_fragment declarations into every fragment shader, so
        // including those too is a redefinition error and the shader goes black.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), material)
  sky.renderOrder = -1
  sky.frustumCulled = false
  return sky
}

function createLights(scene) {
  // Broad ambient fill. Costs nothing and stops the shadow side going black.
  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.15)
  scene.add(hemi)

  // The one light in the game that casts a shadow at all. It is the sun by day
  // and the moon by night — sky.js moves and recolours this single light rather
  // than creating a second one. The hemisphere fill above and the firefly's own
  // lamp both leave castShadow off.
  //
  // What it actually casts is only the mushrooms; see createMushrooms() in
  // props.js for why the grass is deliberately left out of the shadow pass.
  const moon = new THREE.DirectionalLight(COLORS.moon, 1.5)
  moon.position.set(16, 26, 12)
  moon.castShadow = true
  moon.shadow.mapSize.set(1024, 1024)

  // Tight ortho box: a 1024 map stretched over the whole meadow would give
  // blocky shadows, so it only covers where the mushrooms actually are.
  const box = MEADOW_RADIUS + 4
  moon.shadow.camera.left = -box
  moon.shadow.camera.right = box
  moon.shadow.camera.top = box
  moon.shadow.camera.bottom = -box
  moon.shadow.camera.near = 1
  moon.shadow.camera.far = 80
  moon.shadow.bias = -0.0012 // Removes the shadow acne on the rolling slopes.
  moon.shadow.normalBias = 0.02

  scene.add(moon)
  scene.add(moon.target) // Target defaults to the origin, which is where we want it.

  return { hemi, moon }
}

export function createWorld(scene) {
  const random = makeRandom(20260731)

  scene.background = null // The sky dome paints the background itself.
  // Far plane sits inside the ground plane's corners, so the meadow always ends
  // in haze rather than at a visible edge.
  scene.fog = new THREE.Fog(COLORS.fog, 20, 66)

  const sky = createSky()
  const ground = createGround()
  const grass = createGrass(random)
  const mushrooms = createMushrooms(random)

  scene.add(sky, ground, grass, mushrooms)
  const lights = createLights(scene)

  const glowMaterial = mushrooms.userData.glowMaterial

  return {
    groundHeightAt,
    lights,
    // Handed to sky.js, which drives all of these together so the mood never
    // comes apart. Nothing else should write to them.
    skyMaterial: sky.material,
    fog: scene.fog,

    /**
     * Slow shared breathing on the mushroom halos. One uniform, no geometry work.
     * @param {number} night 0 by day, 1 at midnight — the glow rides this so the
     *        mushrooms go quiet in daylight and come alive after dark, without
     *        anyone hand-tuning a second set of numbers.
     */
    update(elapsed, night = 1) {
      const breath = 0.34 + Math.sin(elapsed * 0.7) * 0.08
      glowMaterial.opacity = breath * (0.16 + 0.84 * night)
    },
  }
}
