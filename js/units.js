/**
 * units.js — weight unit conversion.
 *
 * Everything is stored in kilograms. We only convert at the edges:
 *   - when showing a number on screen  -> kgToDisplay / formatWeight
 *   - when reading a number the user typed -> displayToKg
 * That way switching lbs <-> kg never changes your data, just how it looks.
 */

export const KG_PER_LB = 0.45359237;

/** An exercise's own unit override wins; otherwise use the global setting. */
export const unitFor = (exercise, globalUnit) => exercise?.unit || globalUnit;

/** kg -> number in the display unit, rounded to 2 decimals (so 225 lbs stays 225). */
export function kgToDisplay(kg, unit) {
  if (kg == null) return null;
  const v = unit === 'lbs' ? kg / KG_PER_LB : kg;
  return Math.round(v * 100) / 100;
}

export function displayToKg(value, unit) {
  if (value == null) return null;
  return unit === 'lbs' ? value * KG_PER_LB : value;
}

/** Text for an input or label: '' when there's no weight. */
export function formatWeight(kg, unit) {
  const v = kgToDisplay(kg, unit);
  return v == null ? '' : String(v);
}
