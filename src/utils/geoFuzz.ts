/**
 * Rounds a geographic coordinate to exactly 3 decimal places (~110m grid)
 * for public privacy protection.
 */
export function roundToThreeDecimals(coord: number): number {
  return Math.round(coord * 1000) / 1000;
}
