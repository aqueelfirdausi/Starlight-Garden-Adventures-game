/**
 * What the garden remembers.
 *
 * Phase 2 kept its tallies inside collectibles.js, which was fine while nothing
 * else needed them. Planting changes that: patches have to SPEND a seed that
 * collectibles earned, so the numbers move out here where both can reach them.
 *
 * Note the distinction between seeds held and seeds collected. Held is an
 * inventory that planting draws down; collected only ever goes up. Conflating
 * the two would mean planting quietly erases the record of what she found.
 */
export function createGardenState() {
  const state = {
    petals: 0, // Cumulative.
    seedsCollected: 0, // Cumulative.
    seedsHeld: 0, // Spendable inventory.
    flowers: 0, // Flowers planted, for Phase 4's constellation trigger.
    total: 0, // Everything ever gathered.
  }

  return {
    /** Snapshot, so a reader can't mutate the real tallies by accident. */
    get counts() {
      return {
        ...state,
        // `seeds` is what Phase 2 exposed. Kept as an alias for the inventory,
        // which is the number a HUD would want to show.
        seeds: state.seedsHeld,
      }
    },

    // Individual getters as well as `counts`, because the HUD samples these
    // every frame and `counts` builds a fresh object each time it is read.
    // Three property reads per frame is nothing; 60 short-lived objects a
    // second is a garbage collector pause in the middle of a bloom.
    get petals() {
      return state.petals
    },

    get seedsHeld() {
      return state.seedsHeld
    },

    get flowers() {
      return state.flowers
    },

    addPetal() {
      state.petals++
      state.total++
    },

    addSeed() {
      state.seedsCollected++
      state.seedsHeld++
      state.total++
    },

    /**
     * Take one seed if there is one.
     * @returns {boolean} false when empty — callers use this to stay silent
     *          rather than showing an error, which this game never does.
     */
    trySpendSeed() {
      if (state.seedsHeld <= 0) return false
      state.seedsHeld--
      return true
    },

    addFlower() {
      state.flowers++
    },
  }
}
