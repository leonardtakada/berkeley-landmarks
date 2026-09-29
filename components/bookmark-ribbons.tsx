import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { FONT, INK, PAGE_TURN_DELAY_MS, PAGE_TURN_MS, PAPER } from "@/constants/book";

const LAYDOWN = require("@/assets/textures/ink-laydown.png");

/**
 * Bookmark ribbons hanging from the head of the book.
 *
 * Flat tapes of ink, square-cut, tucked under a solid band of logo blue at
 * the top edge. The open section's ribbon is drawn out further and printed
 * in solid blue; the others rest in a blue tint, like a screened plate
 * beside a solid one. Tapping the open section's ribbon closes the book.
 *
 * Each ribbon is drawn at full length and slid out from under the band, so
 * the band hides whatever is still tucked in.
 *
 * The ribbons lie over the open page. When a section is turned to, its
 * ribbon curls up off the page like a strip of paper — from the cut end,
 * rolling toward the reader, the underside of the roll showing — and the
 * others fade away. The leaf turns beneath; the ribbon unrolls onto the new
 * page, drawn out in solid blue, and the others come back. (Closing the
 * book, it's the open section's ribbon that curls, and it unrolls in tint.)
 *
 * To curl, a ribbon is cut crosswise into slices, finer toward the cut end
 * where it rolls tightest; each is laid flat at its place and angle along
 * the curve, in one perspective shared from the band.
 */

export const HEAD_BAND_H = 5;
const RIBBON_W = 54;
const GAP = 8;
const RIGHT_MARGIN = 20;
const LEN = 160;
const EXTEND = 22;
const EASE = Easing.bezier(0.3, 0, 0.1, 1);

/** The slices' edges, from the head of the ribbon (0) to its cut end (LEN). */
const EDGES = [0, 28, 43, 55, 66, 76, 85, 93, 100, 107, 113, 119, 124, 129, 133, 137, 141, 145, 148, 151, 154, 157, 160];
/** Each slice overlaps the next by this much, so no seam shows between them. */
const SEAM = 1;
/** Where the label is printed, along the ribbon. */
const LABEL_FROM = 26;
const LABEL_TO = 146;

/** How far round the cut end has turned when fully curled. */
const CURL_TURN = (215 * Math.PI) / 180;
/** How much more tightly the ribbon curls toward its end than where it leaves the page. */
const CURL_TIGHTEN = 1.7;
/** Of the hanging length, how much has left the page when fully curled. */
const CURL_REACH = 0.92;
/** Close perspective, so what curls toward the reader visibly nears. */
const CURL_PERSPECTIVE = 300;

const CURL_MS = 230;
/** It unrolls once the leaf is half over, and lies flat as the leaf does. */
const UNCURL_AT_MS = PAGE_TURN_DELAY_MS + Math.round(PAGE_TURN_MS * 0.5);
const UNCURL_MS = 320;
const FADE_OUT_MS = 120;
const FADE_IN_AT_MS = PAGE_TURN_DELAY_MS + Math.round(PAGE_TURN_MS * 0.55);
const FADE_IN_MS = 200;

/** Light on the page falls from above and in front. */
const LIGHT_Y = -1 / Math.hypot(1, 1.2);
const LIGHT_Z = 1.2 / Math.hypot(1, 1.2);
/** How much a slice darkens as it turns from the light, at most. */
const SHADING = 0.5;
const SHADE_MAX = 0.4;
/** Rolling under, the print is lost to sight between these angles (it'd
 * otherwise show in slivers at the roll's edge). */
const PRINT_LOST_FROM = (8 * Math.PI) / 180;
const PRINT_LOST_TO = (35 * Math.PI) / 180;
const SHADOW = "#0E0A06";

/** Width of the column the ribbons occupy at the head of a page. */
export const RIBBON_COLUMN = RIGHT_MARGIN + RIBBON_W * 3 + GAP * 2 + 12;

type Section = { name: string; label: string; rest: number };

export const SECTIONS: Section[] = [
  // Each ribbon hangs long enough to show its whole label.
  { name: "tours", label: "Tours", rest: 100 },
  { name: "registry", label: "Landmarks", rest: 128 },
  { name: "profile", label: "Appendix", rest: 116 },
];

/** Offset of the page content so it begins under the head-band. */
export function useBookHead() {
  const insets = useSafeAreaInsets();
  return { top: insets.top, contentTop: insets.top + HEAD_BAND_H };
}

/**
 * The ribbon as it curls: for each slice edge, its place below the band (y)
 * and toward the reader (z); for each slice, the angle it lies at (0 flat on
 * the page, π/2 standing out toward the reader, π turned face down).
 */
type Lay = { y: number[]; z: number[]; angle: number[]; lifted: number; low: number };

function lay(hang: number, curl: number): Lay {
  "worklet";
  const y: number[] = [];
  const z: number[] = [];
  const angle: number[] = [];
  // It leaves the page here and curls on to the end, turning `turn` in all,
  // more tightly as it goes.
  const lifted = hang * (1 - CURL_REACH * Math.sin((curl * Math.PI) / 2));
  const span = hang - lifted;
  const turn = curl * CURL_TURN;
  const angleAt = (s: number) => (s <= lifted || span <= 0 ? 0 : turn * Math.pow((s - lifted) / span, CURL_TIGHTEN));

  let py = 0;
  let pz = 0;
  let s = 0;
  let low = 0;
  for (const edge of EDGES) {
    // Distance along the ribbon from the band; negative is tucked under it.
    const at = edge - (LEN - hang);
    if (at <= 0 || curl <= 0) {
      y.push(at);
      z.push(0);
    } else {
      while (s < at) {
        const step = Math.min(1, at - s);
        const a = angleAt(s + step / 2);
        py += step * Math.cos(a);
        pz += step * Math.sin(a);
        s += step;
      }
      y.push(py);
      z.push(pz);
    }
    low = Math.max(low, (y[y.length - 1] * CURL_PERSPECTIVE) / (CURL_PERSPECTIVE - z[z.length - 1]));
  }
  for (let i = 1; i < EDGES.length; i++) {
    angle.push(Math.atan2(z[i] - z[i - 1], y[i] - y[i - 1]));
  }
  return { y, z, angle, lifted, low };
}

function Ribbon({
  section,
  index,
  left,
  selected,
  turn,
  moves,
  onPress,
}: {
  section: Section;
  index: number;
  left: number;
  selected: boolean;
  /** Counts the page turns. */
  turn: number;
  /** Whether it's this ribbon that curls out of the way for the latest turn (the others fade). */
  moves: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const drop = useSharedValue(reduceMotion ? 1 : 0);
  const focus = useSharedValue(selected ? 1 : 0);
  const curl = useSharedValue(0);
  const shown = useSharedValue(1);

  // Drawn out onto the page when the book first opens, one after another.
  useEffect(() => {
    if (reduceMotion) return;
    drop.value = withDelay(220 + index * 90, withTiming(1, { duration: 620, easing: EASE }));
  }, [drop, index, reduceMotion]);

  // Out of the way while the leaf turns: curled up, or faded.
  useEffect(() => {
    if (turn === 0 || reduceMotion) return;
    if (moves) {
      shown.value = withTiming(1, { duration: FADE_OUT_MS });
      curl.value = withSequence(
        // Springing up off the page, it slows as it rolls tight…
        withTiming(1, { duration: CURL_MS, easing: Easing.out(Easing.cubic) }),
        // …and unrolls, settling flat.
        withDelay(UNCURL_AT_MS - CURL_MS, withTiming(0, { duration: UNCURL_MS, easing: Easing.bezier(0.45, 0, 0.25, 1) })),
      );
    } else {
      curl.value = withTiming(0, { duration: FADE_OUT_MS });
      shown.value = withSequence(
        withTiming(0, { duration: FADE_OUT_MS, easing: Easing.out(Easing.quad) }),
        withDelay(FADE_IN_AT_MS - FADE_OUT_MS, withTiming(1, { duration: FADE_IN_MS, easing: Easing.inOut(Easing.quad) })),
      );
    }
  }, [turn, moves, curl, shown, reduceMotion]);

  // A new section: the curling ribbon changes as it rolls up, so it unrolls
  // already showing it; the others change while they're away.
  useEffect(() => {
    if (reduceMotion) {
      focus.value = selected ? 1 : 0;
      return;
    }
    focus.value = withDelay(
      turn === 0 ? 0 : moves ? CURL_MS * 0.6 : FADE_OUT_MS,
      withTiming(selected ? 1 : 0, { duration: moves ? 300 : 160, easing: EASE }),
    );
  }, [selected, turn, moves, focus, reduceMotion]);

  const rest = section.rest;
  const shape = useDerivedValue(() => lay(drop.value * (rest + EXTEND * focus.value), curl.value));

  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  const tape = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(focus.value, [0, 1], [INK.blueTint, INK.blue]),
  }));
  const label = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], [INK.blue, PAPER.cover]),
  }));
  // What still lies on the page casts the tape's small shadow…
  const lying = useAnimatedStyle(() => ({ transform: [{ translateY: shape.value.lifted }] }));
  // …and the curl, lifted off it, a soft one below.
  const hover = useAnimatedStyle(() => ({
    opacity: Math.min(1, curl.value * 2.5),
    transform: [{ translateY: shape.value.low - 4 }],
  }));
  const hit = useAnimatedStyle(() => ({
    height: Math.max(0, drop.value * (rest + EXTEND * focus.value)),
  }));

  return (
    <View pointerEvents="box-none" style={[styles.column, { left }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fade]}>
        <Animated.View style={[styles.hover, hover]}>
          <LinearGradient colors={["rgba(30,24,16,0.2)", "rgba(30,24,16,0)"]} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[styles.lying, tape, lying]} />
        {/* The slices in a plane of their own: iOS depth-sorts layers turned
            in 3D against their siblings, and would lift the flat underlay
            over them. */}
        <View collapsable={false} style={StyleSheet.absoluteFill}>
          {EDGES.slice(1).map((bottom, i) => (
            <Slice
              key={i}
              index={i}
              top={EDGES[i]}
              bottom={bottom}
              shape={shape}
              focus={focus}
              tape={tape}
              labelStyle={label}
              label={section.label}
            />
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[styles.hit, hit]}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onPress();
          }}
          style={StyleSheet.absoluteFill}
          hitSlop={{ left: 4, right: 4, bottom: 12 }}
          accessibilityRole="tab"
          accessibilityLabel={section.label}
          accessibilityState={{ selected }}
          accessibilityHint={selected ? "Returns to the cover" : undefined}
        />
      </Animated.View>
    </View>
  );
}

/**
 * One crosswise slice of a ribbon, `top` to `bottom` along it, laid at its
 * place on the curve. Each slice holds the whole face of the ribbon, shifted
 * so its own part shows; all of them share the band's point as their
 * perspective origin, so the slices meet.
 */
function Slice({
  index,
  top,
  bottom,
  shape,
  focus,
  tape,
  labelStyle,
  label,
}: {
  index: number;
  top: number;
  bottom: number;
  shape: SharedValue<Lay>;
  focus: SharedValue<number>;
  tape: React.ComponentProps<typeof Animated.View>["style"];
  labelStyle: React.ComponentProps<typeof Animated.Text>["style"];
  label: string;
}) {
  const place = useAnimatedStyle(() => {
    const { y, z, angle } = shape.value;
    const a = angle[index];
    // Its head goes to (y, z): a slide along a line turned `toward` off the
    // page, since only y can be translated directly.
    const Y = y[index];
    const Z = z[index];
    const toward = Math.abs(Y) < 1e-3 ? (Z === 0 ? 0 : Math.PI / 2) : Math.atan(Z / Y);
    const along = Math.abs(Y) < 1e-3 ? Z : Y / Math.cos(toward);
    return {
      transform: [
        { perspective: CURL_PERSPECTIVE },
        { rotateX: `${(toward * 180) / Math.PI}deg` },
        { translateY: along },
        { rotateX: `${((a - toward) * 180) / Math.PI}deg` },
        { translateY: LEN - top },
      ],
    };
  });
  // Lit from above: tipped toward the light it brightens not at all, away
  // from it it darkens. Rolling under, its print is lost, and past upright
  // it shows its underside: plain tape. One veil does both — plain tape to
  // cover the print, shadow to darken — at the strength of the two together.
  const tone = useAnimatedStyle(() => {
    const a = shape.value.angle[index];
    const under = Math.cos(a) < 0;
    const lit = (under ? Math.sin(a) : -Math.sin(a)) * LIGHT_Y + Math.abs(Math.cos(a)) * LIGHT_Z;
    const dark = Math.min(SHADE_MAX, Math.max(0, (LIGHT_Z - lit) * SHADING));
    const plain = under
      ? 1
      : Math.min(1, Math.max(0, (a - PRINT_LOST_FROM) / (PRINT_LOST_TO - PRINT_LOST_FROM)));
    const veil = dark + plain * (1 - dark);
    const tape = interpolateColor(focus.value, [0, 1], [INK.blueTint, INK.blue]);
    return {
      opacity: veil,
      backgroundColor: interpolateColor(veil > 0 ? dark / veil : 1, [0, 1], [tape, SHADOW]),
    };
  });

  const last = bottom === LEN;
  return (
    <Animated.View
      style={[
        styles.slice,
        {
          top: HEAD_BAND_H - LEN + top,
          height: bottom - top + (last ? 0 : SEAM),
          transformOrigin: [RIBBON_W / 2, LEN - top, 0],
        },
        place,
      ]}
    >
      <View style={[styles.face, { top: -top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, tape]} />
        <Image source={LAYDOWN} style={styles.grain} />
        {top < LABEL_TO && bottom > LABEL_FROM ? (
          <View style={styles.labelBox}>
            <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
              {label.toUpperCase()}
            </Animated.Text>
          </View>
        ) : null}
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, tone]} />
    </Animated.View>
  );
}

export function BookmarkRibbons({
  focused,
  onSelect,
}: {
  /** Route name of the open section ("index" for the cover). */
  focused: string;
  onSelect: (routeName: string) => void;
}) {
  const { width } = useWindowDimensions();
  const { top } = useBookHead();
  const start = width - RIGHT_MARGIN - RIBBON_W * SECTIONS.length - GAP * (SECTIONS.length - 1);

  // Every change of section is a page turn. The ribbon of the section
  // turned to curls out of the way — or, closing the book, the ribbon of the
  // section closed: the one that was tapped either way.
  const [turns, setTurns] = useState({ count: 0, at: focused, mover: "" });
  if (turns.at !== focused) {
    setTurns({ count: turns.count + 1, at: focused, mover: focused === "index" ? turns.at : focused });
  }

  return (
    <View pointerEvents="box-none" style={[styles.head, { top }]}>
      <View pointerEvents="box-none" style={styles.clip}>
        {SECTIONS.map((section, i) => (
          <Ribbon
            key={section.name}
            section={section}
            index={i}
            left={start + i * (RIBBON_W + GAP)}
            selected={focused === section.name}
            turn={turns.count}
            moves={turns.mover === section.name}
            onPress={() => onSelect(focused === section.name ? "index" : section.name)}
          />
        ))}
      </View>
      {/* The head-band: one solid bar of the logo blue. */}
      <View pointerEvents="none" style={styles.band} />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(30,24,16,0.14)", "rgba(30,24,16,0)"]}
        style={styles.bandShadow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HEAD_BAND_H + LEN,
    zIndex: 20,
    elevation: 20,
  },
  clip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEAD_BAND_H + LEN,
    overflow: "hidden",
  },
  column: {
    position: "absolute",
    top: 0,
    width: RIBBON_W + 6,
    height: HEAD_BAND_H + LEN,
  },
  hover: {
    position: "absolute",
    top: HEAD_BAND_H,
    left: -3,
    width: RIBBON_W + 6,
    height: 12,
  },
  lying: {
    // What lies on the page, casting the tape's small, soft shadow.
    position: "absolute",
    top: HEAD_BAND_H - LEN,
    width: RIBBON_W,
    height: LEN,
    shadowColor: "#1E1810",
    shadowOpacity: 0.16,
    shadowRadius: 2,
    shadowOffset: { width: 1, height: 1.5 },
  },
  slice: {
    position: "absolute",
    left: 0,
    width: RIBBON_W,
    overflow: "hidden",
  },
  face: {
    position: "absolute",
    left: 0,
    width: RIBBON_W,
    height: LEN,
  },
  grain: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 256,
    height: 256,
    opacity: 0.28,
  },
  labelBox: {
    position: "absolute",
    width: 120,
    height: RIBBON_W,
    left: (RIBBON_W - 120) / 2,
    // The label reads top to bottom and ends a little above the cut.
    top: LEN - 14 - 60 - RIBBON_W / 2,
    justifyContent: "center",
    transform: [{ rotate: "90deg" }],
  },
  label: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 2.6,
    textAlign: "right",
  },
  hit: {
    position: "absolute",
    top: HEAD_BAND_H,
    left: 0,
    width: RIBBON_W,
  },
  band: {
    height: HEAD_BAND_H,
    backgroundColor: INK.blue,
  },
  bandShadow: {
    height: 4,
  },
});
