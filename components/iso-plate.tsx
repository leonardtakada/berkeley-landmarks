import React, { useMemo } from "react";
import { Image, StyleSheet, View, type ImageRequireSource } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";

import { FONT, INK, PAPER } from "@/constants/book";

/**
 * A walk's fold-out map as an isometric plate (scripts/iso/plates.ts): a
 * block of the city printed as a paper diorama, with the walk laid over it
 * — the route a vermilion ribbon, each stop's building a model that rises
 * out of the page as the map unfolds, its numbered flag above it, and the
 * names of the streets the walk follows set flat on the ground.
 *
 * The route is laid among the models by depth, so it passes behind a
 * building and in front of the next; its dotted centre line runs over
 * everything, so the way can be followed behind them.
 */

export interface PlateData {
  /** The plate's own pixels; everything below is in them. */
  width: number;
  height: number;
  /** The route as x, y pairs, and how deep into the drawing each point lies. */
  route: number[];
  routeDepth: number[];
  stops: {
    order: number;
    id: string;
    depth: number;
    /** Where the flag's pole stands on the model, and where its disc is. */
    flag: [number, number, number, number];
    top: number;
    /** The model's extent: left, top, right, bottom. */
    box: [number, number, number, number];
    /** Its faces, back to front: fill and path. */
    faces: [string, string][];
  }[];
  /** Street names: where, and the ground's axes there (one metre each way, in pixels). */
  labels: { text: string; x: number; y: number; ax: number; ay: number; bx: number; by: number }[];
  /** The direction of north on the plate, degrees clockwise from the right. */
  north: number;
}

const RIBBON = 12;
const DISC = 24;
const PAD = 3;

export function IsoPlate({
  plate,
  width,
  rise,
}: {
  plate: PlateData & { image: ImageRequireSource };
  width: number;
  /** 0 → 1 as the models rise out of the page. */
  rise: SharedValue<number>;
}) {
  const k = width / plate.width;
  const height = plate.height * k;

  // The route cut into runs, each laid just behind the first model in front of it.
  const { layers, whole, order } = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < plate.route.length; i += 2) pts.push([plate.route[i], plate.route[i + 1]]);
    const byDepth = [...plate.stops].sort((a, b) => b.depth - a.depth);
    const layerOf = (d: number) => byDepth.filter((s) => s.depth >= d).length;
    const runs: string[][] = byDepth.map(() => []).concat([[]]);
    let current = -1;
    for (let i = 1; i < pts.length; i++) {
      const layer = layerOf((plate.routeDepth[i - 1] + plate.routeDepth[i]) / 2);
      const [a, b] = [pts[i - 1], pts[i]];
      if (layer !== current) runs[layer].push(`M${a[0]} ${a[1]}`);
      runs[layer].push(`L${b[0]} ${b[1]}`);
      current = layer;
    }
    return {
      layers: runs.map((r) => r.join("")),
      whole: pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(""),
      order: byDepth,
    };
  }, [plate]);

  const view = `0 0 ${plate.width} ${plate.height}`;
  const size = { width, height };
  const byOrder = [...plate.stops].sort((a, b) => a.order - b.order);

  return (
    <View style={size} pointerEvents="none">
      <Image source={plate.image} style={size} />
      {order.map((s, i) => (
        <React.Fragment key={s.id}>
          {layers[i] ? <RouteRun d={layers[i]} view={view} size={size} /> : null}
          <Model stop={s} k={k} rise={rise} index={byOrder.indexOf(s)} count={byOrder.length} />
        </React.Fragment>
      ))}
      {layers[order.length] ? <RouteRun d={layers[order.length]} view={view} size={size} /> : null}
      <Svg {...size} viewBox={view} style={StyleSheet.absoluteFill}>
        {/* The way, dotted over everything, so it can be followed behind the buildings. */}
        <Path d={whole} stroke={PAPER.slip} strokeWidth={3.2} strokeDasharray="1 11" strokeLinecap="round" fill="none" />
        {plate.labels.map((l) => {
          const n1 = Math.hypot(l.ax, l.ay);
          const n2 = Math.hypot(l.bx, l.by);
          return (
            <SvgText
              key={l.text}
              transform={`matrix(${l.ax / n1} ${l.ay / n1} ${-l.bx / n2} ${-l.by / n2} ${l.x} ${l.y})`}
              fontFamily={FONT.medium}
              fontSize={21}
              letterSpacing={3}
              fill={INK.sepia}
              textAnchor="middle"
            >
              {l.text}
            </SvgText>
          );
        })}
        <NorthPoint angle={plate.north} x={46} y={60} />
        <SvgText
          x={plate.width - 12}
          y={plate.height - 12}
          fontFamily={FONT.medium}
          fontSize={17}
          letterSpacing={1.6}
          fill={INK.sepia}
          textAnchor="end"
        >
          STREETS © OPENSTREETMAP CONTRIBUTORS
        </SvgText>
      </Svg>
      {byOrder.map((s, i) => (
        <Flag key={s.id} stop={s} k={k} rise={rise} index={i} count={byOrder.length} />
      ))}
    </View>
  );
}

/** How far a stop's model has risen, 0–1: one after another in the walk's order, each easing to a stop. */
function risen(rise: number, index: number, count: number) {
  "worklet";
  const step = 0.55 / Math.max(1, count - 1);
  const t = Math.min(1, Math.max(0, (rise - index * step) / 0.45));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** A stop's numbered flag, set up on its building as the building rises. */
function Flag({
  stop,
  k,
  rise,
  index,
  count,
}: {
  stop: PlateData["stops"][number];
  k: number;
  rise: SharedValue<number>;
  index: number;
  count: number;
}) {
  const [ax, ay, x, y] = stop.flag;
  const x0 = Math.min(ax, x) - DISC - 3;
  const y0 = y - DISC - 3;
  const w = Math.abs(ax - x) + (DISC + 3) * 2;
  const h = ay - y0 + 2;
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, risen(rise.value, index, count) * 2 - 0.6)) }));
  return (
    <Animated.View style={[styles.slot, { left: x0 * k, top: y0 * k, width: w * k, height: h * k }, style]}>
      <Svg width={w * k} height={h * k} viewBox={`${x0} ${y0} ${w} ${h}`}>
        <Path d={`M${ax} ${ay}L${x} ${y}`} stroke={INK.charcoal} strokeWidth={3} />
        <Circle cx={x} cy={y} r={DISC} fill={INK.blue} stroke={PAPER.slip} strokeWidth={3} />
        <SvgText x={x} y={y + 9} fontFamily={FONT.medium} fontSize={26} fill={PAPER.cover} textAnchor="middle">
          {String(stop.order)}
        </SvgText>
      </Svg>
    </Animated.View>
  );
}

function RouteRun({ d, view, size }: { d: string; view: string; size: { width: number; height: number } }) {
  return (
    <Svg {...size} viewBox={view} style={StyleSheet.absoluteFill}>
      <Path d={d} stroke={INK.vermilion} strokeWidth={RIBBON} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * A stop's building, rising out of the page: it slides up from below its
 * footprint's front edge, as a pop-up piece slides up through its slot.
 */
function Model({
  stop,
  k,
  rise,
  index,
  count,
}: {
  stop: PlateData["stops"][number];
  k: number;
  rise: SharedValue<number>;
  index: number;
  count: number;
}) {
  const [x0, y0, x1, y1] = stop.box;
  const w = x1 - x0 + PAD * 2;
  const h = y1 - y0 + PAD * 2;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - risen(rise.value, index, count)) * h * k }],
  }));
  return (
    <View style={[styles.slot, { left: (x0 - PAD) * k, top: (y0 - PAD) * k, width: w * k, height: h * k }]}>
      <Animated.View style={style}>
        <Svg width={w * k} height={h * k} viewBox={`${x0 - PAD} ${y0 - PAD} ${w} ${h}`}>
          {stop.faces.map(([fill, d], i) => (
            <Path key={i} d={d} fill={fill} stroke={fill} strokeWidth={0.8} strokeLinejoin="round" />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** A north point: an arrow toward north as the plate is turned, and its N. */
function NorthPoint({ angle, x, y }: { angle: number; x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <G transform={`rotate(${angle})`}>
        <Path d="M22 0 L-10 -8 L-4 0 L-10 8 Z" fill={INK.charcoal} />
      </G>
      <SvgText
        x={Math.cos((angle * Math.PI) / 180) * 38}
        y={Math.sin((angle * Math.PI) / 180) * 38 + 8}
        fontFamily={FONT.medium}
        fontSize={24}
        fill={INK.charcoal}
        textAnchor="middle"
      >
        N
      </SvgText>
    </G>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: "absolute",
    overflow: "hidden",
  },
});
