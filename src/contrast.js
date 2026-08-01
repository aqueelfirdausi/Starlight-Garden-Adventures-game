/**
 * High-contrast mode: one switch, four places it lands.
 *
 * Each target owns what "easier to see" means for the thing it draws, because
 * only sky.js knows how its keyframe table wants to be multiplied and only
 * firefly.js knows how far its additive sprites can be pushed before they clip
 * to white. This file just holds the boolean and passes it on, which is why it
 * is five lines of logic and no numbers at all.
 *
 * The flag lives in memory only. A reload starts the garden back in its normal
 * look, which is the intended behaviour — she is not expected to find a setting
 * twice, and there is no settings screen to find it in.
 */
export function createContrast(targets) {
  let enabled = false

  function apply() {
    for (const target of targets) target.setContrast(enabled)
  }

  return {
    get enabled() {
      return enabled
    },

    set(value) {
      enabled = Boolean(value)
      apply()
      return enabled
    },

    toggle() {
      return this.set(!enabled)
    },
  }
}
