/**
 * Travel distance between clubs.
 *
 * In the Egyptian fourth division this is not flavour. A side from Kom Ombo playing in Kafr El
 * Sheikh has spent most of a day on a coach before kickoff, and that shows up in the last twenty
 * minutes. The engine takes it as a fatigue input; this module only measures it.
 *
 * The coordinates come from the club data files, so a new country brings its own distances with it
 * and nothing here changes.
 */

export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance, in kilometres.
 *
 * Haversine rather than a flat-earth approximation: Egypt spans about 10 degrees of latitude, where
 * the flat approximation is already off by tens of kilometres, and the same function has to hold
 * when the product reaches Brazil or Indonesia.
 */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Road distance is longer than the straight line. 1.25 is the usual planning multiplier for a
 * developed road network, and Egypt's Nile-valley roads follow the river rather than the crow.
 *
 * This is an estimate and is labelled as one. It is not presented to the player as a measured
 * distance, and nothing downstream may treat it as one.
 */
const ROAD_FACTOR = 1.25;

export function estimatedRoadKm(a: Coordinates, b: Coordinates): number {
  return distanceKm(a, b) * ROAD_FACTOR;
}

/**
 * The away side's travel burden for a fixture, 0 to 1.
 *
 * Zero for a home side and for a local derby; approaching 1 for the longest trip in the country.
 * `longestTripKm` is passed in rather than hardcoded so the scale is set by the league actually
 * being played — a 20-club Egyptian division and a Vietnamese one calibrate themselves.
 */
export function travelBurden(roadKm: number, longestTripKm: number): number {
  if (longestTripKm <= 0) return 0;
  return Math.min(1, Math.max(0, roadKm / longestTripKm));
}
