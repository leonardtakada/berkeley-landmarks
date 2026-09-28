import React, { useState } from "react";
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";

/**
 * A texture tile repeated to fill its parent. Lays the tiles out itself:
 * iOS `resizeMode="repeat"` tiles only the size an image first lays out at,
 * so a view that grows after mount ends up with an untextured margin.
 */
export function TiledTexture({
  source,
  tile = 256,
  opacity = 1,
}: {
  source: ImageSourcePropType;
  /** Tile size in points (the texture's @1x pixel size). */
  tile?: number;
  opacity?: number;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const cols = Math.ceil(size.w / tile);
  const rows = Math.ceil(size.h / tile);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, { opacity }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.ceil(width / tile) !== cols || Math.ceil(height / tile) !== rows) {
          setSize({ w: width, h: height });
        }
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <Image
          key={i}
          source={source}
          style={{ position: "absolute", left: (i % cols) * tile, top: Math.floor(i / cols) * tile, width: tile, height: tile }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});
