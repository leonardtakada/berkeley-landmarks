/**
 * Approximate Berkeley, CA city limits boundary coordinates.
 * Traced from public GIS data — ~40 points following the actual boundary.
 * Ordered clockwise.
 */
export const BERKELEY_BOUNDARY: Array<{ latitude: number; longitude: number }> = [
  // NW corner — Albany border, along shoreline
  { latitude: 37.8965, longitude: -122.3240 },
  { latitude: 37.8940, longitude: -122.3220 },
  { latitude: 37.8915, longitude: -122.3170 },
  // North along Codornices Creek / Albany border
  { latitude: 37.8935, longitude: -122.3130 },
  { latitude: 37.8960, longitude: -122.3020 },
  { latitude: 37.8985, longitude: -122.2920 },
  { latitude: 37.9010, longitude: -122.2820 },
  // NE — Berkeley Hills ridgeline (along Tilden Park / county line)
  { latitude: 37.9025, longitude: -122.2720 },
  { latitude: 37.9035, longitude: -122.2630 },
  { latitude: 37.9038, longitude: -122.2550 },
  { latitude: 37.9030, longitude: -122.2470 },
  { latitude: 37.9015, longitude: -122.2400 },
  { latitude: 37.8990, longitude: -122.2340 },
  { latitude: 37.8960, longitude: -122.2290 },
  { latitude: 37.8930, longitude: -122.2260 },
  // East ridge — border with Contra Costa / Orinda
  { latitude: 37.8890, longitude: -122.2240 },
  { latitude: 37.8840, longitude: -122.2225 },
  { latitude: 37.8790, longitude: -122.2220 },
  { latitude: 37.8740, longitude: -122.2228 },
  { latitude: 37.8690, longitude: -122.2245 },
  { latitude: 37.8640, longitude: -122.2270 },
  // SE — Oakland border (along hillside / Claremont area)
  { latitude: 37.8590, longitude: -122.2300 },
  { latitude: 37.8555, longitude: -122.2340 },
  { latitude: 37.8525, longitude: -122.2385 },
  { latitude: 37.8500, longitude: -122.2440 },
  { latitude: 37.8480, longitude: -122.2500 },
  // South — Oakland/Emeryville border (along Ashby Ave corridor)
  { latitude: 37.8465, longitude: -122.2570 },
  { latitude: 37.8460, longitude: -122.2640 },
  { latitude: 37.8455, longitude: -122.2710 },
  { latitude: 37.8455, longitude: -122.2780 },
  { latitude: 37.8460, longitude: -122.2850 },
  { latitude: 37.8470, longitude: -122.2930 },
  // SW — Emeryville border, along shoreline
  { latitude: 37.8480, longitude: -122.3000 },
  { latitude: 37.8500, longitude: -122.3070 },
  { latitude: 37.8530, longitude: -122.3130 },
  { latitude: 37.8560, longitude: -122.3175 },
  { latitude: 37.8600, longitude: -122.3210 },
  { latitude: 37.8640, longitude: -122.3235 },
  // West — along SF Bay waterfront (Marina, Cesar Chavez Park)
  { latitude: 37.8685, longitude: -122.3255 },
  { latitude: 37.8730, longitude: -122.3270 },
  { latitude: 37.8780, longitude: -122.3275 },
  { latitude: 37.8830, longitude: -122.3270 },
  { latitude: 37.8880, longitude: -122.3255 },
  { latitude: 37.8920, longitude: -122.3245 },
];
