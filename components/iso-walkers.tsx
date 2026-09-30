import { useIsFocused } from "expo-router";
import React, { useEffect, useState } from "react";
import { GeoJSONSource, Images, Layer } from "@maplibre/maplibre-react-native";
import { useReducedMotion } from "react-native-reanimated";

import { WALKER_ICON, WALKER_ICONS } from "@/components/walker-icons.generated";
import { lngLatToPlane, planeToLngLat } from "@/lib/iso";
import { ISO_WALKS } from "@/lib/iso-walks.generated";
import { FIG_H, WALKERS } from "@/lib/walker-cast";

/** What the map shows: its bounds (west, south, east, north, on the engine's globe) and zoom. */
export type MapView = { bounds: [number, number, number, number]; zoom: number } | null;

/** From this zoom the walkers are big enough to see. */
export const WALKERS_FROM_ZOOM = 15.6;
const FRAME_MS = 50;
/** A street's worth of drawing, square metres, for each walker in view. */
const ROOM_EACH = 10_000;

// ── The streets, as the walkers need them ─────────────────────────────────
type Net = {
  x: Float64Array;
  y: Float64Array;
  a: Uint32Array;
  b: Uint32Array;
  /** Walking length of each stretch: a climb out of sight is quick. */
  len: Float64Array;
  from: number[][];
  hidden: Record<number, number[]>;
  cells: Map<string, number[]>;
};
const CELL = 150;
let net: Net | null = null;
function streets(): Net {
  if (net) return net;
  const { nodes, links, hidden } = ISO_WALKS;
  const n = nodes.length / 2;
  const m = links.length / 2;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) [x[i], y[i]] = [nodes[2 * i], nodes[2 * i + 1]];
  const a = new Uint32Array(m);
  const b = new Uint32Array(m);
  const len = new Float64Array(m);
  const from: number[][] = Array.from({ length: n }, () => []);
  const cells = new Map<string, number[]>();
  for (let i = 0; i < m; i++) {
    [a[i], b[i]] = [links[2 * i], links[2 * i + 1]];
    const out = hidden[i];
    const full = out && out.length === 2 && out[0] === 0 && out[1] === 1;
    len[i] = full ? 3 : Math.max(0.5, Math.hypot(x[b[i]] - x[a[i]], y[b[i]] - y[a[i]]));
    from[a[i]].push(i);
    from[b[i]].push(i);
    const k = `${Math.floor((x[a[i]] + x[b[i]]) / 2 / CELL)},${Math.floor((y[a[i]] + y[b[i]]) / 2 / CELL)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
  }
  net = { x, y, a, b, len, from, hidden, cells };
  return net;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxOf = (view: NonNullable<MapView>): Box => {
  const [w, s, e, n] = view.bounds;
  const p = lngLatToPlane(w, s);
  const q = lngLatToPlane(e, n);
  return { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) };
};

// ── The walkers ───────────────────────────────────────────────────────────
interface Walker {
  fig: number;
  link: number;
  /** 1 walking a → b, -1 b → a. */
  dir: 1 | -1;
  t: number;
  speed: number; // metres of the drawing a second
  pause: number;
  step: number;
  fade: number;
  seen: number;
  leaving: boolean;
  face: "r" | "l";
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** A stretch of street somewhere in view. */
function streetIn(box: Box): number | null {
  const s = streets();
  const found: number[] = [];
  for (let cx = Math.floor(box.x0 / CELL); cx <= Math.floor(box.x1 / CELL); cx++) {
    for (let cy = Math.floor(box.y0 / CELL); cy <= Math.floor(box.y1 / CELL); cy++) {
      for (const i of s.cells.get(`${cx},${cy}`) ?? []) {
        const mx = (s.x[s.a[i]] + s.x[s.b[i]]) / 2;
        const my = (s.y[s.a[i]] + s.y[s.b[i]]) / 2;
        if (mx > box.x0 && mx < box.x1 && my > box.y0 && my < box.y1) found.push(i);
      }
    }
  }
  return found.length ? pick(found) : null;
}

function place(w: Walker, box: Box, fig: number): boolean {
  const link = streetIn(box);
  if (link === null) return false;
  Object.assign(w, {
    fig,
    link,
    dir: Math.random() < 0.5 ? 1 : -1,
    t: Math.random(),
    speed: 3.2 + Math.random() * 2.2,
    pause: 0,
    step: Math.random() * Math.PI,
    fade: 0,
    seen: 1,
    leaving: false,
  });
  return true;
}

function where(w: Walker) {
  const s = streets();
  const [p, q] = w.dir === 1 ? [s.a[w.link], s.b[w.link]] : [s.b[w.link], s.a[w.link]];
  return { x: s.x[p] + (s.x[q] - s.x[p]) * w.t, y: s.y[p] + (s.y[q] - s.y[p]) * w.t, dx: s.x[q] - s.x[p] };
}

/** Whether a walker this far along its stretch is out of sight. */
function behind(w: Walker) {
  const runs = streets().hidden[w.link];
  if (!runs) return false;
  const f = w.dir === 1 ? w.t : 1 - w.t;
  for (let i = 0; i < runs.length; i += 2) if (f >= runs[i] && f <= runs[i + 1]) return true;
  return false;
}

/** One frame of one walker's stroll. */
function stroll(w: Walker, dt: number) {
  const s = streets();
  if (w.leaving) {
    w.fade -= dt * 2.5;
    return;
  }
  w.fade = Math.min(1, w.fade + dt * 2.5);
  if (w.pause > 0) w.pause -= dt;
  else {
    w.t += (w.speed * dt) / s.len[w.link];
    w.step += (w.speed * dt) / 2.4;
    if (w.t >= 1) {
      // A corner: carry on, turn, stop a moment and look about — or go in somewhere.
      const here = w.dir === 1 ? s.b[w.link] : s.a[w.link];
      const ways = s.from[here].filter((l) => l !== w.link);
      const next = ways.length ? pick(ways) : w.link;
      w.link = next;
      w.dir = s.a[next] === here ? 1 : -1;
      w.t = 0;
      if (Math.random() < 0.12) w.pause = 0.8 + Math.random() * 1.8;
      else if (Math.random() < 0.04) w.leaving = true;
    }
  }
  w.seen += ((behind(w) ? 0 : 1) - w.seen) * Math.min(1, dt * 9);
  const { dx } = where(w);
  if (Math.abs(dx) > 0.01) w.face = dx > 0 ? "r" : "l";
}

/** The icon for a walker's figure, stride and facing. */
function icon(w: Walker, still: boolean) {
  const lift = still || w.pause > 0 ? 0 : Math.abs(Math.sin(w.step));
  const stride = Math.min(WALKER_ICON.strides - 1, Math.floor(lift * WALKER_ICON.strides));
  return `${WALKERS[w.fig]}-${stride}${w.face}`;
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/**
 * The guide's architects out walking the city map, as they walk the cover's
 * streets: a few in view at a time, strolling the streets, turning at the
 * corners at random, stopping now and then, slipping behind the houses and
 * trees in front of them (scripts/iso/walks.ts works out where) and
 * appearing or going in somewhere along the way. Shown from close in; with
 * Reduce Motion they stand still.
 */
export function IsoWalkers({ view }: { view: React.RefObject<MapView> }) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const [data, setData] = useState<GeoJSON.FeatureCollection>(EMPTY);

  useEffect(() => {
    if (!focused) return;
    const crowd: Walker[] = [];
    let last = Date.now();
    let placedFor = "";
    let wasEmpty = true;
    let wasSig = "";
    const frame = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = view.current;
      if (!v || v.zoom < WALKERS_FROM_ZOOM - 0.1) {
        crowd.length = 0;
        if (!wasEmpty) setData(EMPTY);
        wasEmpty = true;
        return;
      }
      const box = boxOf(v);
      const margin = 40;
      const wide = { x0: box.x0 - margin, y0: box.y0 - margin, x1: box.x1 + margin, y1: box.y1 + margin };
      // With Reduce Motion, placed once for each view, and left standing.
      const key = `${Math.round(box.x0)},${Math.round(box.y0)},${Math.round(box.x1)}`;
      if (reduceMotion && key === placedFor) return;
      placedFor = key;
      const want = Math.max(4, Math.min(16, Math.round(((box.x1 - box.x0) * (box.y1 - box.y0)) / ROOM_EACH)));
      while (crowd.length > want) crowd.pop();
      while (crowd.length < want) {
        const w = { face: "r" } as Walker;
        if (!place(w, box, (crowd.length * 5 + Math.floor(Math.random() * 3)) % WALKERS.length)) break;
        if (reduceMotion) w.fade = 1;
        crowd.push(w);
      }
      const features = [];
      const sig: string[] = [];
      for (const w of crowd) {
        if (!reduceMotion) stroll(w, dt);
        const p = where(w);
        // Gone in, or off the edge of the view: somewhere else in view instead.
        if ((w.leaving && w.fade <= 0) || p.x < wide.x0 || p.x > wide.x1 || p.y < wide.y0 || p.y > wide.y1) {
          place(w, box, w.fig);
          continue;
        }
        const o = w.fade * w.seen;
        if (o < 0.02) continue;
        const at = planeToLngLat(p.x, p.y);
        const ic = icon(w, reduceMotion);
        sig.push(`${ic}${at[0].toFixed(6)},${at[1].toFixed(6)},${(o * 10) | 0}`);
        features.push({
          type: "Feature" as const,
          properties: { icon: ic, o: Math.round(o * 100) / 100 },
          geometry: { type: "Point" as const, coordinates: at },
        });
      }
      // Nothing the map would draw differently: don't touch the source.
      const joined = sig.join("|");
      if (joined === wasSig) return;
      wasSig = joined;
      wasEmpty = features.length === 0;
      setData(wasEmpty ? EMPTY : { type: "FeatureCollection", features });
    };
    const id = setInterval(frame, FRAME_MS);
    return () => clearInterval(id);
  }, [focused, reduceMotion, view]);

  // A figure is ISO_WALKS.height metres of the drawing tall, whatever the zoom.
  const unitAt = (z: number) => ((ISO_WALKS.height / FIG_H) * 2 ** z) / 78271.5 / WALKER_ICON.px;
  return (
    <>
      <Images images={WALKER_ICONS} />
      <GeoJSONSource id="walkers" data={data}>
        <Layer
          id="walkers"
          type="symbol"
          // Standing on the street, over its name painted on the ground.
          beforeId="places"
          minzoom={WALKERS_FROM_ZOOM - 0.1}
          layout={{
            "icon-image": ["get", "icon"],
            "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 15, unitAt(15), 20, unitAt(20)],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "symbol-z-order": "viewport-y",
          }}
          paint={{
            // (The engine takes zoom only at the top of an expression.)
            "icon-opacity": ["interpolate", ["linear"], ["zoom"], WALKERS_FROM_ZOOM - 0.1, 0, WALKERS_FROM_ZOOM + 0.4, ["get", "o"]],
          }}
        />
      </GeoJSONSource>
    </>
  );
}
