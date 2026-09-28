import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Annotation, Arrow, Bar, Rule } from "@/components/print";
import { ScreenContainer } from "@/components/screen-container";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { useAuth } from "@/hooks/use-auth";
import { pickPhotos, type PreparedPhoto } from "@/lib/photo-prep";
import { trpc } from "@/lib/trpc";
import { MAX_PROPOSAL_PHOTOS, proposalError } from "@/shared/proposals";

type Field = "name" | "address" | "why" | "architect" | "yearBuilt" | "style";

/**
 * Proposing a place for the guide: a signed-in reader names a building or
 * place of interest, says why it belongs, and may add a few photographs.
 * The proposal goes to the editors.
 */
export default function ProposeScreen() {
  const router = useRouter();
  const { user, loading } = useAuth({ autoFetch: true });
  const submit = trpc.proposals.submit.useMutation();

  const [fields, setFields] = useState<Record<Field, string>>({
    name: "",
    address: "",
    why: "",
    architect: "",
    yearBuilt: "",
    style: "",
  });
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: Field) => (v: string) => setFields((f) => ({ ...f, [k]: v }));

  const addPhotos = async () => {
    setPicking(true);
    try {
      const more = await pickPhotos(MAX_PROPOSAL_PHOTOS - photos.length);
      setPhotos((p) => [...p, ...more].slice(0, MAX_PROPOSAL_PHOTOS));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open your photographs.");
    } finally {
      setPicking(false);
    }
  };

  const send = async () => {
    const input = {
      ...fields,
      photos: photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
    };
    const problem = proposalError(input);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      await submit.mutateAsync(input);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the proposal. Try again.");
    }
  };

  return (
    <ScreenContainer variant="page" edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Bar />
          <Text style={[TYPE.kicker, styles.kicker]}>Propose a landmark</Text>
          <Text style={styles.title}>A place for the guide</Text>

          {loading ? (
            <ActivityIndicator color={INK.blue} style={styles.gap} />
          ) : !user ? (
            <>
              <Text style={styles.note}>
                Proposals come from registered readers. Sign in, and you can send the editors a building or place
                you think belongs in the guide.
              </Text>
              <SolidButton label="Sign in" onPress={() => router.push("/login")} />
            </>
          ) : sent ? (
            <>
              <Text style={styles.note}>
                Thank you. {fields.name.trim()} is with the editors, who read every proposal before a place goes into
                the guide.
              </Text>
              <SolidButton label="Done" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Text style={styles.note}>
                Know a building or place of interest that isn&apos;t in the guide? Tell the editors what it is,
                where to find it, and why it belongs.
              </Text>

              <Entry label="Name" value={fields.name} onChange={set("name")} placeholder="The building or place" />
              <Entry
                label="Address"
                value={fields.address}
                onChange={set("address")}
                placeholder="Street address, or where to find it"
              />
              <Entry
                label="Why it belongs"
                value={fields.why}
                onChange={set("why")}
                placeholder="Its history, its architect, what makes it worth a walk"
                multiline
              />

              <Text style={[TYPE.label, styles.optional]}>If you know</Text>
              <Entry label="Architect" value={fields.architect} onChange={set("architect")} />
              <View style={styles.pair}>
                <View style={styles.pairItem}>
                  <Entry label="Built" value={fields.yearBuilt} onChange={set("yearBuilt")} placeholder="Year" />
                </View>
                <View style={styles.pairItem}>
                  <Entry label="Style" value={fields.style} onChange={set("style")} />
                </View>
              </View>

              {/* Photographs */}
              <View style={styles.photosHead}>
                <Text style={TYPE.label}>Photographs</Text>
                <Text style={TYPE.label}>
                  {photos.length} / {MAX_PROPOSAL_PHOTOS}
                </Text>
              </View>
              <Rule color={INK.charcoal} weight={1} />
              <View style={styles.thumbs}>
                {photos.map((p, i) => (
                  <View key={p.uri} style={styles.thumb}>
                    <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} />
                    <Pressable
                      onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                      style={styles.remove}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photograph ${i + 1}`}
                    >
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PROPOSAL_PHOTOS ? (
                  <Pressable
                    onPress={addPhotos}
                    disabled={picking}
                    style={({ pressed }) => [styles.thumb, styles.addThumb, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Add photographs"
                  >
                    {picking ? <ActivityIndicator color={INK.blue} /> : <Text style={styles.addPlus}>+</Text>}
                  </Pressable>
                ) : null}
              </View>
              <Annotation style={styles.hint}>Photographs you took yourself, please.</Annotation>

              <SolidButton
                label={submit.isPending ? "Sending…" : "Send to the editors"}
                onPress={send}
                disabled={submit.isPending || picking}
                arrow
              />
              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

/** A ruled line to write on, labelled in tracked capitals. */
function Entry({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.entry}>
      <Text style={TYPE.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={INK.faded}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMulti]}
        accessibilityLabel={label}
      />
      <Rule color={INK.charcoal} weight={1} />
    </View>
  );
}

/** A solid block of blue ink with the action set in tracked capitals. */
function SolidButton({
  label,
  onPress,
  disabled,
  arrow,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.solid, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.solidText}>{label}</Text>
      {arrow ? <Arrow length={22} color={PAPER.cover} /> : null}
    </Pressable>
  );
}

const THUMB = 72;

const styles = StyleSheet.create({
  header: {
    alignItems: "flex-end",
    paddingHorizontal: MARGIN.outer,
    paddingTop: 8,
    paddingBottom: 10,
  },
  closeText: {
    ...TYPE.label,
    color: INK.blue,
  },
  page: {
    paddingHorizontal: MARGIN.outer,
    paddingTop: 8,
    paddingBottom: 48,
  },
  kicker: {
    marginTop: 12,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 32,
    lineHeight: 36,
    color: INK.charcoal,
    marginTop: 6,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: INK.sepia,
    marginTop: 10,
  },
  gap: {
    marginTop: 30,
  },
  entry: {
    marginTop: 22,
  },
  input: {
    fontFamily: FONT.regular,
    fontSize: 17,
    color: INK.charcoal,
    paddingVertical: 8,
  },
  inputMulti: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  optional: {
    marginTop: 34,
    color: INK.blue,
  },
  pair: {
    flexDirection: "row",
    gap: 18,
  },
  pairItem: {
    flex: 1,
  },
  photosHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 34,
    marginBottom: 8,
  },
  thumbs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    backgroundColor: INK.blueTint,
    overflow: "hidden",
  },
  addThumb: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: INK.blue,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  addPlus: {
    fontFamily: FONT.light,
    fontSize: 32,
    color: INK.blue,
  },
  remove: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    backgroundColor: INK.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 18,
    color: PAPER.cover,
  },
  hint: {
    marginTop: 12,
  },
  solid: {
    marginTop: 30,
    backgroundColor: INK.blue,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  solidText: {
    fontFamily: FONT.medium,
    fontSize: 12.5,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: PAPER.cover,
  },
  error: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: INK.vermilion,
    marginTop: 18,
  },
});
