import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState, useCallback } from "react";
import { ScrollView, Text, View, Pressable, StyleSheet, ActivityIndicator, Image, Modal, TextInput, Alert, FlatList, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { landmarks, CATEGORY_COLORS, CATEGORY_LABELS } from "@/data/landmarks";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CategoryPlaceholder } from "@/components/category-placeholder";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";

export default function LandmarkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const landmark = landmarks.find((l) => l.id === id);

  const { data: approvedPhotos } = trpc.photos.getForLandmark.useQuery(
    { landmarkId: id },
    { enabled: !!id }
  );
  const submitMutation = trpc.photos.submit.useMutation();

  const [uploading, setUploading] = useState(false);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const pickAndSubmit = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) return;

      const mime = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";

      setUploading(true);
      setUploadSuccess(false);

      await submitMutation.mutateAsync({
        landmarkId: id,
        photoBase64: asset.base64,
        mimeType: mime,
        caption: undefined,
      });

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Something went wrong");
    } finally {
      setUploading(false);
    }
  }, [id, submitMutation]);

  const nearbyLandmarks = useMemo(() => {
    if (!landmark) return [];
    return landmarks
      .filter((l) => l.id !== landmark.id)
      .map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        category: l.category,
        dist: Math.abs(l.latitude - landmark.latitude) + Math.abs(l.longitude - landmark.longitude),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4);
  }, [id]);

  if (!landmark) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.foreground }}>Landmark not found</Text>
      </View>
    );
  }

  const catColor = CATEGORY_COLORS[landmark.category];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="arrow.left" size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={[styles.headerTitle, { opacity: scrolledPastHero ? 1 : 0 }]} numberOfLines={1}>
            {landmark.name}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          const past = y > 150;
          if (past !== scrolledPastHero) setScrolledPastHero(past);
        }}
      >
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <LinearGradient
            colors={[catColor + '30', catColor + '08']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroGradient}
          >
            {landmark.photoUrl ? (
              <Image
                source={{
                  uri: landmark.photoUrl.startsWith("http")
                    ? landmark.photoUrl
                    : `${getApiBaseUrl()}${landmark.photoUrl}`,
                }}
                style={styles.heroImage}
                resizeMode="cover"
              />
            ) : (
              <CategoryPlaceholder
                category={landmark.category}
                color={catColor}
                size={140}
                iconSize={36}
                style={styles.heroPlaceholder}
              />
            )}
            <View style={[styles.categoryBadge, { backgroundColor: catColor }]}>
              <Text style={styles.categoryText}>{CATEGORY_LABELS[landmark.category]}</Text>
            </View>
            <Text style={[styles.heroName, { color: colors.foreground }]}>{landmark.name}</Text>
            <View style={styles.heroMeta}>
              <IconSymbol name="mappin.and.ellipse" size={14} color={colors.muted} />
              <Text style={[styles.heroAddress, { color: colors.muted }]}>{landmark.address}, Berkeley, CA</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Quick Info Cards */}
        <View style={styles.infoGrid}>
          {[
            { label: 'Architect', value: landmark.architect },
            { label: 'Year Built', value: landmark.yearBuilt },
            { label: 'Style', value: landmark.style },
            ...(landmark.landmarkNumber ? [{ label: 'Landmark #', value: landmark.landmarkNumber }] : []),
          ].map((info) => (
            <View key={info.label} style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>{info.label}</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{info.value}</Text>
            </View>
          ))}
        </View>

        {/* Status Badges */}
        <View style={styles.badgeRow}>
          {landmark.designationType && landmark.designationType !== 'Landmark' && (
            <View style={[styles.statusBadge, { backgroundColor: colors.primary + '22' }]}>
              <IconSymbol name="rosette" size={14} color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.primary }]}>{landmark.designationType}</Text>
            </View>
          )}
          {landmark.nationalRegister && (
            <View style={[styles.statusBadge, { backgroundColor: '#3D6B5C22' }]}>
              <IconSymbol name="star.fill" size={14} color="#3D6B5C" />
              <Text style={[styles.statusText, { color: '#3D6B5C' }]}>National Register</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: catColor + '22' }]}>
            <IconSymbol name="mappin.and.ellipse" size={14} color={catColor} />
            <Text style={[styles.statusText, { color: catColor }]}>{landmark.neighborhood}</Text>
          </View>
        </View>

        {/* Photo Gallery */}
        {(approvedPhotos && approvedPhotos.length > 0) && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Community Photos</Text>
            <FlatList
              horizontal
              data={approvedPhotos}
              keyExtractor={(p) => String(p.id)}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const baseUrl = getApiBaseUrl();
                const uri = item.photoUrl.startsWith("http") ? item.photoUrl : `${baseUrl}${item.photoUrl}`;
                return (
                  <Pressable onPress={() => setViewerUri(uri)}>
                    <Image source={{ uri }} style={styles.photoThumb} />
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
            />
          </View>
        )}

        {/* Add Photo Button */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          {uploadSuccess ? (
            <View style={[styles.addPhotoBtn, { backgroundColor: '#4CAF5022' }]}>
              <Text style={{ color: '#4CAF50', fontWeight: '600' }}>✓ Thank you! Your photo is pending review.</Text>
            </View>
          ) : uploading ? (
            <View style={[styles.addPhotoBtn, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="small" color={colors.foreground} />
              <Text style={{ marginLeft: 8, color: colors.muted }}>Uploading…</Text>
            </View>
          ) : (
            <Pressable
              onPress={pickAndSubmit}
              style={({ pressed }) => [styles.addPhotoBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="camera.fill" size={18} color={colors.foreground} />
              <Text style={{ marginLeft: 8, color: colors.foreground, fontWeight: '600' }}>Add a Photo</Text>
            </Pressable>
          )}
        </View>

        {/* Photo Viewer Modal */}
        <Modal visible={!!viewerUri} transparent animationType="fade">
          <Pressable style={styles.viewerOverlay} onPress={() => setViewerUri(null)}>
            {viewerUri && <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />}
          </Pressable>
        </Modal>

        {/* Description */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>About</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>
            <Text style={[styles.dropCap, { color: catColor }]}>{landmark.description.charAt(0)}</Text>
            {landmark.description.slice(1)}
          </Text>
        </View>

        {/* Nearby Landmarks */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Nearby Landmarks</Text>
          {nearbyLandmarks.map((nearby) => (
              <Pressable
                key={nearby.id}
                onPress={() => router.push(`/landmark/${nearby.id}`)}
                style={({ pressed }) => [
                  styles.nearbyItem,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.nearbyDot, { backgroundColor: CATEGORY_COLORS[nearby.category] }]} />
                <View style={styles.nearbyInfo}>
                  <Text style={[styles.nearbyName, { color: colors.foreground }]} numberOfLines={1}>
                    {nearby.name}
                  </Text>
                  <Text style={[styles.nearbyAddress, { color: colors.muted }]} numberOfLines={1}>
                    {nearby.address}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 8,
    color: "#FFFFFF",
  },
  scrollContent: { paddingBottom: 20 },
  heroBanner: {
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
    height: 240,
  },
  heroPlaceholder: {
    marginBottom: 16,
  },
  heroGradient: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 32,
    minHeight: 240,
    justifyContent: 'center',
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    marginBottom: 12,
  },
  categoryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroName: {
    fontSize: 30,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    lineHeight: 36,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroAddress: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 16,
  },
  infoCard: {
    width: "47%",
    padding: 14,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    // borderColor set dynamically
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    // borderColor set dynamically
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    marginBottom: 10,
  },
  dropCap: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: "600",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    paddingRight: 6,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
  },
  nearbyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  nearbyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  nearbyInfo: {
    flex: 1,
  },
  nearbyName: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  nearbyAddress: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: 10,
    backgroundColor: '#eee',
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    // borderColor set dynamically
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '90%',
    height: '80%',
    borderRadius: 12,
  },
});
