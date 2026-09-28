import React, { useEffect } from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  measure,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { Circle, Ellipse, G } from "react-native-svg";

import { LivingSvg, svgProps } from "@/components/living-svg";
import { WALK_LABEL_SVG } from "@/components/print-art.generated";
import { useScrollClock } from "@/components/scroll-clock";
import type { SvgNode } from "@/lib/svg-tree";

const ASPECT = 240 / 200;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// How far (in the label's 200 × 240 units) the sun travels at the ends of its
// arc — out to the side and down behind the scenery — and the clouds drift.
const ARC_X = 52;
const ARC_Y = 60;
const CLOUD_X = 26;

/**
 * A walk's label: a flat printed scene on a geometric label, after the
 * Showa-era travel labels (scripts/build-print-art.ts). With `animated`, it is
 * laid down as the page settles. On a page that scrolls, its sun or moon
 * crosses the sky as the label travels up the screen: rising from behind the
 * scenery, standing where it was drawn as the label passes the middle of the
 * screen, and setting on the far side.
 */
export function WalkLabel({
  tourId,
  title,
  width = 104,
  animated = true,
  delay = 250,
  style,
}: {
  tourId: string;
  title: string;
  width?: number;
  animated?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  const t = useSharedValue(shouldAnimate ? 0 : 1);
  const ref = useAnimatedRef<Animated.View>();
  const laid = useSharedValue(0);
  const sky = useSky(ref, laid);

  useEffect(() => {
    if (!shouldAnimate) return;
    t.value = withDelay(delay, withTiming(1, { duration: 560, easing: Easing.bezier(0.3, 0, 0.1, 1) }));
  }, [delay, t, shouldAnimate]);

  const lay = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 8 }],
  }));

  const xml = WALK_LABEL_SVG[tourId];
  const height = width * ASPECT;
  return (
    <Animated.View
      ref={ref}
      onLayout={(e) => {
        // (A page hidden behind another lays its art out at zero size; only a
        // real layout is worth measuring.)
        if (e.nativeEvent.layout.height > 0) laid.set(laid.get() + 1);
      }}
      style={[{ width, height }, lay, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Label for the walk ${title}`}
    >
      {xml ? (
        <LivingSvg
          xml={xml}
          width={width}
          height={height}
          part={
            reduceMotion
              ? undefined
              : (sheet, key) => (
                  <View key={key} style={sheet.place}>
                    {sheet.print(undefined, (node, k) =>
                      node.attrs["data-anim"] ? <SkyPart key={k} node={node} sky={sky} /> : undefined,
                    )}
                  </View>
                )
          }
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * Where the label's sun is in its day, from -1 (rising) through 0 (where it
 * was drawn) to 1 (setting): 0 when the label is in the middle of the screen,
 * or — for a label that starts in the top half of the page — at the top of
 * the page, so every label opens as drawn.
 */
function useSky(ref: AnimatedRef<Animated.View>, laid: SharedValue<number>) {
  const scroll = useScrollClock();
  const { height: screenH } = useWindowDimensions();
  const sky = useSharedValue(0);
  useAnimatedReaction(
    () => [scroll ? scroll.get() : 0, laid.get()],
    ([y, placed]) => {
      if (!scroll || placed === 0) return;
      const m = measure(ref);
      // Off screen, the sun stays where it was: there's nothing to redraw.
      if (!m || m.pageY > screenH || m.pageY + m.height < 0) return;
      const centre = m.pageY + m.height / 2;
      const rest = Math.max(0, centre + y - screenH / 2);
      const u = Math.max(-1.2, Math.min(1.2, (y - rest) / (screenH * 0.55)));
      const step = Math.round(u * 200) / 200;
      if (step !== sky.get()) sky.set(step);
    },
    [screenH],
  );
  return sky;
}

function SkyPart({ node, sky }: { node: SvgNode; sky: SharedValue<number> }) {
  if (node.attrs["data-anim"] === "cloud") return <Cloud node={node} sky={sky} />;
  const sink = node.attrs["data-path"] === "sink";
  if (node.tag === "g") {
    // A crescent moon: the disc and the disc of sky cut from it move as one.
    return (
      <G>
        {node.children.map((c, i) => (
          <SkyDisc key={i} node={c} sky={sky} sink={sink} />
        ))}
      </G>
    );
  }
  return <SkyDisc node={node} sky={sky} sink={sink} />;
}

function SkyDisc({ node, sky, sink }: { node: SvgNode; sky: SharedValue<number>; sink: boolean }) {
  const { cx, cy, ...rest } = node.attrs;
  const x = parseFloat(cx);
  const y = parseFloat(cy);
  const animatedProps = useAnimatedProps(() => {
    const u = sky.value;
    return { cx: x + (sink ? 0 : u * ARC_X), cy: y + u * u * ARC_Y };
  });
  return <AnimatedCircle {...svgProps(rest)} cx={x} cy={y} animatedProps={animatedProps} />;
}

function Cloud({ node, sky }: { node: SvgNode; sky: SharedValue<number> }) {
  const { cx, ...rest } = node.attrs;
  const x = parseFloat(cx);
  const animatedProps = useAnimatedProps(() => ({ cx: x + sky.value * CLOUD_X }));
  return <AnimatedEllipse {...svgProps(rest)} cx={x} animatedProps={animatedProps} />;
}
