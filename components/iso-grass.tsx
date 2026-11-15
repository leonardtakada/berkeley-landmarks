import { useIsFocused } from "expo-router";
import React, { useCallback, useEffect, useRef, type RefObject } from "react";
import { GeoJSONSource, Layer, type MapRef } from "@maplibre/maplibre-react-native";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import type { MapView } from "@/components/iso-walkers";
import { GRASS_FROM_ZOOM, lawnsOf, WIND, windFrame, windTime, type Lawn } from "@/lib/grass";
import { lngLatToPlane } from "@/lib/iso";

const EMPTY = '{"type":"FeatureCollection","features":[]}';
/** How often the map is given the wind's new shape: fifteen times a second (as an animated film draws on twos). */
const EMIT_S = 1 / 15;
/** Once the map has come to rest, how long before the lawns in view are looked for, ms — and again, for tiles still loading. */
const SETTLE_MS = [250, 1500];

const GrassSource = Animated.createAnimatedComponent(GeoJSONSource);

/** The view on the drawing, metres, from the map's bounds. */
function boxOf(v: NonNullable<MapView>) {
  "worklet";
  const R = 6378137;
  const [w, s, e, n] = v.bounds;
  const py = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x0: (w * Math.PI * R) / 180, y0: py(s), x1: (e * Math.PI * R) / 180, y1: py(n) };
}

/**
 * The wind over the lawns of the city map, close in (lib/grass.ts). When the
 * map comes to rest, it asks the map which lawns are in view (the tiles'
 * unseen `lawns`); then, on the UI thread, rolls the gusts across them a
 * frame at a time. With Reduce Motion, the light lies still on the grass.
 */
export function IsoGrass({ view, map }: { view: SharedValue<MapView>; map: RefObject<MapRef | null> }) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const lawns = useSharedValue<Lawn[]>([]);
  const data = useSharedValue(EMPTY);
  const clock = useSharedValue({ since: 0, last: EMPTY });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const find = useCallback(
    async (v: NonNullable<MapView>) => {
      if (v.zoom < GRASS_FROM_ZOOM - 0.1) {
        lawns.set([]);
        return;
      }
      try {
        const features = await map.current?.queryRenderedFeatures({ layers: ["lawns"] });
        const [w, s, e, n] = v.bounds;
        const a = lngLatToPlane(w, s);
        const b = lngLatToPlane(e, n);
        // (A margin round the view, so the edges are ready as it's panned.)
        const pad = Math.max(30, (b.x - a.x) * 0.25);
        lawns.set(lawnsOf((features ?? []) as Parameters<typeof lawnsOf>[0], { x0: a.x - pad, y0: a.y - pad, x1: b.x + pad, y1: b.y + pad }));
      } catch {
        // (The map gone, or its style not loaded yet: no wind this time.)
      }
    },
    [map, lawns],
  );

  // When the map comes to rest (a little after it last moved), find the lawns in view.
  const settle = useCallback(
    (v: NonNullable<MapView>) => {
      for (const id of timers.current) clearTimeout(id);
      timers.current = SETTLE_MS.map((ms) => setTimeout(() => find(v), ms));
    },
    [find],
  );
  useAnimatedReaction(
    () => view.get(),
    (v, was) => {
      if (v && v !== was) runOnJS(settle)(v);
    },
  );
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const frame = useFrameCallback((info) => {
    const c = clock.get();
    const dt = Math.min(0.1, (info.timeSincePreviousFrame ?? 16) / 1000);
    c.since += dt;
    if (c.since < EMIT_S - 0.004) return;
    c.since = 0;
    const v = view.get();
    const ls = lawns.get();
    // (The wind's time is the wall clock's, so the trees lean with the same gusts: components/iso-tree-sway.tsx.)
    const json = !v || v.zoom < GRASS_FROM_ZOOM - 0.1 || !ls.length ? EMPTY : windFrame(ls, boxOf(v), reduceMotion ? 0 : windTime(), reduceMotion);
    if (json === c.last) return;
    c.last = json;
    data.set(json);
  }, false);

  // Only while the map is the page showing.
  useEffect(() => {
    frame.setActive(focused);
    return () => frame.setActive(false);
  }, [focused, frame]);

  const animatedProps = useAnimatedProps(() => ({ data: data.get() }));

  const fadeIn = (value: unknown) =>
    ["interpolate", ["linear"], ["zoom"], GRASS_FROM_ZOOM - 0.1, 0, GRASS_FROM_ZOOM + 0.4, value] as unknown as ExpressionSpecification;
  const along = (...stops: (number | string)[]) => ["interpolate", ["linear"], ["line-progress"], ...stops] as unknown as ExpressionSpecification;
  const width = (k: number) => ["interpolate", ["exponential", 2], ["zoom"], 16, 0.8 * k, 18.5, 2.4 * k] as unknown as ExpressionSpecification;

  return (
    <GrassSource id="grass" data={EMPTY} lineMetrics animatedProps={animatedProps}>
      {/* The gusts' bands on the grass: the shadow in each one's wake, its glow, its light — under the creeks, the streets and everything standing. */}
      <Layer
        id="grass-bands"
        type="fill"
        beforeId="creeks"
        minzoom={GRASS_FROM_ZOOM - 0.1}
        filter={["<=", ["get", "g"], WIND.crest]}
        layout={{ "fill-sort-key": ["get", "g"] }}
        paint={{
          "fill-color": ["match", ["get", "g"], WIND.trough, "#B3D4C8", WIND.halo, "#E4F3EE", "#F5FCFA"],
          "fill-opacity": fadeIn(["*", ["get", "o"], ["match", ["get", "g"], WIND.trough, 0.85, WIND.halo, 0.8, 0.65]]),
          // (Pieces of a band meet edge to edge: no anti-aliased seam between them.)
          "fill-antialias": false,
        }}
      />
      {/* And in them the same grass, pressed over in the light, springing back in the wake (scripts/iso/grass-texture.ts). */}
      <Layer
        id="grass-bent"
        type="fill"
        beforeId="creeks"
        minzoom={GRASS_FROM_ZOOM - 0.1}
        filter={["<=", ["get", "g"], WIND.halo]}
        paint={{
          "fill-pattern": ["match", ["get", "g"], WIND.trough, "grass-back", "grass-bent"] as unknown as ExpressionSpecification,
          "fill-opacity": fadeIn(["min", 1, ["*", 1.35, ["get", "o"]]]),
          "fill-antialias": false,
        }}
      />
      {/* Streaks of light streaming through the crests. */}
      <Layer
        id="grass-streaks"
        type="line"
        beforeId="creeks"
        minzoom={GRASS_FROM_ZOOM - 0.1}
        filter={["==", ["get", "g"], WIND.streak]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-gradient": along(0, "rgba(255,255,240,0)", 0.45, "rgba(255,255,240,0.95)", 1, "rgba(255,255,240,0)"),
          "line-width": width(1),
          "line-opacity": fadeIn(["get", "o"]),
        }}
      />
      {/* The wind lines riding the crests, and the leaves blown along: in the air, over the streets, under what stands. */}
      <Layer
        id="grass-wind"
        type="line"
        beforeId="solids"
        minzoom={GRASS_FROM_ZOOM - 0.1}
        filter={["==", ["get", "g"], WIND.line]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-gradient": along(0, "rgba(255,255,255,0)", 0.3, "rgba(255,255,252,0.85)", 0.65, "rgba(255,255,252,1)", 1, "rgba(255,255,255,0)"),
          "line-width": width(1.2),
          "line-opacity": fadeIn(["get", "o"]),
        }}
      />
      <Layer
        id="grass-leaves"
        type="fill"
        beforeId="solids"
        minzoom={GRASS_FROM_ZOOM - 0.1}
        filter={["==", ["get", "g"], WIND.leaf]}
        paint={{ "fill-color": ["case", ["==", ["get", "c"], 1], "#E4592B", "#4F9A8C"] }}
      />
    </GrassSource>
  );
}
