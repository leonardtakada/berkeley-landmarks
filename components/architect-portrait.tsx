import React, { useEffect } from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";

import { PORTRAIT_SVG } from "@/components/architect-portraits.generated";
import { LivingSvg, type MovingSheet } from "@/components/living-svg";
import { useScrollClock } from "@/components/scroll-clock";
import { ARCHITECTS, type ArchitectKey } from "@/lib/architects";
import { SMILE_REACH, pathTemplate, smiling, type SvgNode } from "@/lib/svg-tree";

const ASPECT = 240 / 200;

type Gesture = "blink" | "twice" | "smile" | "brows" | "left" | "right";

/**
 * Each architect's own little loop, played a gesture at a time as the reader
 * scrolls; `every` is how far the page scrolls between gestures. (Maybeck
 * smiles most; Howard hardly at all.)
 */
const LIFE: Record<ArchitectKey, { loop: Gesture[]; every: number }> = {
  maybeck: { loop: ["smile", "left", "blink", "right", "brows", "smile", "twice"], every: 110 },
  morgan: { loop: ["blink", "right", "smile", "left", "blink"], every: 135 },
  howard: { loop: ["blink", "left", "brows", "right", "blink"], every: 150 },
  ratcliff: { loop: ["smile", "right", "blink", "left", "twice"], every: 115 },
  hays: { loop: ["left", "blink", "brows", "right", "smile"], every: 140 },
  coxhead: { loop: ["blink", "right", "brows", "left", "smile"], every: 150 },
  thomas: { loop: ["left", "blink", "right", "brows", "smile"], every: 125 },
  plachek: { loop: ["smile", "right", "blink", "left", "brows"], every: 120 },
  gutterson: { loop: ["blink", "left", "smile", "right", "twice"], every: 140 },
  yelland: { loop: ["smile", "left", "blink", "right", "brows"], every: 120 },
  esherick: { loop: ["left", "blink", "smile", "right", "twice"], every: 130 },
};

// How far (in the drawing's 200 × 240 units) the eyes travel when they look
// aside, the brows rise, and the mouth goes past its drawn smile — enough to
// read at a glance on a small portrait, not so much it turns into a cartoon.
const LOOK = 3.4;
const BROW_RISE = 5;
/** How much the eyes narrow when they smile (the cheeks come up). */
const SQUINT = 0.35;

interface Life {
  look: SharedValue<number>;
  blink: SharedValue<number>;
  smile: SharedValue<number>;
  brow: SharedValue<number>;
  /** A puff of pipe smoke, rising and curling, with each gesture. */
  puff: SharedValue<number>;
}

/**
 * One of the guide's architects as a flat cut-paper figure on a geometric
 * label — arch, circle, tall panel or square — after the Showa-era travel
 * labels. With `animated`, it is laid down as the page settles; on a page
 * that scrolls, it comes alive as the reader scrolls — looking about,
 * blinking, smiling, raising its brows. With `loop`, it goes through its
 * gestures on its own, one every couple of seconds, for a portrait held
 * still at the head of a page.
 */
export function ArchitectPortrait({
  architect,
  width = 132,
  animated = true,
  delay = 250,
  loop = false,
  style,
}: {
  architect: ArchitectKey;
  width?: number;
  animated?: boolean;
  delay?: number;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  const t = useSharedValue(shouldAnimate ? 0 : 1);
  const ref = useAnimatedRef<Animated.View>();
  const life = useLife(architect, !reduceMotion, shouldAnimate ? delay + 520 : 400, ref, loop);

  useEffect(() => {
    if (!shouldAnimate) return;
    t.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.bezier(0.3, 0, 0.1, 1) }));
  }, [delay, t, shouldAnimate]);

  const lay = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 8 }],
  }));

  const height = width * ASPECT;
  return (
    <Animated.View
      ref={ref}
      style={[{ width, height }, lay, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Drawing of ${ARCHITECTS[architect].name}`}
    >
      <LivingSvg
        xml={PORTRAIT_SVG[architect]}
        width={width}
        height={height}
        part={reduceMotion ? undefined : (sheet, key) => <Feature key={key} sheet={sheet} life={life} />}
      />
    </Animated.View>
  );
}

/** How long each gesture takes, start to finish (ms). */
const LASTS: Record<Gesture, number> = { blink: 280, twice: 570, smile: 1620, brows: 1070, left: 1420, right: 1420 };

/** Plays one gesture; `done` is called once the face is back at rest. */
function play(g: Gesture, life: Life, done: () => void) {
  "worklet";
  const { blink, smile, brow, look, puff } = life;
  puff.set(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 900 })));
  if (g === "blink") {
    blink.set(withSequence(withTiming(1, { duration: 80 }), withDelay(60, withTiming(0, { duration: 140 }, done))));
  } else if (g === "twice") {
    blink.set(
      withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 120 }),
        withDelay(100, withTiming(1, { duration: 80 })),
        withDelay(50, withTiming(0, { duration: 140 }, done)),
      ),
    );
  } else if (g === "smile") {
    smile.set(withSequence(withTiming(1, { duration: 240 }), withDelay(1000, withTiming(0, { duration: 380 }, done))));
  } else if (g === "brows") {
    brow.set(withSequence(withTiming(1, { duration: 170 }), withDelay(600, withTiming(0, { duration: 300 }, done))));
  } else {
    look.set(
      withSequence(
        withTiming(g === "left" ? -1.2 : 1.2, { duration: 260 }),
        withDelay(800, withTiming(0, { duration: 360 }, done)),
      ),
    );
  }
}

function rest() {
  "worklet";
}

/**
 * The gestures, driven by the page's scroll. Between gestures nothing moves,
 * and a portrait scrolled off the screen skips its turn — so a page of them
 * costs nothing while it's read, and little while it's scrolled. With
 * `loop`, they're driven by the clock instead: the next gesture after a
 * breath, round and round.
 */
function useLife(
  architect: ArchitectKey,
  on: boolean,
  settle: number,
  ref: AnimatedRef<Animated.View>,
  loopOn: boolean,
): Life {
  const scroll = useScrollClock();
  const { height: screenH } = useWindowDimensions();
  const blink = useSharedValue(0);
  const smile = useSharedValue(0);
  const brow = useSharedValue(0);
  const look = useSharedValue(0);
  const puff = useSharedValue(0);
  const travel = useSharedValue(0);
  const beat = useSharedValue(0);
  const busy = useSharedValue(0);
  const { loop, every } = LIFE[architect];
  const life = { look, blink, smile, brow, puff };

  // A first blink, once the portrait has settled on the page.
  useEffect(() => {
    if (!on || loopOn) return;
    blink.set(withDelay(settle + 300, withSequence(withTiming(1, { duration: 80 }), withDelay(60, withTiming(0, { duration: 140 })))));
  }, [on, loopOn, settle, blink]);

  // Every so far down (or up) the page, the next gesture in their loop.
  useAnimatedReaction(
    () => (scroll ? scroll.get() : 0),
    (y, prev) => {
      if (!on || loopOn || prev === null) return;
      travel.set(travel.get() + Math.abs(y - prev));
      if (busy.get() || travel.get() < every) return;
      travel.set(0);
      const m = measure(ref);
      if (!m || m.pageY > screenH || m.pageY + m.height < 0) return;
      busy.set(1);
      const done = () => {
        "worklet";
        busy.set(0);
      };
      const g = loop[beat.get() % loop.length];
      beat.set(beat.get() + 1);
      play(g, { look, blink, smile, brow, puff }, done);
    },
    [on, loopOn, loop, every, screenH],
  );

  // On the clock: a gesture, then a breath (a little longer every third
  // time, so the rhythm never ticks), and the next.
  useEffect(() => {
    if (!on || !loopOn) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const g = loop[n % loop.length];
      play(g, { look, blink, smile, brow, puff }, rest);
      n += 1;
      timer = setTimeout(next, LASTS[g] + (n % 3 === 0 ? 1700 : 950));
    };
    timer = setTimeout(next, settle + 300);
    return () => clearTimeout(timer);
  }, [on, loopOn, loop, settle, look, blink, smile, brow, puff]);

  return life;
}

/** A moving part of a portrait: its sheet, slid, squashed or swapped. */
function Feature({ sheet, life }: { sheet: MovingSheet; life: Life }) {
  if (sheet.role === "eye") return <Eyes sheet={sheet} life={life} />;
  if (sheet.role === "brow") return <Brows sheet={sheet} life={life} />;
  if (sheet.role === "mouth") return <Mouth sheet={sheet} life={life} />;
  if (sheet.role === "smoke") return <Smoke sheet={sheet} life={life} />;
  return <View style={sheet.place}>{sheet.print()}</View>;
}

/** The line the eyes sit on (they close onto it), in the drawing's units. */
function eyeLine(root: SvgNode): number {
  const ys: number[] = [];
  const visit = (n: SvgNode) => {
    if (n.attrs["data-anim"] === "eye") ys.push(n.tag === "path" ? pathTemplate(n.attrs.d).cy : parseFloat(n.attrs.cy));
    n.children.forEach(visit);
  };
  visit(root);
  return ys.reduce((a, b) => a + b, 0) / (ys.length || 1);
}

/** The eyes look aside, and close — or narrow in a smile — onto their line. */
function Eyes({ sheet, life }: { sheet: MovingSheet; life: Life }) {
  const { unit } = sheet;
  const origin = (eyeLine(sheet.root) - sheet.box[1]) * unit;
  const move = useAnimatedStyle(() => ({
    transform: [
      { translateX: life.look.value * LOOK * unit },
      { scaleY: Math.max(0.16, 1 - 0.9 * life.blink.value - SQUINT * life.smile.value) },
    ],
  }));
  return <Animated.View style={[sheet.place, { transformOrigin: ["50%", origin, 0] }, move]}>{sheet.print()}</Animated.View>;
}

/** The brows follow the eyes a little, rise, and dip in a blink or a smile. */
function Brows({ sheet, life }: { sheet: MovingSheet; life: Life }) {
  const { unit } = sheet;
  const move = useAnimatedStyle(() => ({
    transform: [
      { translateX: life.look.value * LOOK * 0.35 * unit },
      { translateY: (life.blink.value - life.brow.value * BROW_RISE - life.smile.value) * unit },
    ],
  }));
  return <Animated.View style={[sheet.place, move]}>{sheet.print()}</Animated.View>;
}

/**
 * The mouth and its smile are two pieces of paper: the smile is laid over as
 * the other is lifted away.
 */
function Mouth({ sheet, life }: { sheet: MovingSheet; life: Life }) {
  const rest = useAnimatedStyle(() => ({ opacity: 1 - swap(life.smile.value) }));
  const smile = useAnimatedStyle(() => ({ opacity: swap(life.smile.value) }));
  return (
    <>
      <Animated.View style={[sheet.place, rest]}>{sheet.print()}</Animated.View>
      <Animated.View style={[sheet.place, smile]}>{sheet.print(smiling(sheet.root, SMILE_REACH))}</Animated.View>
    </>
  );
}

/** A quick swap in the middle of the smile's rise, rather than a long double exposure. */
function swap(v: number) {
  "worklet";
  return Math.max(0, Math.min(1, (v - 0.3) / 0.4));
}

/** A puff of pipe smoke rises and curls. */
function Smoke({ sheet, life }: { sheet: MovingSheet; life: Life }) {
  const { unit } = sheet;
  const move = useAnimatedStyle(() => {
    const p = life.puff.value;
    return { transform: [{ translateX: Math.sin(p * Math.PI) * 2 * unit }, { translateY: -p * 3 * unit }] };
  });
  return <Animated.View style={[sheet.place, move]}>{sheet.print()}</Animated.View>;
}
