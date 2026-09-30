import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { useBookHead } from "@/components/bookmark-ribbons";
import { PaperSheet } from "@/components/paper-grain";
import { InkPlane } from "@/components/print";
import { PAGE_TURN_DELAY_MS, PAGE_TURN_MS, PAPER } from "@/constants/book";
import { PERSPECTIVE, projectedFreeEdge } from "@/lib/page-turn";

type Route = { key: string; name: string };
type Descriptors = Record<string, { render: () => React.ReactNode }>;

/** A turn in progress: `from` was showing, `to` is being turned to. */
type Turn = { id: number; from: string; to: string; forward: boolean };

type Role = "rest" | "moving" | "beneath" | "hidden";

const EASE = Easing.bezier(0.45, 0.05, 0.2, 1);
const DISSOLVE_MS = 200;

/**
 * The section pages of the book, bound at the left spine.
 *
 * Turning forward (cover → tours → registry → appendix) lifts the current
 * leaf off by its free edge and swings it over the spine, revealing the next
 * page underneath; turning back brings the previous leaf down over the
 * current one. Both pages are live during the ~650ms turn: the moving leaf
 * darkens as it tilts from the light, and casts a travelling shadow onto the
 * page beneath.
 *
 * The book begins at the head-band. Above it (the status bar's strip) is
 * not the book: it stays put in the colour of the open page while the
 * leaves turn below, and a turning leaf's top edge runs along the band
 * rather than rising past it — so the ribbons, hung from the band, always
 * hang over the page.
 *
 * `progress` idles at 0 between turns. At 0 every role already looks right
 * for the first frame of a new turn (a forward leaf lies flat, a backward
 * leaf is still edge-on), so a turn never flashes its destination early.
 */
export function BookPages({
  routes,
  index,
  order,
  descriptors,
  onTurningChange,
}: {
  routes: Route[];
  index: number;
  /** Route names in page order, front of the book first. */
  order: string[];
  descriptors: Descriptors;
  onTurningChange?: (turning: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const { top } = useBookHead();
  const focusedKey = routes[index].key;
  const pageOf = (key: string) => order.indexOf(routes.find((r) => r.key === key)?.name ?? "");

  const [loaded, setLoaded] = useState<string[]>([focusedKey]);
  if (!loaded.includes(focusedKey)) setLoaded([...loaded, focusedKey]);

  // Bind in the rest of the book once the opening page has printed, so the
  // first turn to a long section never waits for it to lay out.
  useEffect(() => {
    const t = setTimeout(() => setLoaded(routes.map((r) => r.key)), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [settled, setSettled] = useState(focusedKey);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const progress = useSharedValue(0);

  // A new page was asked for: turn to it from whatever is showing.
  const showing = turn ? turn.to : settled;
  if (focusedKey !== showing) {
    setTurn({
      id: (turn?.id ?? 0) + 1,
      from: showing,
      to: focusedKey,
      forward: pageOf(focusedKey) > pageOf(showing),
    });
  }

  useLayoutEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  const finish = (id: number) => {
    const current = turnRef.current;
    if (!current || current.id !== id) return;
    setSettled(current.to);
    setTurn(null);
  };

  useEffect(() => {
    onTurningChange?.(turn !== null);
    if (!turn) {
      // Back to idle only once the settled page has committed.
      progress.value = 0;
      return;
    }
    const id = turn.id;
    // (A beat behind the ribbons fading out of its way.)
    progress.value = withDelay(
      reduceMotion ? 0 : PAGE_TURN_DELAY_MS,
      withTiming(1, { duration: reduceMotion ? DISSOLVE_MS : PAGE_TURN_MS, easing: EASE }, (finished) => {
        if (finished) runOnJS(finish)(id);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.id]);

  const isCover = (key: string) => pageOf(key) === 0;
  return (
    <View style={StyleSheet.absoluteFill}>
      <HeadStrip
        height={top}
        progress={progress}
        from={isCover(turn ? turn.from : settled)}
        to={isCover(turn ? turn.to : settled)}
      />
      {/* The book, from the head-band down. A real view that clips, so a
          lifted leaf is drawn within it and never over the ribbons. */}
      <View collapsable={false} style={[styles.book, { top }]}>
        {routes.map((route) => {
          if (!loaded.includes(route.key)) return null;
          let role: Role = "hidden";
          if (!turn) role = route.key === settled ? "rest" : "hidden";
          else if (route.key === turn.from) role = turn.forward ? "moving" : "beneath";
          else if (route.key === turn.to) role = turn.forward ? "beneath" : "moving";
          return (
            <Leaf
              key={route.key}
              role={role}
              forward={turn?.forward ?? true}
              progress={progress}
              width={width}
              head={top}
              dissolve={reduceMotion}
            >
              {descriptors[route.key].render()}
            </Leaf>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The strip above the head-band, which isn't part of the book: paper when a
 * section is open, the cover board on the cover, and between the two while
 * the cover turns.
 */
function HeadStrip({
  height,
  progress,
  from,
  to,
}: {
  height: number;
  progress: SharedValue<number>;
  /** Whether the page turned from (or the settled page) is the cover. */
  from: boolean;
  to: boolean;
}) {
  const board = useAnimatedStyle(() => {
    const p = progress.value;
    return { opacity: (from ? 1 - p : 0) + (to ? p : 0) };
  }, [from, to]);
  return (
    <View pointerEvents="none" style={[styles.strip, { height }]}>
      <PaperSheet stock="page" />
      <Animated.View style={[StyleSheet.absoluteFill, board]}>
        <InkPlane color={PAPER.board} texture={0.18} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function Leaf({
  role,
  forward,
  progress,
  width,
  head,
  dissolve,
  children,
}: {
  role: Role;
  forward: boolean;
  progress: SharedValue<number>;
  width: number;
  /** Where the book begins (the head-band), from the top of the screen. */
  head: number;
  dissolve: boolean;
  children: React.ReactNode;
}) {
  const moving = role === "moving";
  const beneath = role === "beneath";
  const hidden = role === "hidden";

  /** How far the moving leaf is lifted: 0 flat on the book, 1 edge-on. */
  const liftOf = (p: number) => {
    "worklet";
    return forward ? p : 1 - p;
  };

  // A changed role reaches this style a frame after the page is shown, so a
  // hidden page is hidden here too: turned back to, it stays unseen until
  // the frame it's first drawn edge-on, instead of flashing up flat.
  const leafStyle = useAnimatedStyle(() => {
    if (hidden) return { opacity: 0, transform: [] };
    if (!moving) return { opacity: 1, transform: [] };
    const lift = liftOf(progress.value);
    if (dissolve) return { opacity: 1 - lift, transform: [] };
    return {
      opacity: 1,
      transform: [
        { perspective: PERSPECTIVE },
        { translateX: -width / 2 },
        { rotateY: `${-lift * 90}deg` },
        { translateX: width / 2 },
      ],
    };
  }, [hidden, moving, forward, width, dissolve]);

  // The lifted leaf turns away from the light, darkest toward its free edge.
  const tiltShade = useAnimatedStyle(() => {
    if (!moving || dissolve) return { opacity: 0 };
    const lift = liftOf(progress.value);
    return { opacity: Math.sin((lift * Math.PI) / 2) * 0.55 };
  }, [moving, forward, dissolve]);

  // The page beneath sits in the leaf's shadow until the leaf clears it.
  const underDim = useAnimatedStyle(() => {
    if (!beneath || dissolve) return { opacity: 0 };
    const lift = liftOf(progress.value);
    return { opacity: 0.2 * (1 - lift) };
  }, [beneath, forward, dissolve]);

  // A soft shadow band cast just past the lifted leaf's free edge.
  const castShadow = useAnimatedStyle(() => {
    if (!beneath || dissolve) return { opacity: 0 };
    const lift = liftOf(progress.value);
    const deg = lift * 90;
    const edge = projectedFreeEdge(width, deg);
    const spread = 0.35 + Math.sin((lift * Math.PI) / 2) * 0.9;
    return {
      opacity: Math.sin(lift * Math.PI) * 0.85,
      transform: [{ translateX: edge }, { scaleX: spread }],
    };
  }, [beneath, forward, width, dissolve]);

  // Always the same element type, so hiding a page never remounts it (its
  // scroll position and state survive being turned past). The leaf is laid
  // out full-screen, as the screens expect, with the strip above the band
  // cut away; it turns in perspective about its top edge, so that edge stays
  // on the band as the leaf lifts.
  return (
    <Animated.View
      pointerEvents={role === "rest" ? "auto" : "none"}
      style={[
        styles.leaf,
        { top: -head, transformOrigin: [width / 2, head, 0], zIndex: moving ? 2 : 1 },
        role === "hidden" && styles.hidden,
        leafStyle,
      ]}
    >
      {children}
      {/* Always mounted, so each shows its own opacity from the first frame
          of a turn: a shade mounted mid-turn would show, until the page
          moved, whatever its style first worked out. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, underDim]} />
      <Animated.View pointerEvents="none" style={[styles.cast, castShadow]}>
        <LinearGradient
          colors={["rgba(28,20,12,0.42)", "rgba(28,20,12,0.14)", "rgba(28,20,12,0)"]}
          locations={[0, 0.35, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tiltShade]}>
        <LinearGradient
          colors={["rgba(40,30,18,0.05)", "rgba(40,30,18,0.2)", "rgba(40,30,18,0.5)"]}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const CAST_W = 110;

const styles = StyleSheet.create({
  strip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  book: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  leaf: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    display: "none",
  },
  dim: {
    backgroundColor: "#1C140C",
  },
  cast: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: CAST_W,
    transformOrigin: "0% 50%",
  },
});
