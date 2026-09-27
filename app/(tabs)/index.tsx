import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { ScreenContainer } from "@/components/screen-container";
import { PageFlip } from "@/components/page-flip";
import { PaperGrain } from "@/components/paper-grain";
import { useColors } from "@/hooks/use-colors";

const SERIF = Platform.select({ ios: "Georgia", default: "serif" });
const SERIF_BOLD = Platform.select({ ios: "Georgia-Bold", default: "serif" });

/** Brand blue from the logo — deep ultramarine on cream, like an indigo
 *  Showa-era two-color print. Sepia remains for secondary details. */
const BRAND_BLUE = "#0B2E8C";
const SEPIA = "#8A7A5E";

/** Ornamental rule: hairline — diamond — hairline (printer's divider). */
function OrnamentalRule({
  color,
  accent,
  width = 200,
}: {
  color: string;
  accent: string;
  width?: number;
}) {
  return (
    <View style={[styles.ruleRow, { width }]}>
      <View style={[styles.ruleLine, { backgroundColor: color, flex: 1 }]} />
      <View style={[styles.ruleDiamond, { borderColor: accent }]} />
      <View style={[styles.ruleDiamond, { borderColor: color }]} />
      <View style={[styles.ruleDiamond, { borderColor: accent }]} />
      <View style={[styles.ruleLine, { backgroundColor: color, flex: 1 }]} />
    </View>
  );
}

/**
 * Hand-drawn-style ink vignette: Sather Tower (the Campanile) rising over
 * the Berkeley hills, scratchy line art like a Showa-era guidebook plate.
 * Indigo linework like a classic two-color print; sepia for the sun mark.
 */
function CampanileVignette({ ink, accent }: { ink: string; accent: string }) {
  const w = 300;
  const h = 190;
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      {/* distant sun — the only secondary mark, sepia like a two-color print */}
      <Circle cx={228} cy={40} r={15} fill={accent} opacity={0.85} />
      <Circle cx={228} cy={40} r={20} stroke={accent} strokeWidth={0.75} opacity={0.4} />

      {/* hills behind the campus — layered arcs with slightly wavering strokes */}
      <Path
        d="M8 138 C 40 118, 78 112, 112 122 C 148 132, 176 118, 208 110 C 244 101, 272 108, 292 118"
        stroke={ink}
        strokeWidth={1.1}
        opacity={0.55}
      />
      <Path
        d="M14 150 C 52 136, 92 132, 128 140 C 162 148, 200 136, 236 130 C 258 126, 276 128, 290 132"
        stroke={ink}
        strokeWidth={1.3}
        opacity={0.75}
      />
      {/* eucalyptus-ish trees on the ridge */}
      <Path d="M52 133 q 2 -12 0 -18 M56 133 q 4 -10 8 -14 M48 133 q -4 -9 -8 -12" stroke={ink} strokeWidth={1} opacity={0.6} />
      <Path d="M240 124 q 2 -11 0 -16 M245 124 q 4 -9 8 -12" stroke={ink} strokeWidth={0.9} opacity={0.55} />

      {/* the Campanile: slender tower, stepped head, clock, open arcades */}
      {/* shaft */}
      <Path d="M136 150 L138 62 L160 62 L162 150" stroke={ink} strokeWidth={1.6} />
      <Path d="M141 150 L142 62 M157 150 L156 62" stroke={ink} strokeWidth={0.7} opacity={0.5} />
      {/* clock stage */}
      <Path d="M133 62 L165 62" stroke={ink} strokeWidth={1.6} />
      <Path d="M134 48 L164 48" stroke={ink} strokeWidth={1.6} />
      <Path d="M133 62 L134 48 M165 62 L164 48" stroke={ink} strokeWidth={1.2} />
      {/* clock face */}
      <Circle cx={139} cy={55} r={4.6} stroke={ink} strokeWidth={1.1} />
      <Path d="M139 55 l0 -3 M139 55 l2.6 1.4" stroke={ink} strokeWidth={0.9} />
      <Circle cx={159} cy={55} r={4.6} stroke={ink} strokeWidth={1.1} />
      <Path d="M159 55 l0 -3 M159 55 l2.6 1.4" stroke={ink} strokeWidth={0.9} />
      {/* stepped crown */}
      <Path d="M132 48 L132 40 L136 40 L136 34 L162 34 L162 40 L166 40 L166 48" stroke={ink} strokeWidth={1.4} />
      {/* lantern + finial */}
      <Path d="M141 34 L141 26 L159 26 L159 34" stroke={ink} strokeWidth={1.3} />
      <Path d="M150 26 L150 14" stroke={ink} strokeWidth={1.1} />
      <Path d="M150 14 l-4 3 M150 14 l4 3 M150 14 l0 4" stroke={ink} strokeWidth={1} />
      {/* base colonnade */}
      <Path d="M120 150 L120 140 L178 140 L178 150" stroke={ink} strokeWidth={1.3} />
      <Path d="M126 150 L126 140 M133 150 L133 140 M167 150 L167 140 M174 150 L174 140" stroke={ink} strokeWidth={0.8} opacity={0.6} />

      {/* ground line with hatching */}
      <Path d="M18 150 C 80 147, 200 153, 284 149" stroke={ink} strokeWidth={1.6} />
      <Path
        d="M30 158 l6 -6 M60 158 l6 -6 M90 158 l6 -6 M120 158 l6 -6 M150 158 l6 -6 M180 158 l6 -6 M210 158 l6 -6 M240 158 l6 -6 M270 158 l6 -6"
        stroke={ink}
        strokeWidth={0.8}
        opacity={0.45}
      />
    </Svg>
  );
}

/**
 * Hanko-style stamped seal accent: a small square seal in the corner
 * of the plate, like a collector's mark on a vintage cover.
 */
function StampedSeal({ accent }: { accent: string }) {
  return (
    <View style={[styles.seal, { borderColor: accent }]} pointerEvents="none">
      <View style={[styles.sealInner, { borderColor: accent }]} />
      <View style={[styles.sealDot, { backgroundColor: accent }]} />
    </View>
  );
}

/**
 * The COVER: a pure title page in the manner of a 1930s indigo-printed
 * Japanese travel guide — double-ruled ultramarine frame, spaced serif
 * capitals, ornamental diamond rule, an indigo line-art plate of the
 * Campanile over the hills, and a stamped seal. Nothing else; the
 * bookmark ribbons at the head of the book carry the navigation.
 */
export default function CoverScreen() {
  const colors = useColors();

  return (
    <ScreenContainer>
      <PageFlip direction={1}>
        <PaperGrain />
        <View style={styles.cover}>
          <View style={[styles.coverFrame, { borderColor: BRAND_BLUE }]} />
          <View style={[styles.coverFrameInner, { borderColor: BRAND_BLUE }]} />
          <View style={styles.coverContent}>
            <Text style={[styles.coverKicker, { color: SEPIA }]}>
              A FIELD GUIDE IN THE OLD MANNER
            </Text>

            <View style={styles.coverTitleBlock}>
              <Text style={[styles.coverTitle, { color: BRAND_BLUE }]}>BERKELEY</Text>
              <OrnamentalRule color={BRAND_BLUE} accent={SEPIA} />
              <Text style={[styles.coverSubtitle, { color: BRAND_BLUE }]}>TOURS</Text>
            </View>

            <View style={styles.plateWrap}>
              <CampanileVignette ink={BRAND_BLUE} accent={SEPIA} />
              <StampedSeal accent={BRAND_BLUE} />
              <Text style={[styles.plateCaption, { color: colors.muted }]}>
                PLATE I — THE CAMPANILE &amp; THE HILLS
              </Text>
            </View>
          </View>
        </View>
      </PageFlip>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // ---- Cover (title page) ----
  cover: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    padding: 4,
  },
  coverFrame: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2.5,
  },
  coverFrameInner: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  coverKicker: {
    fontFamily: SERIF,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 26,
  },
  coverTitleBlock: {
    alignItems: "center",
  },
  coverTitle: {
    fontFamily: SERIF_BOLD,
    fontSize: 54,
    letterSpacing: 10,
    textAlign: "center",
  },
  coverSubtitle: {
    fontFamily: SERIF,
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: 12,
    marginTop: 10,
    paddingRight: 12, // optically re-center tracked small caps
  },
  plateWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: 34,
  },
  plateCaption: {
    fontFamily: SERIF,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 2,
    marginTop: 6,
  },
  seal: {
    position: "absolute",
    right: 18,
    top: 12,
    width: 34,
    height: 34,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-6deg" }],
    opacity: 0.85,
  },
  sealInner: {
    width: 22,
    height: 22,
    borderWidth: 1,
    transform: [{ rotate: "45deg" }],
  },
  sealDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  // ---- Ornamental rule ----
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  ruleLine: {
    height: StyleSheet.hairlineWidth * 2,
  },
  ruleDiamond: {
    width: 7,
    height: 7,
    borderWidth: 1,
    transform: [{ rotate: "45deg" }],
  },
});
