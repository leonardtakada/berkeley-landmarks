import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { IconSymbol } from "@/components/ui/icon-symbol";

export interface MapStop {
  id: string;
  name: string;
  order: number;
  latitude: number;
  longitude: number;
}

interface AccordionMapProps {
  stops: MapStop[];
  color: string;
  foreground: string;
  muted: string;
  border: string;
  surface: string;
  onOpenFullMap: () => void;
}

const CLOSED_H = 58;
const OPEN_H = 300;
const SPRING = { damping: 16, stiffness: 170, mass: 0.9 };

/**
 * Fold-out map insert — like the accordion maps bound into vintage guidebooks.
 * Collapsed: a folded strip hinting at hidden panels.
 * Expanded: panels unfold in sequence to reveal a dashed route diagram.
 */
export function AccordionMap({
  stops,
  color,
  foreground,
  muted,
  border,
  surface,
  onOpenFullMap,
}: AccordionMapProps) {
  const open = useSharedValue(0);

  const toggle = () => {
    open.value = open.value > 0.5
      ? withSpring(0, SPRING)
      : withSpring(1, SPRING);
  };

  const containerStyle = useAnimatedStyle(() => ({
    height: interpolate(open.value, [0, 1], [CLOSED_H, OPEN_H]),
  }));

  // Each panel unfolds in sequence, like a paper accordion opening
  const panel = (index: number) =>
    useAnimatedStyle(() => {
      const progress = open.value;
      const stagger = index * 0.18;
      const p = Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger || 1)));
      return {
        opacity: p,
        transform: [{ scaleY: interpolate(p, [0, 1], [0.06, 1]) }],
      };
    });

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 0.55], [1, 0]),
  }));
  const mapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0.45, 0.9], [0, 1]),
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0.6, 1], [0, 1]),
  }));

  // Route geometry — normalize stop coords into the diagram viewport
  const { points, path } = useMemo(() => {
    if (stops.length < 2) return { points: [], path: "" };
    const lats = stops.map((s) => s.latitude);
    const lngs = stops.map((s) => s.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const W = 280, H = 150, PAD = 22;
    const spanLat = Math.max(maxLat - minLat, 0.002);
    const spanLng = Math.max(maxLng - minLng, 0.002);
    const pts = stops.map((s) => ({
      x: PAD + ((s.longitude - minLng) / spanLng) * (W - 2 * PAD),
      // svg y grows downward — invert latitude
      y: PAD + (1 - (s.latitude - minLat) / spanLat) * (H - 2 * PAD),
      order: s.order,
    }));
    return { points: pts, path: pts.map((p) => `${p.x},${p.y}`).join(" ") };
  }, [stops]);

  return (
    <Animated.View
      style={[styles.container, { borderColor: border, backgroundColor: surface }, containerStyle]}
    >
      <Pressable onPress={toggle} style={styles.touchArea} accessibilityLabel="Fold out route map">
        {/* Collapsed strip: three folded panels with crease shadows */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {[0, 1, 2].map((i) => {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const s = panel(i);
            return (
              <Animated.View
                key={i}
                style={[
                  styles.foldPanel,
                  i < 2 && styles.crease,
                  { backgroundColor: i % 2 ? border + "55" : surface },
                  s,
                ]}
              />
            );
          })}
        </View>

        <Animated.View style={[StyleSheet.absoluteFill, styles.labelRow, labelStyle]} pointerEvents="none">
          <IconSymbol name="map.fill" size={14} color={muted} />
          <Text style={[styles.labelText, { color: foreground }]}>FOLD-OUT ROUTE MAP</Text>
          <Text style={[styles.labelHint, { color: muted }]}>tap to unfold</Text>
        </Animated.View>

        {/* Unfolded: route diagram */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.mapWrap, mapStyle]} pointerEvents="none">
          {points.length >= 2 && (
            <Svg width="100%" height="100%" viewBox="0 0 300 180">
              {/* frame */}
              <Line x1="8" y1="8" x2="292" y2="8" stroke={border} strokeWidth="1" />
              <Line x1="8" y1="172" x2="292" y2="172" stroke={border} strokeWidth="0.5" />
              {/* dashed route */}
              <Polyline
                points={path}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray="5 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* stops */}
              {points.map((p, i) => (
                <React.Fragment key={i}>
                  <Circle cx={p.x} cy={p.y} r="9" fill={surface} stroke={color} strokeWidth="1.25" />
                  <SvgText
                    x={p.x}
                    y={p.y + 3}
                    fontSize="9"
                    fontWeight="600"
                    fill={color}
                    textAnchor="middle"
                  >
                    {p.order}
                  </SvgText>
                </React.Fragment>
              ))}
              {/* compass rose */}
              <SvgText x="278" y="164" fontSize="10" fill={muted} textAnchor="middle">N</SvgText>
              <Line x1="278" y1="167" x2="278" y2="156" stroke={muted} strokeWidth="1" />
              <Circle cx="278" cy="167" r="1.5" fill={muted} />
            </Svg>
          )}
        </Animated.View>

        <Animated.View style={[styles.footerRow, captionStyle]} pointerEvents="none">
          <Text style={[styles.caption, { color: muted }]}>FIELD DIAGRAM · NOT TO SCALE</Text>
        </Animated.View>
      </Pressable>

      {/* Full map link, only sensible when open — keep outside press target */}
      <Animated.View style={[styles.fullMapRow, captionStyle]}>
        <Pressable onPress={onOpenFullMap} hitSlop={8}>
          <Text style={[styles.fullMapLink, { color }]}>Open full map →</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    borderWidth: 1,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  touchArea: {
    flex: 1,
  },
  foldPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "33.34%",
  },
  crease: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(63,55,51,0.25)",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  labelHint: {
    fontSize: 10,
    fontStyle: "italic",
  },
  mapWrap: {
    padding: 6,
  },
  footerRow: {
    position: "absolute",
    bottom: 6,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  caption: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  fullMapRow: {
    position: "absolute",
    top: 8,
    right: 12,
  },
  fullMapLink: {
    fontSize: 11,
    fontWeight: "600",
  },
});
