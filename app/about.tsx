import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EntryPage, RunningHead } from "@/components/entry-page";
import { Bar, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { FONT, INK, MARGIN, TYPE } from "@/constants/book";
import { landmarks } from "@/data/landmarks";
import { tours } from "@/data/tours";
import { ARCHITECTS } from "@/lib/architects";
import { PHOTO_COUNT } from "@/lib/credits";

const count = (kind: string) => landmarks.filter((l) => (l.designationType ?? "Landmark") === kind).length;
const drawn = landmarks.filter((l) => !l.photoUrl).length;

/** A leaf at the back of the guide: how it was made, and where its facts come from. */
export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const clock = useScrollClockHandler();

  const sections: [string, string][] = [
    [
      "The registry",
      `${landmarks.length} entries: the city's designated landmarks (${count("Landmark")}), structures of merit (${count(
        "Structure of Merit",
      )}) and historic districts (${count("Historic District")}), with their particulars — architect, date, style, district — after the Berkeley Architectural Heritage Association and the City of Berkeley Landmarks Preservation Commission. Each is placed on its own building: the building's outline in OpenStreetMap, checked against its address.`,
    ],
    [
      "The walks",
      `${tours.length} walks, each drawn along the ways a walker takes — streets, campus walks, paths and steps, from OpenStreetMap — and passing the front of each building, on the street it faces. Their lengths are measured along that line; their times allow an easy pace and a few minutes at each stop.`,
    ],
    [
      "The maps",
      "The city is drawn as a paper diorama, seen from the south-west: every building raised from its outline in OpenStreetMap, the land stepped in terraces of twenty-five metres from the U.S. Geological Survey's elevations, the registry's landmarks in vermilion. The large map and each walk's fold-out map are printed into the guide, with every photograph, so all of it works with no signal — in the hills, on a plane, from abroad. On the fold-outs, the stops' buildings are drawn larger than life, as a pictorial map draws its sights.",
    ],
    [
      "The photographs",
      `${PHOTO_COUNT} photographs, most from Wikimedia Commons, each credited on its plate and printed in one ink; tap one to see it in colour. The ${drawn} entries without a photograph have a plate drawn after their style and kind — an impression of the type, captioned as such, never passed off as the building. Photographs readers send in are seen by the editors before they appear.`,
    ],
    [
      "The architects",
      `${Object.keys(ARCHITECTS).length} architects, drawn as cut-paper figures. Where no photograph of them was to hand, theirs are period caricatures rather than likenesses. Their lives are written from their Wikipedia articles and the sources those cite, with notes to each.`,
    ],
    [
      "Your copy",
      "The stamps, visits and turned-down pages you make are kept on this phone, and nowhere else. Nothing in the guide asks you to sign in — you'd sign in only to send photographs and corrections to the editors. No notifications, no badges, no tracking.",
    ],
    [
      "Corrections",
      "Every entry ends with a way to suggest a correction to the editors, and to send photographs of a place the guide has none of.",
    ],
  ];

  return (
    <EntryPage>
      <RunningHead back="Appendix" folio="About" />
      <ScrollClock value={clock.offset}>
        <Animated.ScrollView
          onScroll={clock.onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 48 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.block}>
            <Bar />
            <Text style={[TYPE.kicker, styles.kicker]}>Appendix</Text>
            <Text style={styles.title} accessibilityRole="header">
              About this guide
            </Text>
            <Text style={styles.note}>How it was made, and where its facts come from.</Text>
          </View>
          {sections.map(([head, body]) => (
            <View key={head} style={styles.block}>
              <Rule color={INK.charcoal} weight={1} />
              <Text style={[TYPE.kicker, styles.head]} accessibilityRole="header">
                {head}
              </Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          ))}
        </Animated.ScrollView>
      </ScrollClock>
    </EntryPage>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 28,
  },
  kicker: {
    marginTop: 10,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 34,
    lineHeight: 40,
    color: INK.charcoal,
    marginTop: 6,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: INK.sepia,
    marginTop: 8,
  },
  head: {
    marginTop: 14,
    marginBottom: 8,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: 15.5,
    lineHeight: 24,
    color: INK.charcoal,
  },
});
