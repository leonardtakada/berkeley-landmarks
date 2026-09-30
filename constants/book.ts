import { StyleSheet } from "react-native";
import {
  Jost_200ExtraLight,
  Jost_300Light,
  Jost_300Light_Italic,
  Jost_400Regular,
  Jost_400Regular_Italic,
  Jost_500Medium,
  Jost_600SemiBold,
} from "@expo-google-fonts/jost";

/**
 * The press sheet, after Showa Modern (1920s–30s Japanese commercial print):
 * smooth cream stock, two flat inks taken from the logo — blue and
 * vermilion — laid down as confident planes, and charcoal for text.
 */
export const PAPER = {
  /** Cream stock — lettering on the blue board, the lightest paper. */
  cover: "#F2F0E6",
  /** Interior leaves — warm off-white. Never stark white. */
  page: "#FAF6EC",
  /** A loose slip laid on the page (map legend, sheets), a shade lighter. */
  slip: "#FDFAF2",
  /** The page beneath a turning leaf. */
  shade: "#E6DFCC",
  /** The cover board: solid blue, the same as the launch screen. */
  board: "#0A2C8D",
} as const;

export const INK = {
  /** The logo blue — titles, rules, ribbons, stamps, markers. The only blue. */
  blue: "#0B2E8C",
  /** Blue printed as a tint (screened plate). */
  blueTint: "#C9D0E4",
  /** The logo's second ink: vermilion, for accents and the second plate. */
  vermilion: "#E4592B",
  /** Vermilion printed as a tint. */
  vermilionTint: "#F4CDB9",
  /** Text. Warm charcoal, never pure black. */
  charcoal: "#2E2A27",
  /** Secondary text. */
  sepia: "#7A6E62",
  /** Quiet labels, folios. */
  faded: "#A79C8E",
  /** Hairline rules. */
  rule: "rgba(46,42,39,0.22)",
  /** Blue at low strength, for guide lines. */
  blueFaint: "rgba(11,46,140,0.25)",
} as const;

/**
 * Type: Jost, a Futura revival — the face of the Showa Modern book itself.
 * Hierarchy comes from weight, size and tracking, not ornament.
 */
export const FONT = {
  hairline: "Jost_200ExtraLight",
  light: "Jost_300Light",
  lightItalic: "Jost_300Light_Italic",
  regular: "Jost_400Regular",
  italic: "Jost_400Regular_Italic",
  medium: "Jost_500Medium",
  semibold: "Jost_600SemiBold",
  /**
   * Berkeley Post: the guide's own title face, heavy cut-paper capitals after
   * Showa-era poster lettering (scripts/build-title-font.py). Titles only.
   */
  display: "BerkeleyPost",
} as const;

export const FONT_ASSETS = {
  Jost_200ExtraLight,
  Jost_300Light,
  Jost_300Light_Italic,
  Jost_400Regular,
  Jost_400Regular_Italic,
  Jost_500Medium,
  Jost_600SemiBold,
  BerkeleyPost: require("../assets/fonts/BerkeleyPost.otf"),
};

/** One page turn, cover to colophon. */
export const PAGE_TURN_MS = 650;

/**
 * Turning to a section, the ribbons start to fade away; the leaf starts to
 * turn PAGE_TURN_DELAY_MS in, a beat behind.
 */
export const PAGE_TURN_DELAY_MS = 50;

export const TYPE = StyleSheet.create({
  /** Tracked capitals above a title: "CHAPTER 01 — THE REGISTRY". */
  kicker: {
    fontFamily: FONT.medium,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: INK.blue,
  },
  /** Quiet tracked capitals: folios, labels. */
  label: {
    fontFamily: FONT.regular,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: INK.sepia,
  },
  /** Section title, in the cut-paper display face: "THE REGISTRY". */
  display: {
    fontFamily: FONT.display,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: INK.blue,
  },
  /** Page title. */
  title: {
    fontFamily: FONT.light,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.5,
    color: INK.charcoal,
  },
  /** Entry title in a list. */
  entry: {
    fontFamily: FONT.regular,
    fontSize: 19,
    lineHeight: 24,
    color: INK.charcoal,
  },
  /** Running text. */
  body: {
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 26,
    color: INK.charcoal,
  },
  /** A note in the margin: light italic, a touch of tracking. */
  annotation: {
    fontFamily: FONT.lightItalic,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0.3,
    color: INK.sepia,
  },
  /** Big numerals: chapter numbers, registry numbers. */
  numeral: {
    fontFamily: FONT.hairline,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1,
    color: INK.blue,
  },
});

/** Standard page margins (points). */
export const MARGIN = {
  outer: 24,
} as const;

/** Chapter numbers are printed as two-figure numerals: 01, 02 … */
export function chapterNo(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(2, "0");
}
