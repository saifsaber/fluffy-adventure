/**
 * The manager's choices, and the fixture they build.
 *
 * Lives in `@dakka/fixture` now, because the API must build the same fixture from the same choices
 * — a client may send what it decides, never what it is made of. Re-exported here so the screens
 * keep one import path.
 */
export {
  APPROACHES,
  LINES,
  PRESSES,
  buildFixture as buildMatch,
  seedOf,
  yourSide,
} from '@dakka/fixture';
export type { Approach, Call, Line, Press, Setup } from '@dakka/fixture';
