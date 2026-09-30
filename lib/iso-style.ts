/**
 * The isometric city map's style (tiles from scripts/iso/city.ts): every
 * piece fills in its own colour, in its own place in the drawing order;
 * the streets are paper, their names small tracked capitals, the districts
 * larger ones in blue.
 */
/** The type the map's lettering is set in: the Noto Sans glyphs bundled with the map. */
const FONT_STACK = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Bold"] };

/** Line width, in points, of something `m` metres wide on the drawing, at any zoom. */
const metres = (m: number | unknown[]) => [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  10,
  ["*", m, 1024 / 78271.5],
  20,
  ["*", m, 1048576 / 78271.5],
];

export function isoStyle(source: { pmtilesUri: string; glyphsUrl: string }) {
  return {
    version: 8,
    name: "berkeley-iso",
    glyphs: source.glyphsUrl,
    sources: { iso: { type: "vector", url: source.pmtilesUri } },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": "#FAF6EC" } },
      {
        id: "ground",
        type: "fill",
        source: "iso",
        "source-layer": "ground",
        layout: { "fill-sort-key": ["get", "s"] },
        // No anti-aliased edges: the engine draws them in a pass after the fills,
        // so the edges of faces behind would show through the ones in front.
        paint: { "fill-color": ["get", "c"], "fill-antialias": false },
      },
      {
        id: "waves",
        type: "line",
        source: "iso",
        "source-layer": "waves",
        minzoom: 14,
        paint: { "line-color": ["get", "c"], "line-width": 1.2 },
      },
      {
        id: "minor",
        type: "line",
        source: "iso",
        "source-layer": "minor",
        minzoom: 13,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FDFAF2", "line-width": metres(["*", ["get", "w"], 0.8]) },
      },
      {
        id: "major",
        type: "line",
        source: "iso",
        "source-layer": "major",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#FDFAF2",
          // Far out, a fine line; close in, the street's own width.
          "line-width": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            11,
            1.3,
            14,
            ["*", ["get", "w"], (0.8 * 16384) / 78271.5],
            20,
            ["*", ["get", "w"], (0.8 * 1048576) / 78271.5],
          ],
        },
      },
      {
        id: "landmarks-far",
        type: "fill",
        source: "iso",
        "source-layer": "lm",
        maxzoom: 14,
        layout: { "fill-sort-key": ["get", "s"] },
        // No anti-aliased edges: the engine draws them in a pass after the fills,
        // so the edges of faces behind would show through the ones in front.
        paint: { "fill-color": ["get", "c"], "fill-antialias": false },
      },
      {
        id: "solids",
        type: "fill",
        source: "iso",
        "source-layer": "solids",
        minzoom: 14,
        // Trees only once there's room to see them.
        filter: ["any", ["!=", ["get", "t"], 1], [">=", ["zoom"], 15]],
        layout: { "fill-sort-key": ["get", "s"] },
        // No anti-aliased edges: the engine draws them in a pass after the fills,
        // so the edges of faces behind would show through the ones in front.
        paint: { "fill-color": ["get", "c"], "fill-antialias": false },
      },
      {
        id: "street-names",
        type: "symbol",
        source: "iso",
        "source-layer": "names",
        minzoom: 14,
        // The main streets named first; the rest once there's room.
        filter: ["any", ["==", ["get", "major"], 1], [">=", ["zoom"], 15.5]],
        layout: {
          "symbol-placement": "line",
          "text-field": ["upcase", ["get", "name"]],
          "text-font": FONT_STACK.regular,
          "text-size": 9.5,
          "text-letter-spacing": 0.18,
          "symbol-spacing": 320,
          "text-max-angle": 30,
        },
        paint: { "text-color": "#6E6252", "text-halo-color": "#FDFAF2", "text-halo-width": 1.4 },
      },
      {
        id: "places",
        type: "symbol",
        source: "iso",
        "source-layer": "places",
        maxzoom: 14.2,
        layout: {
          "text-field": ["get", "name"],
          "text-font": FONT_STACK.bold,
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 14],
          "text-letter-spacing": 0.3,
          "text-max-width": 8,
        },
        paint: {
          "text-color": "#0B2E8C",
          "text-halo-color": "#FAF6EC",
          "text-halo-width": 1.6,
          // Gone before a walk's own map, where they'd lie over its route.
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 13.2, 1, 14.2, 0],
        },
      },
    ],
  };
}
