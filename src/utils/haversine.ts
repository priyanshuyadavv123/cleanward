/**
 * Calculates the great-circle distance between two geographic coordinates
 * using the Haversine formula in meters.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if two coordinate pairs are within a given proximity threshold in meters.
 */
export function isWithinProximity(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  thresholdMeters = 30
): boolean {
  return haversineDistanceMeters(lat1, lon1, lat2, lon2) <= thresholdMeters;
}
