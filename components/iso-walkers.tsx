import { useIsFocused } from "expo-router";
import React, { useEffect, useState } from "react";
import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { ISO_WALKS } from "@/lib/iso-walks.generated";
import { FIG_H, FIG_W, LEGS, WALKERS } from "@/lib/walker-cast";
import { WALKER_SHAPES } from "@/lib/walker-shapes";

/** What the map shows: its bounds (west, south, east, north, on the engine's globe) and zoom. */
export type MapView = { bounds: [number, number, number, number]; zoom: number } | null;

/** From this zoom the walkers are big enough to see. */
export const WALKERS_FROM_ZOOM = 15.6;
/** How often the map is given the walkers' new places: thirty times a second. */
const EMIT_S = 1 / 30;
/** A street's worth of drawing, square metres, for each walker in view. */
const ROOM_EACH = 10_000;
const FEWEST = 4;
const MOST = 16;
/** Out of sight or into view, how long a walker takes to go or come, seconds. */
const FADE_S = 0.2;
/** Metres a walker keeps to the right of the street's middle. */
const KEEP_RIGHT = 2.5;
/**
 * How far one stride (both feet) carries a walker, metres of the drawing:
 * each foot travels the reach of the legs' swing while it's on the ground,
 * so the feet don't slide.
 */
const STRIDE_M =
  ((4 * LEGS.height * Math.sin((LEGS.swing * Math.PI) / 180)) / FIG_H) * ISO_WALKS.height;
/** Metres of the drawing to a unit of the figure's box. */
const UNIT = ISO_WALKS.height / FIG_H;
const R = 6378137;
/** Degrees to a metre of the drawing: the engine's globe, so near 0°, 0° that it's flat to a few millimetres. */
const DEG = 180 / (Math.PI * R);
const COS30 = Math.cos(Math.PI / 6);
const CELL = 150;
const EMPTY = '{"type":"FeatureCollection","features":[]}';

// ── The streets, as the walkers need them ─────────────────────────────────
/** Flat arrays all, so the whole net can be handed to the UI thread once. */
type Net = {
  x: Float64Array;
  y: Float64Array;
  a: Uint32Array;
  b: Uint32Array;
  /** Walking length of each stretch: a climb out of sight is quick. */
  len: Float64Array;
  /** One metre to the right of the way from a to b, on the drawing. */
  rx: Float64Array;
  ry: Float64Array;
  /** The stretches meeting at each point: `adj[adjAt[i]…adjAt[i + 1]]`. */
  adjAt: Uint32Array;
  adj: Uint32Array;
  /** Where along each stretch it's out of sight, from–to fractions a → b: `runs[runAt[l]…runAt[l + 1]]`. */
  runAt: Uint32Array;
  runs: Float64Array;
  /** The stretches in each square of the drawing, by their middles. */
  gx: number;
  gy: number;
  cols: number;
  rows: number;
  cellAt: Uint32Array;
  cell: Uint32Array;
};

let built: Net | null = null;
function streets(): Net {
  if (built) return built;
  const { nodes, links, hidden } = ISO_WALKS;
  const n = nodes.length / 2;
  const m = links.length / 2;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) [x[i], y[i]] = [nodes[2 * i], nodes[2 * i + 1]];
  const a = new Uint32Array(m);
  const b = new Uint32Array(m);
  const len = new Float64Array(m);
  const rx = new Float64Array(m);
  const ry = new Float64Array(m);
  const degree = new Uint32Array(n + 1);
  const runAt = new Uint32Array(m + 1);
  const runList: number[] = [];
  let [gx0, gy0, gx1, gy1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m; i++) {
    [a[i], b[i]] = [links[2 * i], links[2 * i + 1]];
    const out = hidden[i] ?? [];
    const dx = x[b[i]] - x[a[i]];
    const dy = y[b[i]] - y[a[i]];
    const step = out.length === 2 && out[0] === 0 && out[1] === 1 && Math.abs(dx) < 1e-6;
    len[i] = step ? 3 : Math.max(0.5, Math.hypot(dx, dy));
    if (!step) {
      // Back from the drawing to the ground (u east, v north), turn right, and on to the drawing again.
      const du = (dx / COS30 + 2 * dy) / 2;
      const dv = (2 * dy - dx / COS30) / 2;
      const g = Math.hypot(du, dv) || 1;
      const [pu, pv] = [dv / g, -du / g];
      [rx[i], ry[i]] = [(pu - pv) * COS30, (pu + pv) / 2];
    }
    degree[a[i]]++;
    degree[b[i]]++;
    runList.push(...out);
    runAt[i + 1] = runList.length;
    const [mx, my] = [(x[a[i]] + x[b[i]]) / 2, (y[a[i]] + y[b[i]]) / 2];
    [gx0, gy0, gx1, gy1] = [Math.min(gx0, mx), Math.min(gy0, my), Math.max(gx1, mx), Math.max(gy1, my)];
  }
  const adjAt = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) adjAt[i + 1] = adjAt[i] + degree[i];
  const adj = new Uint32Array(adjAt[n]);
  const fill = adjAt.slice(0, n);
  for (let i = 0; i < m; i++) {
    adj[fill[a[i]]++] = i;
    adj[fill[b[i]]++] = i;
  }
  const cols = Math.floor((gx1 - gx0) / CELL) + 1;
  const rows = Math.floor((gy1 - gy0) / CELL) + 1;
  const cellOf = (i: number) =>
    Math.floor(((y[a[i]] + y[b[i]]) / 2 - gy0) / CELL) * cols + Math.floor(((x[a[i]] + x[b[i]]) / 2 - gx0) / CELL);
  const cellAt = new Uint32Array(cols * rows + 1);
  for (let i = 0; i < m; i++) cellAt[cellOf(i) + 1]++;
  for (let c = 0; c < cols * rows; c++) cellAt[c + 1] += cellAt[c];
  const cell = new Uint32Array(m);
  const into = cellAt.slice(0, cols * rows);
  for (let i = 0; i < m; i++) cell[into[cellOf(i)]++] = i;
  built = { x, y, a, b, len, rx, ry, adjAt, adj, runAt, runs: Float64Array.from(runList), gx: gx0, gy: gy0, cols, rows, cellAt, cell };
  return built;
}

// ── The walkers (all of this runs on the UI thread) ───────────────────────
interface Walker {
  fig: number;
  link: number;
  /** 1 walking a → b, -1 b → a. */
  dir: number;
  t: number;
  speed: number; // metres of the drawing a second
  pause: number;
  /** How far through a stride, 0–1. */
  stride: number;
  /** 0–1: there, or coming or going. */
  fade: number;
  /** 0–1: in sight, or out of it behind something. */
  seen: number;
  leaving: boolean;
  /** Seconds since told to go, while still in view. */
  lingered: number;
  face: number;
  /** Where on the street's width the walker is: eases across as they turn a corner. */
  ox: number;
  oy: number;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Crowd = { walkers: Walker[]; since: number; spawnIn: number; last: string; stillKey: string };

function boxOf(v: NonNullable<MapView>): Box {
  "worklet";
  const [w, s, e, n] = v.bounds;
  const px = (lng: number) => (lng * Math.PI * R) / 180;
  const py = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x0: px(w), y0: py(s), x1: px(e), y1: py(n) };
}

function inside(x: number, y: number, b: Box, pad: number) {
  "worklet";
  return x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad;
}

/** Where a walker stands on the drawing. */
function spot(net: Net, w: Walker) {
  "worklet";
  const [p, q] = w.dir === 1 ? [net.a[w.link], net.b[w.link]] : [net.b[w.link], net.a[w.link]];
  return { x: net.x[p] + (net.x[q] - net.x[p]) * w.t + w.ox, y: net.y[p] + (net.y[q] - net.y[p]) * w.t + w.oy };
}

/** Whether a walker this far along their stretch is out of sight. */
function behind(net: Net, w: Walker) {
  "worklet";
  const f = w.dir === 1 ? w.t : 1 - w.t;
  for (let k = net.runAt[w.link]; k < net.runAt[w.link + 1]; k += 2) {
    if (f >= net.runs[k] && f <= net.runs[k + 1]) return true;
  }
  return false;
}

/**
 * A stretch of street at random with its middle in `box` — and not in
 * `not`, if given; or only one with somewhere out of sight along it.
 */
function streetIn(net: Net, box: Box, not: Box | null, outOfSight: boolean) {
  "worklet";
  const c0 = Math.max(0, Math.floor((box.x0 - net.gx) / CELL));
  const c1 = Math.min(net.cols - 1, Math.floor((box.x1 - net.gx) / CELL));
  const r0 = Math.max(0, Math.floor((box.y0 - net.gy) / CELL));
  const r1 = Math.min(net.rows - 1, Math.floor((box.y1 - net.gy) / CELL));
  let chosen = -1;
  let seen = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = r * net.cols + c;
      for (let j = net.cellAt[k]; j < net.cellAt[k + 1]; j++) {
        const i = net.cell[j];
        if (outOfSight && net.runAt[i + 1] === net.runAt[i]) continue;
        const mx = (net.x[net.a[i]] + net.x[net.b[i]]) / 2;
        const my = (net.y[net.a[i]] + net.y[net.b[i]]) / 2;
        if (!inside(mx, my, box, 0) || (not && inside(mx, my, not, 0))) continue;
        // (One pass, every candidate equally likely.)
        seen++;
        if (Math.random() * seen < 1) chosen = i;
      }
    }
  }
  return chosen;
}

/** A walker set down on `link`, `at` of the way from a to b, headed either way. */
function setDown(net: Net, link: number, at: number, fig: number, fade: number): Walker {
  "worklet";
  const dir = Math.random() < 0.5 ? 1 : -1;
  const w: Walker = {
    fig,
    link,
    dir,
    t: dir === 1 ? at : 1 - at,
    speed: 4.5 + Math.random() * 2,
    pause: 0,
    stride: Math.random(),
    fade,
    seen: 1,
    leaving: false,
    lingered: 0,
    face: 1,
    ox: 0,
    oy: 0,
  };
  w.ox = net.rx[link] * dir * KEEP_RIGHT;
  w.oy = net.ry[link] * dir * KEEP_RIGHT;
  w.seen = behind(net, w) ? 0 : 1;
  const dx = (net.x[net.b[link]] - net.x[net.a[link]]) * dir;
  w.face = dx < 0 ? -1 : 1;
  return w;
}

/** One frame of one walker's stroll. */
function stroll(net: Net, w: Walker, dt: number) {
  "worklet";
  if (w.pause > 0) {
    w.pause -= dt;
    w.stride = 0;
  } else {
    w.t += (w.speed * dt) / net.len[w.link];
    w.stride = (w.stride + (w.speed * dt) / STRIDE_M) % 1;
    if (w.t >= 1) {
      // A corner: carry on, or turn, at random; now and then stop a moment and look about.
      const here = w.dir === 1 ? net.b[w.link] : net.a[w.link];
      const n = net.adjAt[here + 1] - net.adjAt[here];
      let next = w.link;
      if (n > 1) {
        let k = Math.floor(Math.random() * (n - 1));
        for (let j = net.adjAt[here]; j < net.adjAt[here + 1]; j++) {
          if (net.adj[j] === w.link) continue;
          if (k-- === 0) next = net.adj[j];
        }
      }
      w.link = next;
      w.dir = net.a[next] === here ? 1 : -1;
      w.t = 0;
      if (Math.random() < 0.1) w.pause = 1 + Math.random() * 2;
    }
  }
  // Across to the right-hand side of the new street, over a few steps.
  const ease = Math.min(1, dt * 3);
  w.ox += (net.rx[w.link] * w.dir * KEEP_RIGHT - w.ox) * ease;
  w.oy += (net.ry[w.link] * w.dir * KEEP_RIGHT - w.oy) * ease;
  const dx = (net.x[net.b[w.link]] - net.x[net.a[w.link]]) * w.dir;
  if (Math.abs(dx) > 0.01) w.face = dx < 0 ? -1 : 1;
  const step = dt / FADE_S;
  w.seen = behind(net, w) ? Math.max(0, w.seen - step) : Math.min(1, w.seen + step);
  w.fade = w.leaving && w.lingered > 6 ? Math.max(0, w.fade - step) : Math.min(1, w.fade + step);
}

/** A point of the figure's box, for a walker standing at x, y, as GeoJSON. */
function at(u: number, v: number, x: number, y: number, face: number) {
  "worklet";
  const gx = x + ((face === 1 ? u : FIG_W - u) - FIG_W / 2) * UNIT;
  const gy = y + (FIG_H - v) * UNIT;
  return `[${Math.round(gx * DEG * 1e7) / 1e7},${Math.round(gy * DEG * 1e7) / 1e7}]`;
}

/**
 * One walker as GeoJSON, a feature for each ink: the legs swinging from the
 * hip (one forward as the other goes back) and the body sinking as they part,
 * so the feet stay on the ground; then the coat, the head, and the hat, hair
 * or beard each is known by.
 */
function figure(it: Walker, x: number, y: number, o: number, still: boolean) {
  "worklet";
  const swing = still || it.pause > 0 ? 0 : ((LEGS.swing * Math.PI) / 180) * Math.sin(2 * Math.PI * it.stride);
  const sink = LEGS.height * (1 - Math.cos(swing));
  const parts = WALKER_SHAPES[it.fig];
  let json = "";
  for (let k = 0; k < parts.length; k++) {
    let polys = "";
    if (k === 0) {
      for (let i = 0; i < 2; i++) {
        const a = i === 0 ? swing : -swing;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        const hx = LEGS.left[i] + LEGS.width / 2;
        const hy = LEGS.top + sink;
        const w = LEGS.width / 2;
        const corner = (cx: number, cy: number) => at(hx + cx * c - cy * s, hy + cx * s + cy * c, x, y, it.face);
        const first = corner(-w, 0);
        polys += `${polys ? "," : ""}[[${first},${corner(w, 0)},${corner(w, LEGS.height)},${corner(-w, LEGS.height)},${first}]]`;
      }
    }
    for (const ring of parts[k].rings) {
      let pts = "";
      for (let j = 0; j < ring.length; j += 2) pts += (j ? "," : "") + at(ring[j], ring[j + 1] + sink, x, y, it.face);
      polys += `${polys ? "," : ""}[[${pts}]]`;
    }
    json += `${json ? "," : ""}{"type":"Feature","properties":{"c":"${parts[k].ink}","o":${o}},"geometry":{"type":"MultiPolygon","coordinates":[${polys}]}}`;
  }
  return json;
}

/**
 * One frame for the whole crowd, keeping a few in view: the first lot
 * standing about the streets as the map opens, and after that new ones
 * only where they can't be seen arriving — just out of view, or out of
 * sight behind something — and those to go, gone the same way. Returns the
 * walkers as GeoJSON for the map when it's time to, else null.
 */
function tick(crowd: Crowd, net: Net, v: MapView, dt: number, still: boolean): string | null {
  "worklet";
  if (!v || v.zoom < WALKERS_FROM_ZOOM - 0.1) {
    crowd.walkers.length = 0;
    crowd.stillKey = "";
    if (crowd.last === EMPTY) return null;
    crowd.last = EMPTY;
    return EMPTY;
  }
  const view = boxOf(v);
  const [w, h] = [view.x1 - view.x0, view.y1 - view.y0];
  const margin = Math.max(40, 0.3 * Math.max(w, h));
  const near = { x0: view.x0 - margin, y0: view.y0 - margin, x1: view.x1 + margin, y1: view.y1 + margin };
  const want = Math.max(FEWEST, Math.min(MOST, Math.round((w * h) / ROOM_EACH)));
  const ws = crowd.walkers;
  const fig = () => Math.floor(Math.random() * WALKERS.length);

  if (still) {
    // With Reduce Motion: set down once for each view, and left standing.
    const key = `${Math.round(view.x0)},${Math.round(view.y0)},${Math.round(view.x1)}`;
    if (key === crowd.stillKey) return null;
    crowd.stillKey = key;
    ws.length = 0;
    for (let k = 0; k < want; k++) {
      const link = streetIn(net, view, null, false);
      if (link >= 0) ws.push(setDown(net, link, Math.random(), fig(), 1));
    }
    for (const it of ws) it.stride = 0;
  } else {
    // Gone out of reach: let go.
    for (let i = ws.length - 1; i >= 0; i--) {
      const p = spot(net, ws[i]);
      const gone = ws[i].fade <= 0 || (ws[i].leaving && (ws[i].seen <= 0 || !inside(p.x, p.y, view, 15)));
      if (gone || !inside(p.x, p.y, near, 0)) ws.splice(i, 1);
    }
    let inView = 0;
    for (const it of ws) {
      const p = spot(net, it);
      if (!it.leaving && inside(p.x, p.y, view, 0)) inView++;
    }
    if (ws.length === 0) {
      // The map just opened here (or came close enough): people already about.
      for (let k = 0; k < want; k++) {
        const link = streetIn(net, view, null, false);
        if (link >= 0) ws.push(setDown(net, link, Math.random(), fig(), 1));
      }
    } else if (inView < want && ws.length < want * 2) {
      crowd.spawnIn -= dt;
      if (crowd.spawnIn <= 0) {
        crowd.spawnIn = 0.25;
        let link = streetIn(net, near, view, false);
        let fade = 1;
        let t = Math.random();
        if (link < 0) {
          link = streetIn(net, view, null, true);
          if (link >= 0) {
            // Out of sight to begin with, to step out from behind it.
            const k = net.runAt[link] + 2 * Math.floor(Math.random() * ((net.runAt[link + 1] - net.runAt[link]) / 2));
            t = (net.runs[k] + net.runs[k + 1]) / 2;
          } else if (inView < want / 2) {
            link = streetIn(net, view, null, false);
            fade = 0;
          }
        }
        if (link >= 0) ws.push(setDown(net, link, t, fig(), fade));
      }
    }
    // Too many about: those out of view go at once, the rest when next out of sight.
    let extra = ws.length - want * 2;
    for (let i = ws.length - 1; i >= 0 && extra > 0; i--) {
      const p = spot(net, ws[i]);
      if (!inside(p.x, p.y, view, 15)) {
        ws.splice(i, 1);
        extra--;
      }
    }
    let over = inView - want - 2;
    for (const it of ws) {
      if (over <= 0) break;
      if (!it.leaving) {
        it.leaving = true;
        over--;
      }
    }
    for (const it of ws) {
      stroll(net, it, dt);
      if (it.leaving) it.lingered += dt;
    }
    // (Every other frame at 60 Hz, every fourth at 120: a little slack for the clock.)
    crowd.since += dt;
    if (crowd.since < EMIT_S - 0.004) return null;
    crowd.since = Math.min(EMIT_S, Math.max(0, crowd.since - EMIT_S));
  }

  // Far ones first, so the nearer are laid over them.
  const shown: { it: Walker; x: number; y: number; o: number }[] = [];
  for (const it of ws) {
    const o = Math.round(it.fade * it.seen * 20) / 20;
    if (o <= 0) continue;
    const p = spot(net, it);
    if (inside(p.x, p.y, view, ISO_WALKS.height)) shown.push({ it, x: p.x, y: p.y, o });
  }
  shown.sort((m, n) => n.y - m.y);
  let out = "";
  for (const { it, x, y, o } of shown) out += (out ? "," : "") + figure(it, x, y, o, still);
  const json = `{"type":"FeatureCollection","features":[${out}]}`;
  if (json === crowd.last) return null;
  crowd.last = json;
  return json;
}

const WalkerSource = Animated.createAnimatedComponent(GeoJSONSource);

/**
 * The guide's architects out walking the city map, as they walk the cover's
 * streets: a few in view at a time, strolling on the right of the street,
 * turning at the corners at random, stopping now and then, and slipping
 * behind the houses and hills in front of them (scripts/iso/walks.ts works
 * out where). New ones arrive from out of view or from behind something,
 * and go the same way. Shown from close in; with Reduce Motion they stand
 * still.
 *
 * It all runs on the UI thread, a frame at a time, and hands the map their
 * places as GeoJSON thirty times a second.
 */
export function IsoWalkers({ view }: { view: SharedValue<MapView> }) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const net = useSharedValue<Net | null>(null);
  const crowd = useSharedValue<Crowd>({ walkers: [], since: 0, spawnIn: 0, last: EMPTY, stillKey: "" });
  const data = useSharedValue(EMPTY);

  // The streets are made ready (and handed to the UI thread) the first time
  // the map comes close — not as it opens, while it's unfolding.
  const [close, setClose] = useState(false);
  useAnimatedReaction(
    () => (view.get()?.zoom ?? 0) >= WALKERS_FROM_ZOOM - 1,
    (now, was) => {
      if (now && !was) runOnJS(setClose)(true);
    },
  );
  useEffect(() => {
    if (close && !net.get()) net.set(streets());
  }, [close, net]);

  const frame = useFrameCallback((info) => {
    const n = net.get();
    if (!n) return;
    const dt = Math.min(0.1, (info.timeSincePreviousFrame ?? 16) / 1000);
    const json = tick(crowd.get(), n, view.get(), dt, reduceMotion);
    if (json !== null) data.set(json);
  }, false);

  // Only while the map is the page showing.
  useEffect(() => {
    frame.setActive(focused);
    return () => frame.setActive(false);
  }, [focused, frame]);

  const animatedProps = useAnimatedProps(() => ({ data: data.get() }));

  return (
    <>
      <WalkerSource id="walkers" data={EMPTY} animatedProps={animatedProps}>
        <Layer
          id="walkers"
          type="fill"
          // Standing on the street, over its name painted on the ground.
          beforeId="places"
          minzoom={WALKERS_FROM_ZOOM - 0.1}
          paint={{
            "fill-color": ["get", "c"],
            // (The engine takes zoom only at the top of an expression.)
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], WALKERS_FROM_ZOOM - 0.1, 0, WALKERS_FROM_ZOOM + 0.4, ["get", "o"]],
          }}
        />
      </WalkerSource>
    </>
  );
}
