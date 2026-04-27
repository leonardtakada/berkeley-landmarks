import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { landmarks, CATEGORY_COLORS, CATEGORY_LABELS } from "@/data/landmarks";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function LandmarkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const landmark = landmarks.find((l) => l.id === id);

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
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="arrow.left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {landmark.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Banner */}
        <View style={[styles.heroBanner, { backgroundColor: catColor + '18' }]}>
          <View style={[styles.categoryBadge, { backgroundColor: catColor }]}>
            <Text style={styles.categoryText}>{CATEGORY_LABELS[landmark.category]}</Text>
          </View>
          <Text style={[styles.heroName, { color: colors.foreground }]}>{landmark.name}</Text>
          <View style={styles.heroMeta}>
            <IconSymbol name="mappin.and.ellipse" size={14} color={colors.muted} />
            <Text style={[styles.heroAddress, { color: colors.muted }]}>{landmark.address}, Berkeley, CA</Text>
          </View>
        </View>

        {/* Quick Info Cards */}
        <View style={styles.infoGrid}>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Architect</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{landmark.architect}</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Year Built</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{landmark.yearBuilt}</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Style</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{landmark.style}</Text>
          </View>
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Landmark #</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{landmark.landmarkNumber}</Text>
          </View>
        </View>

        {/* Status Badges */}
        <View style={styles.badgeRow}>
          {landmark.nationalRegister && (
            <View style={[styles.statusBadge, { backgroundColor: '#2D6A4F22' }]}>
              <IconSymbol name="star.fill" size={14} color="#2D6A4F" />
              <Text style={[styles.statusText, { color: '#2D6A4F' }]}>National Register</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: catColor + '22' }]}>
            <IconSymbol name="mappin.and.ellipse" size={14} color={catColor} />
            <Text style={[styles.statusText, { color: catColor }]}>{landmark.neighborhood}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>{landmark.description}</Text>
        </View>

        {/* Nearby Landmarks */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Nearby Landmarks</Text>
          {landmarks
            .filter((l) => l.id !== landmark.id)
            .sort((a, b) => {
              const distA = Math.sqrt(
                Math.pow(a.latitude - landmark.latitude, 2) + Math.pow(a.longitude - landmark.longitude, 2)
              );
              const distB = Math.sqrt(
                Math.pow(b.latitude - landmark.latitude, 2) + Math.pow(b.longitude - landmark.longitude, 2)
              );
              return distA - distB;
            })
            .slice(0, 4)
            .map((nearby) => (
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 8,
  },
  scrollContent: { paddingBottom: 20 },
  heroBanner: {
    padding: 24,
    paddingTop: 20,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
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
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32,
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
    borderRadius: 12,
    borderWidth: 1,
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
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
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
});
