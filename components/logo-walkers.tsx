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
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { LOGO_STREETS } from "@/components/logo-streets.generated";
import type { ArchitectKey } from "@/lib/architects";

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
// Each is drawn in a 14 × 34 box, feet at the bottom middle, printed a
// little larger than the image's own pixels so they read at a glance.
const FIG_W = 14;
const FIG_H = 34;
const GROW = 1.35;
const MOST_AT_ONCE = 5;
const C = "#2E2A27";
const P = "#FDFAF2";
const BT = "#C9D0E4";
const VT = "#F4CDB9";
const GREY = "#D9D2C4";

type Figure = { coat: string; skirt?: boolean; head?: string; top: React.ReactNode };

/** Each architect at a few pixels high: a coat, and the hat, hair or beard they're known by. */
const CAST: Record<ArchitectKey, Figure> = {
  maybeck: {
    coat: C,
    top: (
      <>
        <Path d="M4 8.6 Q7 17 10 8.6 Z" fill={P} />
        <Ellipse cx={7.6} cy={4.6} rx={4.6} ry={1.7} fill={C} />
        <Circle cx={8} cy={2.9} r={1} fill={C} />
      </>
    ),
  },
  morgan: {
    coat: BT,
    skirt: true,
    top: (
      <>
        <Path d="M3.4 8 Q3.6 3.6 7 3.6 Q10.4 3.6 10.6 8 Q9.6 5.8 7 5.8 Q4.4 5.8 3.4 8 Z" fill={C} />
        <Circle cx={10.4} cy={5.8} r={1.9} fill={C} />
      </>
    ),
  },
  howard: {
    coat: C,
    top: (
      <>
        <Rect x={4.4} y={0.2} width={5.2} height={4.4} fill={C} />
        <Rect x={3} y={4.2} width={8} height={1.1} fill={C} />
      </>
    ),
  },
  ratcliff: {
    coat: BT,
    top: (
      <>
        <Path d="M3.4 7.4 Q3.6 3.8 7 3.8 Q10.4 3.8 10.6 7.4 Q9 5.8 7 5.8 Q5 5.8 3.4 7.4 Z" fill={C} />
        <Rect x={4.2} y={7.4} width={5.6} height={1} fill={C} />
      </>
    ),
  },
  hays: {
    coat: P,
    top: (
      <>
        <Path d="M3.4 8 Q3.4 3.8 7 3.8 Q10.6 3.8 10.6 8 Q9.4 6 7 6 Q4.6 6 3.4 8 Z" fill={GREY} />
        <Rect x={4.2} y={7.6} width={5.6} height={0.8} fill={C} />
      </>
    ),
  },
  coxhead: {
    coat: C,
    top: (
      <>
        <Path d="M3.4 9 Q3.2 6.4 4.2 5.8 L4.8 8.4 Z M10.6 9 Q10.8 6.4 9.8 5.8 L9.2 8.4 Z" fill={GREY} />
        <Path d="M5 10 Q7 14.6 9 10 Z" fill={GREY} />
      </>
    ),
  },
  thomas: {
    coat: P,
    top: <Path d="M3.2 8 Q3.2 3.6 7 3.6 Q10.8 3.6 10.8 8 Q9.4 5.4 7 6.2 Q4.6 5.4 3.2 8 Z" fill={C} />,
  },
  plachek: {
    coat: C,
    top: (
      <>
        <Path d="M3.4 7.6 Q3.4 3.4 7 3.4 Q10.6 3.4 10.6 7.6 Q9.6 5.4 7 6.6 Q4.4 5.4 3.4 7.6 Z" fill={C} />
        <Path d="M5.6 12.4 L7 16 L8.4 12.4 Z" fill={P} />
      </>
    ),
  },
  gutterson: {
    coat: VT,
    top: (
      <>
        <Path d="M3.4 9 Q3.2 6.6 4 6 L4.8 8.6 Z M10.6 9 Q10.8 6.6 10 6 L9.2 8.6 Z" fill={C} />
        <Path d="M8.4 9.8 H11.4 V11.4 H10.4 Z" fill={C} />
      </>
    ),
  },
  yelland: {
    coat: BT,
    head: P,
    top: <Path d="M3 6.2 Q3.4 3 7 3 Q10.6 3 11 5.2 L12.6 6.4 Z" fill={C} />,
  },
  esherick: {
    coat: P,
    top: (
      <>
        <Path d="M3.4 7 Q3.4 3.8 7 3.8 Q10.6 3.8 10.6 7 Q9.4 5.6 7 5.6 Q4.6 5.6 3.4 7 Z" fill={GREY} />
        <Rect x={4} y={7.2} width={6} height={1.3} fill={C} />
        <Rect x={4.6} y={11.2} width={4.8} height={2.2} fill={C} />
      </>
    ),
  },
};
const WALKERS = Object.keys(CAST) as ArchitectKey[];

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
    const swing = it && it.pause <= 0 && !it.leaving ? Math.sin(it.step) * 26 : 0;
    return { transform: [{ rotate: `${swing}deg` }] };
  });
  const legB = useAnimatedStyle(() => {
    const it = walkers.value[index];
    const swing = it && it.pause <= 0 && !it.leaving ? Math.sin(it.step) * 26 : 0;
    return { transform: [{ rotate: `${-swing}deg` }] };
  });

  const leg = { top: 22 * s, width: 2.2 * s, height: 12 * s, backgroundColor: C, transformOrigin: "top" as const };
  return (
    <Animated.View pointerEvents="none" style={[styles.walker, { width: w, height: h }, place]}>
      <Animated.View style={[styles.leg, leg, { left: 4.8 * s }, legA]} />
      <Animated.View style={[styles.leg, leg, { left: 7 * s }, legB]} />
      <Svg width={w} height={h} viewBox={`0 0 ${FIG_W} ${FIG_H}`} style={StyleSheet.absoluteFill}>
        <Path d={figure.skirt ? "M4.2 11.4 H9.8 L12.4 26 H1.6 Z" : "M4 11.4 H10 L11.2 24.4 H2.8 Z"} fill={figure.coat} />
        <Circle cx={7} cy={7.6} r={3.6} fill={figure.head ?? VT} />
        {figure.top}
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
