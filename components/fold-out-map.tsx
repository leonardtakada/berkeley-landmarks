import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { Arrow, InkPlane } from "@/components/print";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { BERKELEY_BOUNDARY } from "@/data/berkeley-boundary";
import { landmarks } from "@/data/landmarks";
import { WALK_STREETS } from "@/data/walk-streets.generated";

type LatLng = { latitude: number; longitude: number };
export type MapStop = LatLng & { id: string; name: string; order: number };

const PANELS = 3;
const MAP_ASPECT = 0.95; // height / width
/** Each flap swings down over its own stretch of the opening. */
const FLAP_START = [0, 0, 0.42];
const FLAP_SPAN = 0.58;

/** How far flap i is from lying flat: 90° hanging edge-on, 0° flat. */
function flapDeg(open: number, i: number) {
  "worklet";
  if (i === 0) return 0;
  const t = Math.min(1, Math.max(0, (open - FLAP_START[i]) / FLAP_SPAN));
  return (1 - t) * 90;
}

/** Projected top of flap i: the front panel, then each earlier flap as foreshortened. */
function flapTop(open: number, i: number, panelH: number) {
  "worklet";
  let top = 0;
  for (let j = 0; j < i; j++) top += panelH * Math.cos((flapDeg(open, j) * Math.PI) / 180);
  return top;
}

/**
 * The fold-out map bound into a chapter: a sheet folded in three. Closed,
 * only its front panel shows, the folded edges of the rest peeking beneath.
 * Tap to pull it open — each flap swings down from its crease in turn,
 * shadowed while it hangs away from the light — and again to fold it back.
 *
 * Folded, its front panel is the map's cover: the walk, its length, the
 * streets it follows and where in the city it lies. Open, it is drawn from
 * the walk's own route over the street plan, with the streets it follows
 * named, its stops numbered, a locator, a scale of a quarter mile and a
 * north point.
 */
export function FoldOutMap({
  tourId,
  title,
  distance,
  stops,
  route,
  onOpenFullMap,
}: {
  tourId: string;
  title: string;
  distance: string;
  stops: MapStop[];
  route: LatLng[];
  onOpenFullMap: () => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const W = screenW - MARGIN.outer * 2;
  const H = Math.round(W * MAP_ASPECT);
  const panelH = H / PANELS;
  const open = useSharedValue(0);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const to = open.value > 0.5 ? 0 : 1;
    open.value = reduceMotion
      ? withTiming(to, { duration: 180 })
      : to
        ? withSpring(1, { damping: 15, stiffness: 90, mass: 1 })
        : withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) });
  };

  const sheetStyle = useAnimatedStyle(() => ({ height: flapTop(open.value, PANELS, panelH) }));
  // The folded edges of the hidden flaps, visible under the closed packet.
  const edgesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.15], [1, 0], "clamp"),
    top: flapTop(open.value, 1, panelH),
  }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: interpolate(open.value, [0, 0.4], [1, 0], "clamp") }));
  // The start/finish line and legend only take up room once the map is open.
  const footStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0.7, 1], [0, 1], "clamp"),
    maxHeight: interpolate(open.value, [0.3, 0.9], [0, 80], "clamp"),
  }));

  const streets = useMemo(() => decodeStreets(tourId), [tourId]);
  const via = streets.follows.slice(0, 3).map(shortName);
  const drawing = useMemo(
    () => <RouteDrawing stops={stops} route={route} streets={streets} width={W} height={H} />,
    [stops, route, streets, W, H],
  );
  const coverStyle = useAnimatedStyle(() => ({ opacity: interpolate(open.value, [0, 0.18], [1, 0], "clamp") }));
  const first = [...stops].sort((a, b) => a.order - b.order)[0];
  const last = [...stops].sort((a, b) => b.order - a.order)[0];

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="The fold-out map. Tap to open or fold it away."
      >
        <View style={styles.headRow}>
          <Text style={TYPE.label}>The fold-out map</Text>
          <Animated.View style={[styles.hint, hintStyle]}>
            <Text style={styles.link}>Unfold</Text>
            <Arrow direction="down" length={14} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.sheet, { width: W }, sheetStyle]}>
          {Array.from({ length: PANELS }, (_, i) => (
            <Panel key={i} index={i} open={open} panelH={panelH} width={W} reduceMotion={reduceMotion}>
              {drawing}
            </Panel>
          ))}
          <Animated.View pointerEvents="none" style={[styles.edges, edgesStyle]}>
            <View style={[styles.edge, { marginHorizontal: 2 }]} />
            <View style={[styles.edge, { marginHorizontal: 5 }]} />
          </Animated.View>
          {/* The folded map's cover. */}
          <Animated.View pointerEvents="none" style={[styles.cover, { height: panelH }, coverStyle]}>
            <InkPlane color={INK.blue} texture={0.3} style={styles.coverPlane}>
              <View style={styles.coverText}>
                <Text style={styles.coverKicker}>
                  Walking map · {stops.length} stops · {distance}
                </Text>
                <Text style={styles.coverTitle} numberOfLines={1} adjustsFontSizeToFit>
                  {title}
                </Text>
                {via.length ? (
                  <Text style={styles.coverVia} numberOfLines={2}>
                    By {via.length > 1 ? `${via.slice(0, -1).join(", ")} & ${via[via.length - 1]}` : via[0]}
                  </Text>
                ) : null}
              </View>
              <Locator
                frame={frameOf([...route, ...stops])}
                size={Math.min(panelH - 28, 78)}
                land={PAPER.cover}
                landOpacity={0.16}
                edge={PAPER.cover}
              />
            </InkPlane>
          </Animated.View>
        </Animated.View>
      </Pressable>
      {first && last ? (
        <Animated.View style={[styles.ends, footStyle]}>
          <Text style={styles.endsText} numberOfLines={2}>
            <Text style={styles.endsLabel}>START </Text>
            {first.name}
            <Text style={styles.endsLabel}>{"    "}FINISH </Text>
            {last.name}
          </Text>
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.foot, footStyle]}>
        <View style={styles.legend}>
          <View style={styles.legendSwatch} />
          <Text style={TYPE.label}>Other registry buildings</Text>
        </View>
        <Pressable onPress={onOpenFullMap} hitSlop={10} style={styles.fullLink}>
          <Text style={styles.link}>The large map</Text>
          <Arrow length={18} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** One panel of the sheet: a slice of the drawing, hinged at its top crease. */
function Panel({
  index,
  open,
  panelH,
  width,
  reduceMotion,
  children,
}: {
  index: number;
  open: SharedValue<number>;
  panelH: number;
  width: number;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const deg = flapDeg(open.value, index);
    if (reduceMotion) {
      return { top: index * panelH, opacity: index === 0 || open.value > 0.5 ? 1 : 0 };
    }
    return {
      top: flapTop(open.value, index, panelH),
      opacity: deg > 89 ? 0 : 1,
      transform: [{ perspective: 1100 }, { rotateX: `${deg}deg` }],
    };
  });

  const shade = useAnimatedStyle(() => ({
    opacity: 0.45 * Math.sin((flapDeg(open.value, index) * Math.PI) / 180),
  }));

  return (
    <Animated.View
      style={[styles.panel, { height: panelH, width, zIndex: PANELS - index, transformOrigin: "50% 0%" }, style]}
    >
      <View style={{ position: "absolute", top: -index * panelH, left: 0 }}>{children}</View>
      {/* The crease: a fine fold line along the top edge of every flap. */}
      {index > 0 ? <View style={styles.crease} /> : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, shade]} />
    </Animated.View>
  );
}

/** The walk drawn in ink over the street plan: named streets, the route,
 * numbered stops, a locator, a scale bar and a north point. */
function RouteDrawing({
  stops,
  route,
  streets,
  width,
  height,
}: {
  stops: MapStop[];
  route: LatLng[];
  streets: DecodedStreets;
  width: number;
  height: number;
}) {
  const geo = useMemo(() => {
    const pts = [...route, ...stops];
    if (pts.length < 2) return null;
    const lat0 = pts.reduce((a, p) => a + p.latitude, 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p.longitude * k);
    const ys = pts.map((p) => p.latitude);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 34;
    const spanX = Math.max(maxX - minX, 0.002);
    const spanY = Math.max(maxY - minY, 0.002);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2 - 20) / spanY);
    const ox = (width - spanX * scale) / 2;
    const oy = (height - 20 - spanY * scale) / 2;
    const project = (p: LatLng) => ({
      x: ox + (p.longitude * k - minX) * scale,
      y: oy + (maxY - p.latitude) * scale,
    });
    // Degrees of latitude per mile ≈ 1/69; pixels per quarter mile:
    const quarterMile = (0.25 / 69) * scale;
    // Every other registry building inside the frame, as a small plan mark.
    const onRoute = new Set(stops.map((st) => st.id));
    const others = landmarks
      .filter((l) => !onRoute.has(l.id))
      .map((l) => ({ ...project(l), id: l.id }))
      .filter((p) => p.x > 14 && p.x < width - 14 && p.y > 14 && p.y < height - 44);

    // The street plan, projected, by weight of line.
    const runs = streets.runs.map((r) => ({ ...r, px: r.pts.map(project) }));
    const pathOf = (cls: number) =>
      runs
        .filter((r) => r.cls === cls)
        .map((r) => r.px.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(""))
        .join(" ");
    const plan = { major: pathOf(2), minor: pathOf(1) };

    // Name the streets the walk follows, then a major street or two for bearings.
    const stopPx = stops.map(project);
    const lengthOf = new Map<string, number>();
    for (const r of runs) {
      let len = 0;
      for (let i = 1; i < r.px.length; i++) len += Math.hypot(r.px[i].x - r.px[i - 1].x, r.px[i].y - r.px[i - 1].y);
      lengthOf.set(r.name, (lengthOf.get(r.name) ?? 0) + len);
    }
    const byLength = (a: string, b: string) => (lengthOf.get(b) ?? 0) - (lengthOf.get(a) ?? 0);
    const majors = [...new Set(runs.filter((r) => r.cls === 2).map((r) => r.name))]
      .filter((n) => !streets.follows.includes(n))
      .sort(byLength);
    const minors = [...new Set(runs.filter((r) => r.cls === 1).map((r) => r.name))]
      .filter((n) => !streets.follows.includes(n))
      .sort(byLength);
    // The route, sampled every few points, so names on other streets keep off it.
    const routeLine = (route.length >= 2 ? route : stops).map(project);
    const routeSamples: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < routeLine.length; i++) {
      const a = routeLine[i];
      const b = routeLine[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 0; k < n; k++) routeSamples.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    const labels = placeLabels(
      runs,
      [
        ...streets.follows.slice(0, 4).map((name) => ({ name, follows: true })),
        ...majors.slice(0, 2).map((name) => ({ name, follows: false })),
        ...minors.slice(0, 4).map((name) => ({ name, follows: false })),
      ],
      stopPx,
      routeSamples,
      width,
      height,
      7,
    );

    // The locator goes in whichever top corner the walk leaves emptiest.
    const routePx = [...route.map(project), ...stopPx];
    const busy = (x0: number) =>
      routePx.filter((p) => p.x > x0 - 8 && p.x < x0 + LOCATOR + 8 && p.y < 14 + LOCATOR + 8).length;
    const locX = busy(14) <= busy(width - 14 - LOCATOR) ? 14 : width - 14 - LOCATOR;
    // The map's own frame in the city, for the locator.
    const unproject = (x: number, y: number) => ({
      longitude: ((x - ox) / scale + minX) / k,
      latitude: maxY - (y - oy) / scale,
    });
    const frame = frameOf([unproject(0, 0), unproject(width, height)]);
    return { project, quarterMile, others, plan, labels, locX, frame };
  }, [route, stops, streets, width, height]);

  if (!geo) return <View style={{ width, height, backgroundColor: PAPER.slip }} />;

  const line = (route.length >= 2 ? route : stops).map(geo.project);
  const routeD = line.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const marks = [...stops].sort((a, b) => a.order - b.order).map((s) => ({ ...geo.project(s), order: s.order }));
  const bar = Math.min(geo.quarterMile, width * 0.4);

  return (
    <Svg width={width} height={height}>
      <Path d={`M0 0 H${width} V${height} H0 Z`} fill={PAPER.slip} />
      {/* Neat line */}
      <Path
        d={`M8 8 H${width - 8} V${height - 8} H8 Z`}
        stroke={INK.blue}
        strokeWidth={1.2}
        fill="none"
      />
      {/* The street plan. */}
      <Path d={geo.plan.minor} stroke={INK.charcoal} strokeOpacity={0.4} strokeWidth={1.1} fill="none" strokeLinejoin="round" />
      <Path d={geo.plan.major} stroke={INK.charcoal} strokeOpacity={0.7} strokeWidth={2.4} fill="none" strokeLinejoin="round" />
      {/* Other buildings in the registry: small blocks of blue tint. */}
      {geo.others.map((o) => (
        <Path
          key={o.id}
          d={`M${(o.x - 3).toFixed(1)} ${(o.y - 3).toFixed(1)} h6 v6 h-6 Z`}
          fill={INK.blueTint}
        />
      ))}
      {/* The walk: one bold stroke of vermilion. */}
      <Path d={routeD} stroke={INK.vermilion} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Street names, set along the street beside the line. */}
      {geo.labels.map((l) => (
        <G key={l.text} transform={`rotate(${l.angle.toFixed(1)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
          <SvgText
            x={l.x}
            y={l.y + 3}
            fontSize={LABEL_SIZE}
            fontFamily={FONT.medium}
            letterSpacing={0.9}
            textAnchor="middle"
            stroke={PAPER.slip}
            strokeWidth={3}
            strokeLinejoin="round"
            fill={PAPER.slip}
          >
            {l.text}
          </SvgText>
          <SvgText
            x={l.x}
            y={l.y + 3}
            fontSize={LABEL_SIZE}
            fontFamily={FONT.medium}
            letterSpacing={0.9}
            textAnchor="middle"
            fill={l.follows ? INK.charcoal : INK.sepia}
          >
            {l.text}
          </SvgText>
        </G>
      ))}
      {marks.map((m) => (
        <G key={m.order}>
          <Circle cx={m.x} cy={m.y} r={10} fill={INK.blue} />
          <SvgText
            x={m.x}
            y={m.y + 3.8}
            fontSize={10.5}
            fontFamily={FONT.medium}
            fill={PAPER.cover}
            textAnchor="middle"
          >
            {String(m.order)}
          </SvgText>
        </G>
      ))}
      {/* Locator: where in Berkeley this sheet lies. */}
      <G transform={`translate(${geo.locX} 14)`}>
        <Rect x={0} y={0} width={LOCATOR} height={LOCATOR} fill={PAPER.slip} stroke={INK.blue} strokeWidth={0.8} />
        <LocatorArt frame={geo.frame} size={LOCATOR} land={INK.blueTint} landOpacity={1} edge={INK.blue} />
      </G>
      {/* Scale bar: a quarter mile. */}
      <G transform={`translate(22 ${height - 30})`}>
        <Path d={`M0 0 H${bar / 2} V3 H0 Z`} fill={INK.charcoal} />
        <Path d={`M${bar / 2} 0 H${bar} V3 H${bar / 2} Z`} fill="none" stroke={INK.charcoal} strokeWidth={0.8} />
        <SvgText x={0} y={15} fontSize={9} fontFamily={FONT.medium} fill={INK.sepia} letterSpacing={1}>
          0
        </SvgText>
        <SvgText x={bar} y={15} fontSize={9} fontFamily={FONT.medium} fill={INK.sepia} textAnchor="middle" letterSpacing={1}>
          ¼ MI
        </SvgText>
      </G>
      {/* North point */}
      <G transform={`translate(${width - 30} ${height - 34})`}>
        <Path d="M0 -13 L5 5 L0 1 L-5 5 Z" fill={INK.charcoal} />
        <SvgText x={0} y={-17} fontSize={10} fontFamily={FONT.medium} fill={INK.charcoal} textAnchor="middle">
          N
        </SvgText>
      </G>
    </Svg>
  );
}

const LABEL_SIZE = 8.5;
const LOCATOR = 50;

type DecodedStreets = { follows: string[]; runs: { cls: number; name: string; pts: LatLng[] }[] };

/** The walk's baked street plan (scripts/bake-walk-streets.ts). */
function decodeStreets(tourId: string): DecodedStreets {
  const d = WALK_STREETS[tourId];
  if (!d) return { follows: [], runs: [] };
  const Q = 1e5;
  const runs = d.s.map(([cls, ni, ...xy]) => {
    const pts: LatLng[] = [];
    for (let i = 0; i + 1 < xy.length; i += 2) {
      pts.push({ longitude: d.o[0] + xy[i] / Q, latitude: d.o[1] + xy[i + 1] / Q });
    }
    return { cls, name: d.n[ni], pts };
  });
  return { follows: d.r, runs };
}

/** Street names as a map sets them: "Milvia Street" → "Milvia St". */
export function shortName(n: string): string {
  return n
    .replace(/Martin Luther King,? Jr\.? Way/i, "MLK Jr Way")
    .replace(/\bStreet\b/, "St")
    .replace(/\bAvenue\b/, "Ave")
    .replace(/\bBoulevard\b/, "Blvd")
    .replace(/\bRoad\b/, "Rd")
    .replace(/\bPlace\b/, "Pl")
    .replace(/\bDrive\b/, "Dr")
    .replace(/\bLane\b/, "Ln")
    .replace(/\bTerrace\b/, "Ter")
    .replace(/\bCourt\b/, "Ct");
}

type Frame = { w: number; s: number; e: number; n: number };

function frameOf(pts: LatLng[]): Frame {
  return {
    w: Math.min(...pts.map((p) => p.longitude)),
    e: Math.max(...pts.map((p) => p.longitude)),
    s: Math.min(...pts.map((p) => p.latitude)),
    n: Math.max(...pts.map((p) => p.latitude)),
  };
}

type Label = { text: string; x: number; y: number; angle: number; follows: boolean };
type Pt = { x: number; y: number };

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Set street names along their streets, as a printed map does: on the line
 * for streets the walk doesn't use, beside it for the ones it follows. Each
 * name is tried at several points along every straight stretch long enough
 * to carry it; a spot is rejected if the text would touch a stop, the route
 * or a name already set. Streets with nowhere clear are left unnamed.
 */
function placeLabels(
  runs: { name: string; px: Pt[] }[],
  wanted: { name: string; follows: boolean }[],
  stopPx: Pt[],
  routePx: Pt[],
  width: number,
  height: number,
  max: number,
): Label[] {
  const placed: (Label & { a: Pt; b: Pt })[] = [];
  const HALF_H = 5;
  for (const { name, follows } of wanted) {
    if (placed.length >= max) break;
    const text = shortName(name).toUpperCase();
    const tw = text.length * 6.1 + 4;
    let best: (Label & { a: Pt; b: Pt; score: number }) | null = null;
    for (const r of runs) {
      if (r.name !== name) continue;
      let i = 0;
      while (i < r.px.length - 1) {
        // A straight stretch: consecutive segments turning less than ~12°.
        let j = i + 1;
        const a0 = Math.atan2(r.px[j].y - r.px[i].y, r.px[j].x - r.px[i].x);
        while (
          j + 1 < r.px.length &&
          Math.abs(Math.atan2(r.px[j + 1].y - r.px[j].y, r.px[j + 1].x - r.px[j].x) - a0) < 0.21
        )
          j++;
        const p0 = r.px[i];
        const p1 = r.px[j];
        i = j;
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (len < tw + 6) continue;
        const ux = (p1.x - p0.x) / len;
        const uy = (p1.y - p0.y) / len;
        let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle <= -90) angle += 180;
        for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const along = tw / 2 + 3 + t * (len - tw - 6);
          const cx = p0.x + ux * along;
          const cy = p0.y + uy * along;
          for (const side of follows ? [1, -1] : [0]) {
            const x = cx - uy * 9 * side;
            const y = cy + ux * 9 * side;
            const a = { x: x - (ux * tw) / 2, y: y - (uy * tw) / 2 };
            const b = { x: x + (ux * tw) / 2, y: y + (uy * tw) / 2 };
            // Inside the sheet, clear of the neat line, locator and scale.
            if (Math.min(a.x, b.x) < 16 || Math.max(a.x, b.x) > width - 16) continue;
            if (Math.min(a.y, b.y) < 16 || Math.max(a.y, b.y) > height - 46) continue;
            if (Math.max(a.x, b.x) > width - 18 - LOCATOR && Math.min(a.y, b.y) < 18 + LOCATOR) continue;
            if (Math.min(a.x, b.x) < 18 + LOCATOR && Math.min(a.y, b.y) < 18 + LOCATOR) continue;
            let clear = Infinity;
            for (const s of stopPx) clear = Math.min(clear, segDist(s, a, b) - 12 - HALF_H);
            if (!follows) for (const s of routePx) clear = Math.min(clear, segDist(s, a, b) - 3 - HALF_H);
            for (const l of placed) {
              for (const k of [0, 0.25, 0.5, 0.75, 1]) {
                const q = { x: l.a.x + (l.b.x - l.a.x) * k, y: l.a.y + (l.b.y - l.a.y) * k };
                clear = Math.min(clear, segDist(q, a, b) - 2 * HALF_H - 2);
              }
            }
            if (clear < 1) continue;
            const score = Math.min(clear, 30) - Math.abs(t - 0.5) * 10;
            if (!best || score > best.score) best = { text, x, y, angle, follows, a, b, score };
          }
        }
      }
    }
    if (best) placed.push(best);
  }
  return placed.map(({ text, x, y, angle, follows }) => ({ text, x, y, angle, follows }));
}

/** The city limits with the given frame marked in vermilion, drawn into a square. */
function LocatorArt({
  frame,
  size,
  land,
  landOpacity,
  edge,
}: {
  frame: Frame;
  size: number;
  land: string;
  landOpacity: number;
  edge: string;
}) {
  const city = frameOf(BERKELEY_BOUNDARY);
  const k = Math.cos((37.87 * Math.PI) / 180);
  const pad = size * 0.12;
  const sc = Math.min((size - pad * 2) / ((city.e - city.w) * k), (size - pad * 2) / (city.n - city.s));
  const ox = (size - (city.e - city.w) * k * sc) / 2;
  const oy = (size - (city.n - city.s) * sc) / 2;
  const P = (lon: number, lat: number) => ({ x: ox + (lon - city.w) * k * sc, y: oy + (city.n - lat) * sc });
  const outline = BERKELEY_BOUNDARY.map((p, i) => {
    const q = P(p.longitude, p.latitude);
    return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }).join("") + "Z";
  const a = P(frame.w, frame.n);
  const b = P(frame.e, frame.s);
  const w = Math.max(4, b.x - a.x);
  const h = Math.max(4, b.y - a.y);
  return (
    <>
      <Path d={outline} fill={land} fillOpacity={landOpacity} stroke={edge} strokeWidth={0.8} strokeOpacity={0.9} />
      <Rect
        x={(a.x + b.x) / 2 - w / 2}
        y={(a.y + b.y) / 2 - h / 2}
        width={w}
        height={h}
        fill={INK.vermilion}
        fillOpacity={0.85}
      />
    </>
  );
}

/** Stand-alone locator (the map cover). */
function Locator(props: { frame: Frame; size: number; land: string; landOpacity: number; edge: string }) {
  return (
    <Svg width={props.size} height={props.size}>
      <LocatorArt {...props} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: MARGIN.outer,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sheet: {
    shadowColor: "#2A2016",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 3 },
  },
  panel: {
    position: "absolute",
    left: 0,
    overflow: "hidden",
    backgroundColor: PAPER.slip,
    backfaceVisibility: "hidden",
  },
  crease: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(60,45,30,0.18)",
  },
  shade: {
    backgroundColor: "#2A2016",
  },
  edges: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  edge: {
    height: 2.5,
    backgroundColor: PAPER.slip,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(60,45,30,0.35)",
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    overflow: "hidden",
  },
  cover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  coverPlane: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 14,
  },
  coverText: {
    flex: 1,
  },
  coverKicker: {
    fontFamily: FONT.medium,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: INK.blueTint,
  },
  coverTitle: {
    fontFamily: FONT.light,
    fontSize: 22,
    lineHeight: 26,
    color: PAPER.cover,
    marginTop: 4,
  },
  coverVia: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: PAPER.cover,
    opacity: 0.85,
    marginTop: 3,
  },
  ends: {
    marginTop: 12,
    overflow: "hidden",
  },
  endsText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    color: INK.charcoal,
  },
  endsLabel: {
    fontFamily: FONT.medium,
    fontSize: 10,
    letterSpacing: 1.8,
    color: INK.vermilion,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    backgroundColor: INK.blueTint,
  },
  fullLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  link: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.blue,
  },
});
