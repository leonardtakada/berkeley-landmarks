import { StyleSheet, View } from "react-native";
import Svg, { Defs, Rect, Filter, FeTurbulence, FeColorMatrix } from "react-native-svg";

/**
 * Subtle paper-grain overlay ("book chrome" phase 1).
 * Full-screen, absolutely positioned, pointer-events-none.
 * A very-low-opacity fractal-noise texture gives screens a printed-paper feel.
 */
export function PaperGrain() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Svg height="100%" width="100%" style={styles.svg}>
        <Defs>
          <Filter id="paper-noise" x="0" y="0" width="100%" height="100%">
            <FeTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              stitchTiles="stitch"
              result="noise"
            />
            <FeColorMatrix
              in="noise"
              type="matrix"
              // grayscale the noise, render via alpha only
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0"
            />
          </Filter>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" filter="url(#paper-noise)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 999,
    elevation: 999,
    opacity: 0.04,
  },
  svg: {
    flex: 1,
  },
});
