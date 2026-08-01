/**
 * Every colour in the meadow, in one place, so the whole mood can be retuned
 * without hunting through geometry code.
 *
 * Note how much darker the surfaces are than the palette names suggest: under a
 * bright moon plus hemisphere fill, pastels render several shades lighter than
 * their hex value, so they are picked saturated and let the lighting lift them.
 */
export const COLORS = {
  skyTop: 0x1e2a55,
  skyHorizon: 0x7b86c4,
  fog: 0x5a6499,

  ground: 0x4c6b57,
  groundTint: 0x5b7d6a, // Second green, blended in patches so the field isn't flat.
  // Deliberately lighter than the ground: thin blades catch far less light than
  // a broad surface, so a "matching" green renders as near-black twigs.
  grass: 0x9cc79b,

  moon: 0xcfd8ff,
  hemiSky: 0x8592d6,
  hemiGround: 0x3d5a45,

  // Saturated on purpose: a pale blush renders as flat white out here and the
  // mushrooms stop reading as pink at all.
  mushroomCap: 0xe490ae,
  mushroomGlow: 0xffb877,
  mushroomStem: 0xdcd5e8,

  // Collectibles. The burst colours are what the particle spray uses, and they
  // are pushed brighter than the item itself so the reward reads at a glance.
  petal: 0xf0d192,
  petalEmissive: 0xffcf7a,
  petalBurst: 0xffdf9e,

  seed: 0xf2a7c3,
  seedEmissive: 0xff8fbb,
  seedGlow: 0xffb6d5,
  seedBurst: 0xffc0dc,

  // Dirt patches. The rim colour is close to the ground so the disc fades into
  // the moss instead of sitting on it like a sticker.
  dirt: 0x3b2b23,
  dirtRim: 0x46583f,
  patchGlow: 0xbfe3c0, // Mint invitation, only shown when she has a seed.

  // Flowers. One of these per bloom, picked at random — the whole game palette,
  // so no two neighbours are guaranteed to clash or to match.
  flowerPalette: [0xc9b6f0, 0xa8e0c8, 0xffc9a3, 0xf7b8d0, 0xa9cdf0, 0xf5dd9c],
  flowerCentre: 0xfff0c4,
  flowerStem: 0x7fae7c,
  flowerEye: 0x2e2a3d,

  // High-contrast mode. Same hues, pushed much lighter and hotter, because the
  // point is separation from the moss rather than a different-looking garden.
  // A child who can't pick a petal out of the grass should still recognise the
  // colour when she can.
  petalHi: 0xfff0c8,
  seedHi: 0xffd0e4,
  patchGlowHi: 0xdcffe8,
}
