import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArchitectPortrait } from "@/components/architect-portrait";
import { ChapterOpener, InkIn, SectionPage, useFirstReveal } from "@/components/book-page";
import { Arrow, InkPlane, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { useAuth } from "@/hooks/use-auth";
import { ARCHITECTS, worksBy, type ArchitectKey } from "@/lib/architects";

const GALLERY: ArchitectKey[] = [
  "maybeck",
  "morgan",
  "howard",
  "ratcliff",
  "hays",
  "coxhead",
  "thomas",
  "plachek",
  "gutterson",
  "yelland",
  "esherick",
];

/**
 * The Appendix: the guide's architects as a sheet of labels, the owner's
 * plate, the colophon and the credits.
 */
export default function AppendixScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reveal = useFirstReveal();
  const clock = useScrollClockHandler();
  const { user, logout } = useAuth({ autoFetch: true });
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <SectionPage>
      <ScrollClock value={clock.offset}>
      <Animated.ScrollView
        onScroll={clock.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 40 }}
      >
        <ChapterOpener
          kicker="Appendix"
          title="The Architects"
          note="The hands behind many of the city's landmarks."
          reveal={reveal}
        />

        {/* The label sheet */}
        <View style={styles.gallery}>
          {GALLERY.map((k, i) => (
            <InkIn key={k} reveal={reveal} index={2 + i} step={0.1} style={styles.sitter}>
              <Pressable
                onPress={() => router.push(`/architect/${k}`)}
                style={({ pressed }) => [styles.sitterInner, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${ARCHITECTS[k].name}, ${ARCHITECTS[k].years}`}
                accessibilityHint="Opens their biography"
              >
                <ArchitectPortrait architect={k} width={132} animated={false} />
                <Text style={styles.sitterName}>{ARCHITECTS[k].name}</Text>
                <Text style={styles.sitterYears}>{ARCHITECTS[k].years}</Text>
              </Pressable>
              <Pressable
                onPress={() => router.navigate({ pathname: "/registry", params: { q: ARCHITECTS[k].surname } })}
                hitSlop={{ top: 4, bottom: 4 }}
                style={({ pressed }) => [styles.worksRow, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${worksBy(k).length} entries in the registry`}
              >
                <Text style={styles.link}>{worksBy(k).length} entries</Text>
                <Arrow length={16} />
              </Pressable>
              <Pressable
                onPress={() => router.push(`/architect/${k}`)}
                hitSlop={{ top: 4, bottom: 4 }}
                style={({ pressed }) => [styles.bioRow, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Biography of ${ARCHITECTS[k].name}`}
              >
                <Text style={styles.link}>Biography</Text>
                <Arrow length={16} />
              </Pressable>
            </InkIn>
          ))}
        </View>

        {/* The owner's plate */}
        <InkIn reveal={reveal} index={7} style={styles.plateWrap}>
          <InkPlane color={INK.blue} style={styles.bookplate}>
            <View style={styles.plateSun} />
            <Text style={styles.exLibris}>Your Guide</Text>
            {user ? (
              <>
                <Text style={styles.owner}>{user.name || user.email}</Text>
                {user.name && user.email ? <Text style={styles.ownerSub}>{user.email}</Text> : null}
              </>
            ) : (
              <View style={styles.signLine} />
            )}
          </InkPlane>
          {user ? (
            <Pressable onPress={logout} hitSlop={8} style={styles.plateAction}>
              <Text style={styles.link}>Sign out</Text>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={() => router.push("/login")} hitSlop={8} style={styles.plateAction}>
                <Text style={styles.link}>Sign in to your guide</Text>
                <Arrow length={16} />
              </Pressable>
              <Text style={styles.plateNote}>Needed only to send photographs and corrections to the editors.</Text>
            </>
          )}
        </InkIn>

        {/* Proposals */}
        <InkIn reveal={reveal} index={8} style={styles.propose}>
          <Rule color={INK.charcoal} weight={1} />
          <Text style={[TYPE.kicker, styles.colophonHead]}>A place for the guide</Text>
          <Text style={styles.colophonBody}>
            Know a building or place of interest that isn&apos;t in the guide? Registered readers can propose it to
            the editors, with photographs.
          </Text>
          <Pressable
            onPress={() =>
              user
                ? router.push("/propose")
                : Alert.alert("Sign in to propose a landmark", "Proposals come from registered readers.", [
                    { text: "Not now", style: "cancel" },
                    { text: "Sign in", onPress: () => router.push("/login") },
                  ])
            }
            style={({ pressed }) => [styles.proposeButton, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityHint={user ? undefined : "Asks you to sign in first"}
          >
            <Text style={styles.proposeText}>Propose a landmark</Text>
            <Arrow length={22} color={PAPER.cover} />
          </Pressable>
        </InkIn>

        {/* Colophon */}
        <InkIn reveal={reveal} index={9} style={styles.colophon}>
          <Rule color={INK.charcoal} weight={1} />
          <Text style={[TYPE.kicker, styles.colophonHead]}>Colophon</Text>
          <Text style={styles.colophonBody}>
            Berkeley Tours, a guide to the city&apos;s landmarks and walks, after the commercial print of
            Showa-era Japan. Set in Jost, a revival of Paul Renner&apos;s Futura, with titles in Berkeley Post,
            cut for this guide after Showa poster lettering. Printed in two inks — the blue and vermilion of the
            Campanile device — on cream stock.
          </Text>
          <Text style={styles.colophonBody}>
            Registry particulars after the Berkeley Architectural Heritage Association and the City of
            Berkeley Landmarks Preservation Commission. Photographs from Wikimedia Commons and the readers
            of this guide.
          </Text>
          <View style={styles.credit}>
            <Text style={TYPE.label}>Created by</Text>
            <Text style={styles.creditName}>Leonard Takada</Text>
            <Text style={styles.creditFirm}>Auto Indicator LLC</Text>
          </View>
          <Text style={[TYPE.label, styles.edition]}>© 2026 Auto Indicator LLC · Version {version}</Text>
        </InkIn>
      </Animated.ScrollView>
      </ScrollClock>
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: MARGIN.outer,
    rowGap: 30,
    marginTop: 10,
  },
  sitter: {
    width: "47%",
  },
  sitterInner: {
    alignItems: "flex-start",
  },
  sitterName: {
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 20,
    color: INK.charcoal,
    marginTop: 10,
  },
  sitterYears: {
    ...TYPE.label,
    marginTop: 3,
  },
  worksRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    marginTop: 8,
  },
  bioRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    marginTop: 7,
  },
  link: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.blue,
  },
  plateWrap: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 48,
  },
  bookplate: {
    paddingVertical: 30,
    paddingHorizontal: 26,
    minHeight: 190,
  },
  plateSun: {
    position: "absolute",
    right: 24,
    top: 26,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: INK.vermilion,
  },
  exLibris: {
    fontFamily: FONT.light,
    fontSize: 38,
    lineHeight: 42,
    color: PAPER.cover,
  },
  owner: {
    fontFamily: FONT.regular,
    fontSize: 20,
    color: PAPER.cover,
    marginTop: 18,
  },
  ownerSub: {
    ...TYPE.label,
    color: INK.blueTint,
    marginTop: 4,
  },
  signLine: {
    height: 1,
    backgroundColor: INK.blueTint,
    marginTop: 44,
  },
  plateAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  plateNote: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    color: INK.sepia,
    marginTop: 6,
  },
  colophon: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 48,
  },
  colophonHead: {
    marginTop: 16,
    marginBottom: 10,
  },
  colophonBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 21,
    color: INK.sepia,
    marginBottom: 10,
  },
  propose: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 48,
  },
  proposeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: INK.blue,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  proposeText: {
    fontFamily: FONT.medium,
    fontSize: 12.5,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: PAPER.cover,
  },
  credit: {
    marginTop: 22,
  },
  creditName: {
    fontFamily: FONT.regular,
    fontSize: 19,
    lineHeight: 24,
    color: INK.charcoal,
    marginTop: 6,
  },
  creditFirm: {
    fontFamily: FONT.regular,
    fontSize: 15,
    color: INK.sepia,
    marginTop: 1,
  },
  edition: {
    marginTop: 18,
  },
});
