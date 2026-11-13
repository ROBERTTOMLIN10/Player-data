import { normalizePlayerName } from "./nameNormalization.js";

/**
 * GPS sensors that carry someone else's name in the Titan export. The player
 * who actually wore it is listed here, and every import (the app's and the
 * preview's) counts that row for them.
 */
const SENSOR_WORN_BY: Record<string, string> = {
  // Andy Dunn's sensor is worn by Fran Aiello (Francesco in the GPS files).
  "andy dunn": "Francesco Aiello",
};

/** The player who wore a sensor, given the name the export shows. */
export function sensorWearer(rawName: string): string {
  return SENSOR_WORN_BY[normalizePlayerName(rawName)] ?? rawName.trim();
}
