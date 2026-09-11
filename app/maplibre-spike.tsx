/**
 * SPIKE-ONLY SCREEN (maplibre-spike branch): MapLibre GL native proof-of-concept.
 *
 * Renders the bundled Berkeley PMTiles (vector) with the paper-light /
 * paper-dark style JSONs. Requires a dev build (expo-dev-client / prebuild) —
 * this will NOT run in Expo Go because @maplibre/maplibre-react-native is native.
 *
 * PMTiles is loaded via the experimental `pmtiles://` file scheme supported by
 * recent maplibre-native (bundled asset is copied to the filesystem first).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, Stack } from "expo-router";
import MapLibreGL from "@maplibre/maplibre-react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { useColorScheme } from "react-native";
import { BERKELEY_CENTER } from "@/data/landmarks";

import paperLight from "@/assets/map/paper-light.json";
import paperDark from "@/assets/map/paper-dark.json";

// Silence telemetry/event-loop warnings from maplibre-native in dev.
MapLibreGL.setAccessToken(null);

type PaperStyle = typeof paperLight & { glyphs: string };

export default function MapLibreSpikeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const [pmtilesUri, setPmtilesUri] = useState<string | null>(null);
  const [status, setStatus] = useState("loading PMTiles…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const modules = [require("../assets/map/berkeley.pmtiles")];
        const [asset] = await Asset.loadAsync(modules);
        // Copy bundled asset into a real file so maplibre can mmap it.
        const dest = `${FileSystem.cacheDirectory}berkeley.pmtiles`;
        const info = await FileSystem.getInfoAsync(dest);
        if (!info.exists) {
          await FileSystem.copyAsync({ from: asset.localUri ?? asset.uri, to: dest });
        }
        if (!cancelled) {
          setPmtilesUri(`pmtiles://${dest}`);
          setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) setStatus(`pmtiles load failed: ${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const styleJSON = useMemo(() => {
    const base = (scheme === "dark" ? paperDark : paperLight) as PaperStyle;
    if (!pmtilesUri) return null;
    return {
      ...base,
      sources: {
        berkeley: { type: "vector", url: pmtilesUri },
      },
    } as any;
  }, [scheme, pmtilesUri]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "MapLibre Spike" }} />
        <Text style={styles.note}>
          MapLibre spike is native-only (iOS/Android dev build). See the GL JS
          validation page for the web proof.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "MapLibre Spike (paper)" }} />
      {styleJSON ? (
        <MapLibreGL.MapView style={styles.map} styleJSON={styleJSON} attributionEnabled={false}>
          <MapLibreGL.Camera
            centerCoordinate={[BERKELEY_CENTER.longitude, BERKELEY_CENTER.latitude]}
            zoomLevel={15}
            minZoomLevel={11}
            maxZoomLevel={17}
          />
        </MapLibreGL.MapView>
      ) : (
        <View style={styles.center}>
          <Text style={styles.note}>{status}</Text>
        </View>
      )}
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F3EC" },
  map: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  note: { color: "#5B5243", fontSize: 14, textAlign: "center" },
  back: { position: "absolute", top: 60, left: 16, backgroundColor: "#F7F3EC", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#C9BFA8" },
  backText: { color: "#5B5243" },
});
