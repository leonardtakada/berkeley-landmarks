import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useNavigation } from "expo-router";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";

import { REGISTRY_FRIEZE_SVG } from "@/components/print-art.generated";
import { plateOut, type PlateRect } from "@/lib/map-plate";

/** The plate rising off the page to where it's unfolded. */
const LIFT_MS = 380;
/** The cover's swing, from lying on the folded map to lying open beside it. */
const COVER_MS = 460;
/** Each strip beyond it, from on edge to flat. */
const STRIP_MS = 300;
/** Between one strip and the next starting out. */
const GAP_MS = 150;
/** The strips on the far side start a beat after the cover stands on edge. */
const OTHER_LAG_MS = 40;
/** The creases relaxing out of the paper once it's open. */
const CREASE_FADE_MS = 520;
/** How long the lifted plate waits for the map's first frame before opening anyway. */
const MAX_WAIT_MS = 1200;
/** Folding away: the creases come back, then it all runs this much quicker. */
const TO_CREASES_MS = 160;
const FOLD_SPEED = 1.35;

const LIFT_EASE = Easing.bezierFn(0.45, 0, 0.25, 1);
const COVER_EASE = Easing.bezierFn(0.45, 0, 0.4, 1);
const STRIP_EASE = Easing.bezierFn(0.3, 0.15, 0.35, 1);

/** The page beneath, a shade darker while the plate is up off it. */
const SCRIM = "#0B1530";
const SCRIM_A = 0.16;
/** A face turned away from the light: the cover's blue going deep, the map's paper going grey. */
const BACK_SHADE = "#02113F";
const BACK_SHADE_A = 0.5;
const FACE_SHADE = "#0B1A3A";
const FACE_SHADE_A = 0.34;
/** The folds, pressed into the paper. */
const CREASE = "#0B2E8C";
const CREASE_A = 0.22;

/**
 * The map, folded as a strip map: across its width in strips as wide as the
 * screen and as deep as the plate, so the plate is one strip. The plate
 * lies on strip `k`, the one nearest where it was on the page; its cover is
 * the next strip's back, folded over it, and swings open toward the side
 * with more to unfold (`dir`, +1 down). The other strips fan out from there,
 * one after another, both ways.
 */
type Geometry = {
  W: number;
  H: number;
  /** A strip's depth. */
  s: number;
  k: number;
  dir: 1 | -1;
  rect: PlateRect;
  /** Strips on the cover's side, out from the plate: the cover's own first. */
  cover: number[];
  /** Strips on the other side, out from the plate. */
  other: number[];
  coverStarts: number[];
  otherStarts: number[];
  /** When the last strip lies flat. */
  laidAt: number;
  total: number;
};

function geometryFor(W: number, H: number, rect: PlateRect): Geometry {
  const r = Math.max(3, Math.min(8, Math.round((rect.width / rect.height) * (H / W))));
  const s = H / r;
  const k = Math.max(0, Math.min(r - 1, Math.round((rect.y + rect.height / 2) / s - 0.5)));
  const dir = r - 1 - k >= k ? 1 : -1;
  const cover: number[] = [];
  for (let j = k + dir; j >= 0 && j < r; j += dir) cover.push(j);
  const other: number[] = [];
  for (let j = k - dir; j >= 0 && j < r; j -= dir) other.push(j);
  // The cover stands on edge halfway through its curve.
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 24; n++) {
    const m = (lo + hi) / 2;
    if (COVER_EASE(m) < 0.5) lo = m;
    else hi = m;
  }
  const upright = lo * COVER_MS;
  const coverStarts = cover.map((_, i) => upright + i * GAP_MS);
  const otherStarts = other.map((_, i) => upright + OTHER_LAG_MS + i * GAP_MS);
  const laidAt = Math.max(
    COVER_MS,
    ...coverStarts.slice(1).map((t) => t + STRIP_MS),
    ...otherStarts.map((t) => t + STRIP_MS),
  );
  return { W, H, s, k, dir, rect, cover, other, coverStarts, otherStarts, laidAt, total: laidAt + CREASE_FADE_MS };
}

function clamp01(x: number) {
  "worklet";
  return Math.min(1, Math.max(0, x));
}

/** The cover's angle off the plate: 0 lying on it, π lying open. */
function coverTurn(t: number) {
  "worklet";
  return Math.PI * COVER_EASE(clamp01(t / COVER_MS));
}

/** How much of a strip's depth shows from above, map side up: 0 on edge, 1 flat. */
function laid(t: number, g: Geometry, onCoverSide: boolean, i: number) {
  "worklet";
  if (onCoverSide && i === 0) return Math.max(0, -Math.cos(coverTurn(t)));
  const start = onCoverSide ? g.coverStarts[i] : g.otherStarts[i];
  return Math.sin((Math.PI / 2) * STRIP_EASE(clamp01((t - start) / STRIP_MS)));
}

/** Where a strip hangs from: the far edge of the strips laid before it. */
function hingeOf(t: number, g: Geometry, onCoverSide: boolean, i: number) {
  "worklet";
  const sign = onCoverSide ? g.dir : -g.dir;
  let out = 0;
  for (let m = 0; m < i; m++) out += laid(t, g, onCoverSide, m);
  return (sign > 0 ? g.k + 1 : g.k) * g.s + sign * g.s * out;
}

export type PlateUnfolding = {
  g: Geometry | null;
  lift: SharedValue<number>;
  clock: SharedValue<number>;
  /** Unfolded, and the map's to use. */
  opened: boolean;
  /** For what's laid over the map: in once it's open, out before it folds. */
  chromeStyle: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  onMapLoaded: () => void;
};

/**
 * The map lifted off the Landmarks page as its plate and unfolded, and
 * folded back into its place when it's closed (any way it's closed). With
 * no plate to lift, it does nothing: the map is all there and in use.
 */
export function usePlateUnfold(rect: PlateRect | null): PlateUnfolding {
  const { width, height } = useWindowDimensions();
  const [g] = useState(() => (rect ? geometryFor(width, height, rect) : null));
  const lift = useSharedValue(0);
  const clock = useSharedValue(0);
  const [opened, setOpened] = useState(!g);
  const step = useRef({ lifted: false, ready: false, started: false, gone: false });
  const navigation = useNavigation();

  // It opens once it's up off the page and the map beneath has drawn.
  const open = useCallback(() => {
    const s = step.current;
    if (!g || s.started || !s.lifted || !s.ready) return;
    s.started = true;
    clock.set(withTiming(g.total, { duration: g.total, easing: Easing.linear }));
  }, [g, clock]);

  const onMapLoaded = useCallback(() => {
    step.current.ready = true;
    open();
  }, [open]);

  useEffect(() => {
    if (!g) return;
    const s = step.current;
    // (The plate's drawn here by now: the page can let its own go.)
    const frame = requestAnimationFrame(() => plateOut.set(1));
    const lifted = () => {
      s.lifted = true;
      open();
    };
    // (Linear: each part eases itself, so folding away runs the same curves backward.)
    lift.set(
      withTiming(1, { duration: LIFT_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(lifted)();
      }),
    );
    const wait = setTimeout(() => {
      s.ready = true;
      open();
    }, MAX_WAIT_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(wait);
      plateOut.set(0);
    };
  }, [g, lift, open]);

  // However the map's closed, it folds up into the page first.
  useEffect(() => {
    if (!g) return;
    return navigation.addListener("beforeRemove", (e) => {
      const s = step.current;
      if (s.gone) return;
      e.preventDefault();
      s.started = true;
      setOpened(false);
      const leave = () => {
        s.gone = true;
        navigation.dispatch(e.data.action);
      };
      const t = clock.get();
      const foldUp = withTiming(
        0,
        { duration: Math.min(t, g.laidAt) / FOLD_SPEED, easing: Easing.linear },
        (done) => {
          if (!done) return;
          lift.set(
            withTiming(0, { duration: (lift.get() * LIFT_MS) / FOLD_SPEED, easing: Easing.linear }, (down) => {
              if (!down) return;
              // The page has its plate back before the map goes.
              plateOut.set(0);
              runOnJS(leave)();
            }),
          );
        },
      );
      clock.set(
        t > g.laidAt
          ? withSequence(withTiming(g.laidAt, { duration: TO_CREASES_MS, easing: Easing.linear }), foldUp)
          : foldUp,
      );
    });
  }, [g, navigation, clock, lift]);

  useAnimatedReaction(
    () => (g ? clock.get() >= g.laidAt : true),
    (now, before) => {
      if (now !== before) runOnJS(setOpened)(now);
    },
  );

  const chromeStyle = useAnimatedStyle<ViewStyle>(() => {
    if (!g) return { opacity: 1 };
    return { opacity: clamp01((clock.get() - (g.laidAt - 200)) / 320) };
  });

  return { g, lift, clock, opened, chromeStyle, onMapLoaded };
}

/**
 * The map, unfolding: seen from straight above, flat, as the page turns are.
 * The map itself shows only where the paper lies open, so it's the real map
 * that opens out; the strips swinging down are shaded while they're steep,
 * and the folds stay pressed in until it's all flat.
 */
export function PlateUnfold({
  g,
  lift,
  clock,
  opened,
  children,
}: {
  g: Geometry;
  lift: SharedValue<number>;
  clock: SharedValue<number>;
  opened: boolean;
  children: React.ReactNode;
}) {
  const scrim = useAnimatedStyle(() => ({ opacity: SCRIM_A * LIFT_EASE(lift.get()) }));

  // Where the paper lies open, map side up.
  const edges = (t: number) => {
    "worklet";
    const a = hingeOf(t, g, true, g.cover.length);
    const b = hingeOf(t, g, false, g.other.length);
    return [Math.min(a, b), Math.max(a, b)];
  };
  const windowStyle = useAnimatedStyle(() => {
    const t = clock.get();
    if (t <= 0) return { top: 0, height: 0 };
    if (t >= g.laidAt) return { top: 0, height: g.H };
    const [y0, y1] = edges(t);
    return { top: y0, height: y1 - y0 };
  });
  const sheetStyle = useAnimatedStyle(() => {
    const t = clock.get();
    if (t <= 0 || t >= g.laidAt) return { top: 0 };
    return { top: -edges(t)[0] };
  });

  // The plate: off the page to its strip, then its cover swinging open.
  const plateLift = useAnimatedStyle(() => {
    const e = LIFT_EASE(lift.get());
    const top = g.k * g.s;
    const x = g.rect.x * (1 - e);
    const y = g.rect.y + (top - g.rect.y) * e;
    const w = g.rect.width + (g.W - g.rect.width) * e;
    const h = g.rect.height + (g.s - g.rect.height) * e;
    return {
      transform: [
        { translateX: x + w / 2 - g.W / 2 },
        { translateY: y + h / 2 - (top + g.s / 2) },
        { scaleX: w / g.W },
        { scaleY: h / g.s },
      ],
    };
  });
  const plateTurn = useAnimatedStyle(() => {
    const showing = Math.max(0, Math.cos(coverTurn(clock.get())));
    return {
      opacity: showing > 0 ? 1 : 0,
      // Folding toward its hinge, on the cover's side.
      transform: [{ translateY: g.dir * (g.s / 2) * (1 - showing) }, { scaleY: Math.max(showing, 0.001) }],
    };
  });
  const plateShade = useAnimatedStyle(() => ({
    opacity: BACK_SHADE_A * (1 - Math.max(0, Math.cos(coverTurn(clock.get())))),
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, scrim]} />
      <Animated.View pointerEvents={opened ? "auto" : "none"} style={[styles.window, windowStyle]}>
        <Animated.View style={[styles.sheet, { width: g.W, height: g.H }, sheetStyle]}>{children}</Animated.View>
      </Animated.View>
      {g.cover.map((slot, i) => (
        <Strip key={`c${slot}`} g={g} clock={clock} slot={slot} onCoverSide i={i} />
      ))}
      {g.other.map((slot, i) => (
        <Strip key={`o${slot}`} g={g} clock={clock} slot={slot} onCoverSide={false} i={i} />
      ))}
      <Animated.View pointerEvents="none" style={[styles.plate, { top: g.k * g.s, width: g.W, height: g.s }, plateLift]}>
        <Animated.View style={[StyleSheet.absoluteFill, plateTurn]}>
          <SvgXml xml={REGISTRY_FRIEZE_SVG} width="100%" height="100%" preserveAspectRatio="none" />
          <Animated.View style={[StyleSheet.absoluteFill, styles.plateShade, plateShade]} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** One strip swinging down: its shade while it's steep, and the fold it hangs from. */
function Strip({
  g,
  clock,
  slot,
  onCoverSide,
  i,
}: {
  g: Geometry;
  clock: SharedValue<number>;
  slot: number;
  onCoverSide: boolean;
  i: number;
}) {
  const sign = onCoverSide ? g.dir : -g.dir;
  const shade = useAnimatedStyle(() => {
    const t = clock.get();
    const f = laid(t, g, onCoverSide, i);
    const middle = hingeOf(t, g, onCoverSide, i) + (sign * g.s * f) / 2;
    return {
      opacity: f > 0 && f < 1 ? FACE_SHADE_A * (1 - f) : 0,
      transform: [{ translateY: middle - (slot + 0.5) * g.s }, { scaleY: Math.max(f, 0.001) }],
    };
  });
  const crease = useAnimatedStyle(() => {
    const t = clock.get();
    const f = laid(t, g, onCoverSide, i);
    return {
      opacity: f > 0 ? CREASE_A * (1 - clamp01((t - g.laidAt) / CREASE_FADE_MS)) : 0,
      transform: [{ translateY: hingeOf(t, g, onCoverSide, i) - 0.5 }],
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.shade, { top: slot * g.s, width: g.W, height: g.s }, shade]} />
      <Animated.View pointerEvents="none" style={[styles.crease, { width: g.W }, crease]} />
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: SCRIM,
  },
  window: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  sheet: {
    position: "absolute",
    left: 0,
  },
  plate: {
    position: "absolute",
    left: 0,
  },
  plateShade: {
    backgroundColor: BACK_SHADE,
  },
  shade: {
    position: "absolute",
    left: 0,
    backgroundColor: FACE_SHADE,
  },
  crease: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 1,
    backgroundColor: CREASE,
  },
});
