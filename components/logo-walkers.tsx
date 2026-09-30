import { useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { LOGO_STREETS } from "@/components/logo-streets.generated";
import { BODY, CAST, FIG_H, FIG_W, HEAD, HEAD_INK, LEGS, WALKERS, type Figure } from "@/lib/walker-cast";

const LOGO = require("@/assets/images/logo-on-blue.png");
const TOWER = require("@/assets/images/logo-tower.png");

// ── The streets (in the logo image's own pixels) ─────────────────────────
const [IMG_W] = LOGO_STREETS.size;
const NODES = LOGO_STREETS.nodes;
const RIM = LOGO_STREETS.edge;
const NEIGHBOURS: number[][] = NODES.map(() => []);
for (const [a, b] of LOGO_STREETS.links) {
  NEIGHBOURS[a].push(b);
  NEIGHBOURS[b].push(a);
}
const RIM_NODES = NODES.map((_, i) => i).filter((i) => RIM[i] && NEIGHBOURS[i].length > 0);
const INNER_NODES = NODES.map((_, i) => i).filter((i) => !RIM[i] && NEIGHBOURS[i].length > 0);
const { left: TOWER_L, right: TOWER_R, foot: FOOT } = LOGO_STREETS.tower;

/** Whether the tower stands between the reader and someone standing here. */
function behindTower(x: number, y: number) {
  "worklet";
  if (x < TOWER_L || x > TOWER_R) return false;
  const [l, f, r] = FOOT;
  const front = x < f[0] ? l[1] + ((x - l[0]) * (f[1] - l[1])) / (f[0] - l[0]) : f[1] + ((x - f[0]) * (r[1] - f[1])) / (r[0] - f[0]);
  return y < front;
}

// ── The walkers ───────────────────────────────────────────────────────────
// Each is drawn in a 14 × 34 box, feet at the bottom middle (lib/walker-cast),
// printed a little larger than the image's own pixels so they read at a glance.
const GROW = 1.35;
const MOST_AT_ONCE = 5;

/** Where one walker is: on a street (from → to, `t` of the way), or off the slab. */
interface Walker {
  on: boolean;
  from: number;
  to: number;
  t: number;
  speed: number; // image px a second
  pause: number; // seconds left standing at a crossing
  wait: number; // seconds left off the slab
  leaving: boolean;
  fade: number;
  step: number; // the stride, in radians
  x: number;
  y: number;
  face: 1 | -1;
}

/** Where the walkers stand when the cover opens (and stay, with Reduce Motion). */
function opening(): Walker[] {
  const inner = NODES.map((_, i) => i).filter((i) => !RIM[i] && NEIGHBOURS[i].some((j) => !RIM[j]));
  const starts: [number, number, number][] = [];
  for (let k = 0; k < MOST_AT_ONCE; k++) {
    const i = inner[Math.floor(((k + 0.5) * inner.length) / MOST_AT_ONCE)];
    starts.push([i, NEIGHBOURS[i].find((j) => !RIM[j])!, 0.4]);
  }
  return WALKERS.map((_, k) => {
    const s = starts[k];
    const [from, to, t] = s ?? [0, 0, 0];
    const [x0, y0] = NODES[from];
    const [x1, y1] = NODES[to];
    return {
      on: !!s,
      from,
      to,
      t,
      speed: 20 + ((k * 7) % 9),
      pause: 0,
      wait: 3 + ((k * 5) % 11),
      leaving: false,
      fade: s ? 1 : 0,
      step: 0,
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      face: x1 >= x0 ? 1 : -1,
    };
  });
}

function pick<T>(list: T[]): T {
  "worklet";
  return list[Math.floor(Math.random() * list.length)];
}

/** One frame of one walker's stroll. */
function stroll(w: Walker, dt: number, onSlab: number) {
  "worklet";
  if (!w.on) {
    w.wait -= dt;
    if (w.wait > 0) return;
    if (onSlab >= MOST_AT_ONCE) {
      w.wait = 1 + Math.random() * 3;
      return;
    }
    // Step up onto the slab from a street's end at its rim.
    const rim = pick(RIM_NODES);
    w.on = true;
    w.from = rim;
    w.to = pick(NEIGHBOURS[rim]);
    w.t = 0;
    w.fade = 0;
    w.leaving = false;
    w.speed = 18 + Math.random() * 10;
  }
  if (w.leaving) {
    w.fade -= dt * 2.5;
    if (w.fade <= 0) {
      w.on = false;
      w.wait = 3 + Math.random() * 12;
    }
    return;
  }
  w.fade = Math.min(1, w.fade + dt * 2.5);
  const [x0, y0] = NODES[w.from];
  const [x1, y1] = NODES[w.to];
  if (w.pause > 0) {
    w.pause -= dt;
  } else {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    w.t += (w.speed * dt) / len;
    w.step += (w.speed * dt) / (4.2 * GROW);
    if (w.t >= 1) {
      // A crossing: carry on, turn, or stop a moment and look about;
      // at the rim, step off.
      const here = w.to;
      if (RIM[here]) {
        w.leaving = true;
        w.t = 1;
      } else {
        const back = w.from;
        const ways = NEIGHBOURS[here].filter((n) => n !== back);
        w.from = here;
        w.to = ways.length ? pick(ways) : back;
        w.t = 0;
        if (Math.random() < 0.14) w.pause = 0.8 + Math.random() * 1.6;
      }
    }
  }
  const [a0, b0] = NODES[w.from];
  const [a1, b1] = NODES[w.to];
  const t = Math.min(1, w.t);
  w.x = a0 + (a1 - a0) * t;
  w.y = b0 + (b1 - b0) * t;
  if (a1 !== a0) w.face = a1 > a0 ? 1 : -1;
}

/** Everyone somewhere different each time the cover opens. */
function scatter(ws: Walker[]) {
  "worklet";
  for (const w of ws) {
    if (!w.on) {
      w.wait = Math.random() * 14;
      continue;
    }
    w.from = pick(INNER_NODES);
    w.to = pick(NEIGHBOURS[w.from]);
    w.t = Math.random();
  }
}

/** One frame for everyone, keeping to a few on the slab at once. */
function tick(ws: Walker[], dt: number) {
  "worklet";
  let onSlab = 0;
  for (const w of ws) if (w.on) onSlab++;
  for (const w of ws) {
    const was = w.on;
    stroll(w, dt, onSlab);
    onSlab += Number(w.on) - Number(was);
  }
  return ws;
}

/**
 * The Campanile device, with the guide's architects out walking its streets:
 * tiny cut-paper figures that step up onto the slab from a street's end, wander
 * the grid — turning at the crossings at random, stopping now and then — pass
 * behind the tower, and step off again at the rim.
 */
export function StreetsLogo({ width, height }: { width: number; height: number }) {
  const reduceMotion = useReducedMotion();
  const walkers = useSharedValue<Walker[]>(opening());
  const shuffled = useSharedValue(false);
  const scale = width / IMG_W;

  // (The frame's work lives in module-level worklets: the React Compiler
  // would otherwise lift little callbacks out of it, off the UI thread.)
  const frame = useFrameCallback((info) => {
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const first = !shuffled.get();
    if (first) shuffled.set(true);
    walkers.modify((ws) => {
      "worklet";
      if (first) scatter(ws);
      return tick(ws, dt);
    });
  }, false);

  // Only while the cover is showing.
  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) return;
      frame.setActive(true);
      return () => frame.setActive(false);
    }, [frame, reduceMotion]),
  );

  const layer = (front: boolean) =>
    WALKERS.map((key, i) => (
      <WalkerFigure key={key} index={i} figure={CAST[key]} walkers={walkers} scale={scale} front={front} />
    ));

  return (
    <View style={{ width, height }}>
      <Image source={LOGO} style={styles.fill} />
      {layer(false)}
      <Image source={TOWER} style={styles.fill} />
      {layer(true)}
    </View>
  );
}

function WalkerFigure({
  index,
  figure,
  walkers,
  scale,
  front,
}: {
  index: number;
  figure: Figure;
  walkers: SharedValue<Walker[]>;
  scale: number;
  front: boolean;
}) {
  const s = scale * GROW; // the figure's own scale
  const w = FIG_W * s;
  const h = FIG_H * s;

  // Drawn twice — under the tower and over it — and shown in whichever is right.
  const place = useAnimatedStyle(() => {
    const it = walkers.value[index];
    if (!it || !it.on || behindTower(it.x, it.y) === front) return { opacity: 0 };
    const moving = it.pause <= 0 && !it.leaving;
    const bob = moving ? Math.abs(Math.sin(it.step)) * 0.9 * s : 0;
    return {
      opacity: it.fade,
      transform: [
        { translateX: it.x * scale - w / 2 },
        { translateY: it.y * scale - h - bob },
        { scaleX: it.face },
      ],
    };
  });
  const legA = useAnimatedStyle(() => {
    const it = walkers.value[index];
    const swing = it && it.pause <= 0 && !it.leaving ? Math.sin(it.step) * LEGS.swing : 0;
    return { transform: [{ rotate: `${swing}deg` }] };
  });
  const legB = useAnimatedStyle(() => {
    const it = walkers.value[index];
    const swing = it && it.pause <= 0 && !it.leaving ? Math.sin(it.step) * LEGS.swing : 0;
    return { transform: [{ rotate: `${-swing}deg` }] };
  });

  const leg = {
    top: LEGS.top * s,
    width: LEGS.width * s,
    height: LEGS.height * s,
    backgroundColor: LEGS.ink,
    transformOrigin: "top" as const,
  };
  return (
    <Animated.View pointerEvents="none" style={[styles.walker, { width: w, height: h }, place]}>
      <Animated.View style={[styles.leg, leg, { left: LEGS.left[0] * s }, legA]} />
      <Animated.View style={[styles.leg, leg, { left: LEGS.left[1] * s }, legB]} />
      <Svg width={w} height={h} viewBox={`0 0 ${FIG_W} ${FIG_H}`} style={StyleSheet.absoluteFill}>
        <Path d={figure.skirt ? BODY.skirt : BODY.coat} fill={figure.coat} />
        <Path d={HEAD} fill={figure.head ?? HEAD_INK} />
        {figure.marks.map((m, i) => (
          <Path key={i} d={m.d} fill={m.fill} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  walker: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  leg: {
    position: "absolute",
  },
});
