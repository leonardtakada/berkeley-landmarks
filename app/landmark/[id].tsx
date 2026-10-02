import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArchitectPortrait } from "@/components/architect-portrait";
import { DateStamp } from "@/components/copy-marks";
import { EntryPage, RunningHead } from "@/components/entry-page";
import { PaperGrain } from "@/components/paper-grain";
import { PhotoGallery, PhotoViewer, type GalleryPhoto } from "@/components/photo-gallery";
import { Annotation, Arrow, Bar, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { DrawnPlate, TippedInPlate } from "@/components/tipped-in-plate";
import { getApiBaseUrl } from "@/constants/api";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { CATEGORY_LABELS, landmarks, type Landmark } from "@/data/landmarks";
import { forgetSession, isSignedOutError, useAuth } from "@/hooks/use-auth";
import { ARCHITECTS, architectOf, worksBy } from "@/lib/architects";
import { howFar, placeCheck } from "@/lib/arrival";
import { isLapsed, type Watch } from "@/lib/watches";
import { photoCredit, photoSource } from "@/lib/photo-source";
import { pickPhotos } from "@/lib/photo-prep";
import { useReaderCopy } from "@/lib/reader-copy-context";
import { useWatchPlaces } from "@/lib/watch-places";
import { trpc } from "@/lib/trpc";
import { whereYouAre } from "@/lib/where-you-are";

const EDITABLE_FIELDS: { key: keyof Landmark; label: string; multiline?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "address", label: "Address" },
  { key: "architect", label: "Architect" },
  { key: "yearBuilt", label: "Year built" },
  { key: "style", label: "Style" },
  { key: "neighborhood", label: "District" },
  { key: "description", label: "Description", multiline: true },
];

function milesBetween(a: Landmark, b: Landmark) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function photoUri(url: string) {
  return url.startsWith("http") ? url : `${getApiBaseUrl()}${url}`;
}

/**
 * An entry in the registry, printed as a page of the guide: running head,
 * the photograph as a one-ink plate (or, wanting one, a plate drawn after
 * the building's style), the particulars, the architect (drawn,
 * where the book has a drawing of them), the history, and what's nearby.
 */
export default function LandmarkEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const landmark = landmarks.find((l) => l.id === id);

  const { data: approvedPhotos } = trpc.photos.getForLandmark.useQuery(
    { landmarkId: id },
    { enabled: !!id },
  );
  const submitPhoto = trpc.photos.submit.useMutation();
  const submitEdit = trpc.submissions.submit.useMutation();
  const { user } = useAuth({ autoFetch: true });
  const { copy, mark } = useReaderCopy();
  const { ledger, toggle, retire, activeWatches } = useWatchPlaces();

  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [editNote, setEditNote] = useState("");
  const [editSending, setEditSending] = useState(false);
  const [editSent, setEditSent] = useState(false);
  const clock = useScrollClockHandler();

  // Every photograph of the place: the lead plate, the guide's others, and
  // those readers have sent in and the editors approved.
  const gallery = useMemo<GalleryPhoto[]>(() => {
    if (!landmark) return [];
    const list: GalleryPhoto[] = [];
    if (landmark.photoUrl) list.push({ uri: photoUri(landmark.photoUrl), credit: photoCredit(landmark.photoUrl) });
    for (const p of landmark.photos ?? []) {
      list.push({ uri: photoUri(p.url), caption: p.caption, credit: photoCredit(p.url) ?? p.credit });
    }
    for (const p of approvedPhotos ?? []) {
      list.push({ uri: photoUri(p.photoUrl), caption: p.caption ?? "From a reader", credit: "Sent in by a reader" });
    }
    return list;
  }, [landmark, approvedPhotos]);

  const nearby = useMemo(() => {
    if (!landmark) return [];
    return landmarks
      .filter((l) => l.id !== landmark.id)
      .map((l) => ({ l, miles: milesBetween(landmark, l) }))
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 4);
  }, [landmark]);

  const openEdit = useCallback(() => {
    if (!user) {
      Alert.alert("Sign in to suggest a correction", "Corrections are reviewed before they go into the guide.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => router.push("/login") },
      ]);
      return;
    }
    setEditFields({});
    setEditNote("");
    setEditSent(false);
    setEditOpen(true);
  }, [user, router]);

  const sendEdit = useCallback(async () => {
    if (!landmark) return;
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(editFields)) if (v.trim()) payload[k] = v.trim();
    if (!Object.keys(payload).length) {
      Alert.alert("Nothing to correct", "Write in at least one field you'd like changed.");
      return;
    }
    setEditSending(true);
    try {
      await submitEdit.mutateAsync({
        landmarkId: landmark.id,
        type: "correction",
        payload,
        note: editNote.trim() || undefined,
      });
      setEditSent(true);
      setTimeout(() => setEditOpen(false), 1600);
    } catch (e: any) {
      if (isSignedOutError(e)) {
        await forgetSession();
        setEditOpen(false);
        Alert.alert("Sign in again", "Your sign-in had lapsed. Sign in, and send it again.", [
          { text: "Not now", style: "cancel" },
          { text: "Sign in", onPress: () => router.push("/login") },
        ]);
      } else Alert.alert("Couldn't send the correction", e?.message ?? "Something went wrong.");
    } finally {
      setEditSending(false);
    }
  }, [landmark, editFields, editNote, submitEdit, router]);

  const addPhotos = useCallback(async () => {
    if (!user) {
      Alert.alert("Sign in to add photographs", "Photographs are reviewed before they go into the guide.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => router.push("/login") },
      ]);
      return;
    }
    try {
      // The editors hold up to three of a reader's photographs per place.
      const chosen = await pickPhotos(3);
      if (!chosen.length) return;
      setUploading(true);
      setUploaded(0);
      let sent = 0;
      for (const photo of chosen) {
        await submitPhoto.mutateAsync({ landmarkId: id, photoBase64: photo.base64, mimeType: photo.mimeType });
        sent += 1;
      }
      setUploaded(sent);
    } catch (e: any) {
      if (isSignedOutError(e)) {
        await forgetSession();
        Alert.alert("Sign in again", "Your sign-in had lapsed. Sign in, and send it again.", [
          { text: "Not now", style: "cancel" },
          { text: "Sign in", onPress: () => router.push("/login") },
        ]);
      } else Alert.alert("Couldn't add the photographs", e?.message ?? "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }, [id, submitPhoto, user, router]);

  if (!landmark) {
    return (
      <EntryPage>
        <RunningHead back="The Registry" />
        <View style={styles.missing}>
          <Annotation>This landmark isn&apos;t in the guide.</Annotation>
        </View>
      </EntryPage>
    );
  }

  const architect = architectOf(landmark);
  const number = landmark.landmarkNumber?.replace(/^#/, "");
  const plateW = screenW - MARGIN.outer * 2 - 10;
  const plateH = Math.round(plateW * 0.68);
  // The paragraph opens on its first words in blue capitals, as a lead-in.
  const words = landmark.description.split(" ");
  const leadIn = words.slice(0, 3).join(" ");
  const rest = words.slice(3).join(" ");

  const particulars: [string, string][] = (
    [
      ["Architect", landmark.architect],
      ["Built", landmark.yearBuilt],
      ["Style", landmark.style],
      ["District", landmark.neighborhood],
      ["Registry", number ? `No. ${number}` : ""],
      ["Designation", landmark.designationType !== "Landmark" ? landmark.designationType ?? "" : ""],
      ["National Register", landmark.nationalRegister ? "Listed ※" : ""],
    ] as [string, string][]
  ).filter(([, v]) => v && !/^unknown$/i.test(v));

  return (
    <EntryPage>
      <RunningHead
        back="The Registry"
        folio={number ? `No. ${number}` : undefined}
        corner={{ on: !!copy.corners[landmark.id], onToggle: () => mark("corners", landmark.id, !copy.corners[landmark.id]) }}
      />
      <ScrollClock value={clock.offset}>
      <Animated.ScrollView
        onScroll={clock.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The plate */}
        <View style={styles.plate}>
          {landmark.photoUrl ? (
            <TippedInPlate
              source={photoSource(photoUri(landmark.photoUrl))}
              index={1}
              caption={landmark.name}
              credit={photoCredit(landmark.photoUrl)}
              width={plateW}
              height={plateH}
              onPress={() => setViewerAt(0)}
            />
          ) : (
            <DrawnPlate subject={landmark} index={1} width={plateW + 10} />
          )}
        </View>

        {/* Title */}
        <View style={styles.block}>
          <Bar />
          <Text style={[TYPE.kicker, styles.kicker]}>
            {CATEGORY_LABELS[landmark.category]}
            {number ? `  ·  Landmark No. ${number}` : ""}
          </Text>
          <Text style={styles.title}>{landmark.name}</Text>
          <Text style={styles.address}>{landmark.address}, Berkeley</Text>
          <DateStamp
            word="Visited"
            day={copy.visited[landmark.id]}
            prompt="Mark as visited"
            onStamp={() => {
              mark("visited", landmark.id, true);
              // The stamp retires the watch: watch → go → stamped.
              void retire(landmark.id);
            }}
            onErase={() => mark("visited", landmark.id, false)}
            check={() => visitCheck(landmark)}
            style={styles.visited}
          />
          <WatchToggle
            landmark={landmark}
            watch={ledger.watches[landmark.id]}
            oldest={activeWatches[0]}
            onToggle={() => toggle(landmark)}
            onRetire={retire}
          />
        </View>

        {/* Particulars */}
        <View style={[styles.block, styles.table]}>
          {particulars.map(([label, value], i) => (
            <View key={label}>
              <View style={styles.particular}>
                <Text style={[TYPE.label, styles.particularLabel]}>{label}</Text>
                <Text style={styles.particularValue}>
                  {value.endsWith("※") ? (
                    <>
                      {value.slice(0, -1)}
                      <Text style={styles.nr}>※</Text>
                    </>
                  ) : (
                    value
                  )}
                </Text>
              </View>
              {i < particulars.length - 1 ? <Rule /> : null}
            </View>
          ))}
        </View>

        {/* The architect, drawn */}
        {architect ? (
          <View style={[styles.block, styles.architect]}>
            <ArchitectPortrait architect={architect} width={108} animated={false} />
            <View style={styles.architectText}>
              <Text style={TYPE.label}>The Architect</Text>
              <Text style={styles.architectName}>{ARCHITECTS[architect].name}</Text>
              <Text style={[TYPE.label, styles.architectYears]}>{ARCHITECTS[architect].years}</Text>
              <Text style={styles.architectNote}>{ARCHITECTS[architect].note}</Text>
              <Pressable
                onPress={() =>
                  router.navigate({ pathname: "/registry", params: { q: ARCHITECTS[architect].surname } })
                }
                hitSlop={8}
                style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
              >
                <Text style={styles.link}>{worksBy(architect).length - 1} more in the registry</Text>
                <Arrow length={18} />
              </Pressable>
              <Pressable
                onPress={() => router.push(`/architect/${architect}`)}
                hitSlop={8}
                style={({ pressed }) => [styles.linkRow, styles.bioLink, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`Biography of ${ARCHITECTS[architect].name}`}
              >
                <Text style={styles.link}>Biography</Text>
                <Arrow length={18} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* History */}
        <View style={styles.block}>
          <Rule color={INK.charcoal} weight={1} style={styles.historyRule} />
          <Text style={styles.history}>
            <Text style={styles.leadIn}>{leadIn.toUpperCase()}</Text> {rest}
          </Text>
        </View>

        {/* The map */}
        <Pressable
          onPress={() => router.push({ pathname: "/map", params: { landmarkId: landmark.id } })}
          style={({ pressed }) => [styles.block, styles.linkRow, pressed && { opacity: 0.5 }]}
          accessibilityRole="link"
        >
          <Text style={styles.link}>Find it on the map</Text>
          <Arrow length={22} />
        </Pressable>

        {/* The gallery: shown when there's more than the one plate */}
        {gallery.length > 1 ? (
          <View style={styles.block}>
            <PhotoGallery photos={gallery} onOpen={setViewerAt} />
          </View>
        ) : null}

        {/* Nearby */}
        <View style={styles.block}>
          <Text style={[TYPE.label, styles.subhead]}>Nearby in the registry</Text>
          <Rule color={INK.charcoal} weight={1} />
          {nearby.map(({ l, miles }, i) => (
            <Pressable
              key={l.id}
              onPress={() => router.push(`/landmark/${l.id}`)}
              style={({ pressed }) => [styles.nearby, pressed && { opacity: 0.5 }]}
            >
              <View style={styles.nearbyRow}>
                <Text style={styles.nearbyName} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={styles.nearbyMiles}>
                  {miles < 0.02
                    ? "Next door"
                    : miles < 0.1
                      ? `${Math.max(100, Math.round((miles * 5280) / 50) * 50)} ft`
                      : `${miles.toFixed(1)} mi`}
                </Text>
              </View>
              <Text style={styles.nearbyAddr}>{l.address}</Text>
              {i < nearby.length - 1 ? <Rule style={styles.nearbyRule} /> : null}
            </Pressable>
          ))}
        </View>

        {/* Contribute */}
        <View style={[styles.block, styles.contribute]}>
          <Text style={[TYPE.label, styles.subhead]}>Help complete the guide</Text>
          {uploading ? (
            <ActivityIndicator color={INK.blue} style={styles.contributeRow} />
          ) : uploaded ? (
            <Annotation style={styles.contributeRow}>
              {uploaded === 1 ? "Your photograph is" : "Your photographs are"} with the editors.
            </Annotation>
          ) : (
            <Pressable onPress={addPhotos} hitSlop={8} style={[styles.linkRow, styles.contributeRow]}>
              <Text style={styles.link}>Add photographs</Text>
              <Arrow length={18} />
            </Pressable>
          )}
          <Pressable onPress={openEdit} hitSlop={8} style={[styles.linkRow, styles.contributeRow]}>
            <Text style={styles.link}>Suggest a correction</Text>
            <Arrow length={18} />
          </Pressable>
        </View>
      </Animated.ScrollView>
      </ScrollClock>

      <CorrectionSheet
        visible={editOpen}
        landmark={landmark}
        fields={editFields}
        note={editNote}
        sending={editSending}
        sent={editSent}
        onChangeField={(k, v) => setEditFields((f) => ({ ...f, [k]: v }))}
        onChangeNote={setEditNote}
        onCancel={() => setEditOpen(false)}
        onSend={sendEdit}
      />

      <PhotoViewer photos={gallery} index={viewerAt} onClose={() => setViewerAt(null)} />
    </EntryPage>
  );
}

/** A correction sheet: a loose slip slid up over the page. */
function CorrectionSheet({
  visible,
  landmark,
  fields,
  note,
  sending,
  sent,
  onChangeField,
  onChangeNote,
  onCancel,
  onSend,
}: {
  visible: boolean;
  landmark: Landmark;
  fields: Record<string, string>;
  note: string;
  sending: boolean;
  sent: boolean;
  onChangeField: (key: string, value: string) => void;
  onChangeNote: (value: string) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <PaperGrain />
          <Bar />
          <Text style={[TYPE.kicker, styles.kicker]}>A correction</Text>
          <Text style={styles.sheetTitle}>{landmark.name}</Text>
          <Text style={styles.sheetNote}>Fill in only what should change. Every correction is read by the editors.</Text>
          <ScrollView style={styles.sheetFields} keyboardShouldPersistTaps="handled">
            {EDITABLE_FIELDS.map((f) => (
              <View key={f.key} style={styles.sheetField}>
                <Text style={TYPE.label}>{f.label}</Text>
                <TextInput
                  value={fields[f.key] ?? ""}
                  onChangeText={(t) => onChangeField(f.key, t)}
                  placeholder={String(landmark[f.key] ?? "")}
                  placeholderTextColor={INK.faded}
                  multiline={f.multiline}
                  style={[styles.sheetInput, f.multiline && styles.sheetInputMulti]}
                />
                <Rule color={INK.charcoal} weight={1} />
              </View>
            ))}
            <View style={styles.sheetField}>
              <Text style={TYPE.label}>Why the change</Text>
              <TextInput
                value={note}
                onChangeText={onChangeNote}
                placeholder="e.g. the architect's name is misspelt"
                placeholderTextColor={INK.faded}
                style={styles.sheetInput}
              />
              <Rule color={INK.charcoal} weight={1} />
            </View>
          </ScrollView>
          <View style={styles.sheetActions}>
            <Pressable onPress={onCancel} hitSlop={10} disabled={sending}>
              <Text style={[styles.link, { color: INK.sepia }]}>Cancel</Text>
            </Pressable>
            {sent ? (
              <Text style={styles.link}>Received — thank you</Text>
            ) : sending ? (
              <ActivityIndicator color={INK.blue} />
            ) : (
              <Pressable onPress={onSend} style={({ pressed }) => [styles.solidButton, pressed && { opacity: 0.8 }]}>
                <Text style={styles.solidButtonText}>Send to the editors</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  missing: {
    padding: MARGIN.outer,
    paddingTop: 60,
  },
  plate: {
    paddingTop: 12,
    paddingHorizontal: MARGIN.outer,
  },
  block: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 28,
  },
  kicker: {
    marginTop: 12,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.3,
    color: INK.charcoal,
    marginTop: 6,
  },
  visited: {
    marginTop: 16,
  },
  watchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  watchEye: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: INK.vermilion,
  },
  watchEyeOutline: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.2,
    borderColor: INK.sepia,
  },
  watchText: {
    flexShrink: 1,
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: INK.vermilion,
  },
  address: {
    fontFamily: FONT.regular,
    fontSize: 15,
    color: INK.sepia,
    marginTop: 8,
  },
  table: {
    borderTopWidth: 1.5,
    borderTopColor: INK.blue,
    marginHorizontal: MARGIN.outer,
    paddingHorizontal: 0,
  },
  particular: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 11,
  },
  particularLabel: {
    flexShrink: 0,
  },
  particularValue: {
    flexShrink: 1,
    fontFamily: FONT.regular,
    fontSize: 15,
    color: INK.charcoal,
    textAlign: "right",
  },
  nr: {
    color: INK.vermilion,
  },
  architect: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
    marginTop: 34,
  },
  architectText: {
    flex: 1,
    paddingTop: 2,
  },
  architectName: {
    fontFamily: FONT.regular,
    fontSize: 20,
    lineHeight: 24,
    color: INK.charcoal,
    marginTop: 6,
  },
  architectYears: {
    marginTop: 4,
  },
  architectNote: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: INK.charcoal,
    marginTop: 10,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  bioLink: {
    marginTop: 10,
  },
  link: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.blue,
  },
  historyRule: {
    marginBottom: 18,
  },
  history: {
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 26,
    color: INK.charcoal,
  },
  leadIn: {
    fontFamily: FONT.medium,
    fontSize: 13,
    letterSpacing: 1.6,
    color: INK.blue,
  },
  subhead: {
    marginBottom: 10,
  },
  nearby: {
    paddingTop: 12,
  },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  nearbyName: {
    flexShrink: 1,
    fontFamily: FONT.regular,
    fontSize: 16,
    color: INK.charcoal,
  },
  nearbyMiles: {
    fontFamily: FONT.medium,
    fontSize: 11,
    letterSpacing: 1.2,
    color: INK.blue,
  },
  nearbyAddr: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: INK.sepia,
    marginTop: 2,
  },
  nearbyRule: {
    marginTop: 12,
  },
  contribute: {
    marginTop: 40,
  },
  contributeRow: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(28,22,16,0.35)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: PAPER.slip,
    paddingHorizontal: MARGIN.outer,
    paddingTop: 26,
    overflow: "hidden",
  },
  sheetTitle: {
    fontFamily: FONT.light,
    fontSize: 28,
    lineHeight: 32,
    color: INK.charcoal,
    marginTop: 6,
  },
  sheetNote: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: INK.sepia,
    marginTop: 8,
    marginBottom: 6,
  },
  sheetFields: {
    flexGrow: 0,
  },
  sheetField: {
    marginTop: 18,
  },
  sheetInput: {
    fontFamily: FONT.regular,
    fontSize: 16,
    color: INK.charcoal,
    paddingVertical: 8,
  },
  sheetInputMulti: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  sheetActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
  },
  solidButton: {
    backgroundColor: INK.blue,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  solidButtonText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: PAPER.cover,
  },
});

/** A visit is stamped on the spot: null if the reader is at the place, else a note saying why not. */
async function visitCheck(landmark: Landmark): Promise<string | null> {
  const fix = await whereYouAre();
  if (fix === "denied") return "A visit is stamped on the spot, and the guide can’t see where you are: allow it Location in Settings.";
  if (fix === "unavailable") return "The guide couldn’t find where you are just now. A visit is stamped on the spot.";
  const { at, unsure, metres } = placeCheck(fix, landmark);
  if (at) return null;
  if (unsure) return "Your position is too rough to tell just now. Try again in a moment, in the open.";
  return `You’re ${howFar(metres)} away. A visit is stamped on the spot.`;
}

/**
 * The watch toggle: “Watch this place,” in the guide's small capitals, with
 * a vermilion eye when set. Watching asks for location at the moment of
 * intent; denied, it holds as a bookmark. A watch six months unvisited is
 * asked after — kept, or let go — never renewed silently. A reader's fullest
 * case holds twenty watches; the twenty-first offers to let the oldest go.
 */
function WatchToggle({
  landmark,
  watch,
  oldest,
  onToggle,
  onRetire,
}: {
  landmark: Landmark;
  watch: Watch | undefined;
  /** The longest-standing watch, offered up when the case is full. */
  oldest: Watch | undefined;
  onToggle: () => Promise<"watching" | "removed" | "full" | "denied">;
  onRetire: (landmarkId: string) => Promise<void>;
}) {
  const live = watch && watch.status !== "retired";
  const lapsed = live && isLapsed(watch);
  const waiting = watch?.status === "fired";

  const settings = {
    text: "Open Settings",
    onPress: () => void Linking.openSettings(),
  };

  const press = async () => {
    // A bookmark asks first: the reader may want it to notify, not to go.
    if (live && !watch.notifying) {
      Alert.alert(
        "Kept as a bookmark",
        "To say when you're near, the guide needs your location set to Always and its notices allowed.",
        [{ text: "Not now", style: "cancel" }, settings, { text: "Stop watching", style: "destructive", onPress: () => void onToggle() }],
      );
      return;
    }
    const result = await onToggle();
    if (result === "full") {
      const name = oldest ? landmarks.find((l) => l.id === oldest.landmarkId)?.name : undefined;
      Alert.alert(
        "The case holds twenty",
        `A reader's fullest case holds twenty watches.${name ? ` Let ${name}, the longest watched, go to make room?` : ""}`,
        [
          { text: "Not now", style: "cancel" },
          ...(oldest && name
            ? [
                {
                  text: `Let ${name} go`,
                  onPress: async () => {
                    await onRetire(oldest.landmarkId);
                    await press();
                  },
                },
              ]
            : []),
        ],
      );
    } else if (result === "denied") {
      Alert.alert(
        "Kept as a bookmark",
        "To say when you're near, the guide needs your location set to Always and its notices allowed. Until then the place is kept here, in your copy.",
        [{ text: "Not now", style: "cancel" }, settings],
      );
    }
  };

  // “Still watching?” — asked on the page, never by notice. Keep, or let go.
  if (live && lapsed) {
    return (
      <View style={styles.watchRow}>
        <View style={styles.watchEye} />
        <Pressable
          onPress={() =>
            Alert.alert("Still watching?", `It's been half a year since you chose ${landmark.name}.`, [
              { text: "Let it go", style: "destructive", onPress: () => void onRetire(landmark.id) },
              { text: "Keep watching", style: "cancel" },
            ])
          }
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          <Text style={styles.watchText}>Still watching this place? · keep or let go</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={press}
      hitSlop={8}
      style={({ pressed }) => [styles.watchRow, pressed && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel={live ? `Watching ${landmark.name}` : `Watch ${landmark.name}`}
      accessibilityHint={live ? "Stops watching it" : "The guide will say when you're near it"}
    >
      {live ? <View style={styles.watchEye} /> : <View style={styles.watchEyeOutline} />}
      <Text style={[styles.watchText, !live && { color: INK.sepia }]}>
        {!live
          ? "Watch this place"
          : !watch.notifying
            ? "Kept as a bookmark · notices need Always location"
            : waiting
              ? "Watching · its notice went out — walk up and stamp it"
              : "Watching · the guide will say when you're near"}
      </Text>
    </Pressable>
  );
}
