import type { ClubId, Named } from './ids.js';
import type { Player } from './player.js';

export interface Stadium extends Named {
  readonly capacity: number;
  /** 0–100. A poor surface suppresses short passing and dribbling — a real lower-league factor. */
  readonly pitchQuality: number;
}

export interface Club extends Named {
  readonly id: ClubId;
  /** ISO-3166 alpha-3, e.g. "EGY". Leagues are data, never code — see global-strategy §8.4. */
  readonly country: string;
  /** Region within the country, used for travel distance and local-derby detection. */
  readonly region: string;
  readonly stadium: Stadium;
  readonly squad: readonly Player[];
  /** 0–100. Feeds crowd effects and, later, finances. */
  readonly reputation: number;
}
