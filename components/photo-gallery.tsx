import React, { useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TippedInPlate } from "@/components/tipped-in-plate";
import { FONT, INK, PAPER, TYPE } from "@/constants/book";
import { photoSource } from "@/lib/photo-source";

export interface GalleryPhoto {
  uri: string;
  caption?: string;
  /** Who took it and on what licence. */
  credit?: string;
}

const THUMB_W = 150;
const THUMB_H = 112;
const OFFSET = 5;

/**
 * A landmark's photographs as a strip of small plates, numbered as figures,
 * that scrolls sideways. A tap opens the photograph full size.
 */
export function PhotoGallery({ photos, onOpen }: { photos: GalleryPhoto[]; onOpen: (index: number) => void }) {
  return (
    <View>
      <View style={styles.head}>
        <Text style={TYPE.label}>Photographs</Text>
        <Text style={TYPE.label}>{photos.length}</Text>
      </View>
      <FlatList
        horizontal
        data={photos}
        keyExtractor={(p, i) => `${i}-${p.uri}`}
        showsHorizontalScrollIndicator={false}
        snapToInterval={THUMB_W + OFFSET + 14}
        decelerationRate="fast"
        contentContainerStyle={styles.strip}
        renderItem={({ item, index }) => (
          <TippedInPlate
            source={photoSource(item.uri)}
            index={index + 1}
            caption={item.caption}
            width={THUMB_W}
            height={THUMB_H}
            offset={OFFSET}
            onPress={() => onOpen(index)}
          />
        )}
      />
    </View>
  );
}

/**
 * The photographs full size, in colour, over a dark ground: swipe between
 * them, tap to close.
 */
export function PhotoViewer({
  photos,
  index,
  onClose,
}: {
  photos: GalleryPhoto[];
  index: number | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [at, setAt] = useState(index ?? 0);
  // Opening on a photograph starts the count there.
  const [openedAt, setOpenedAt] = useState(index);
  if (index !== openedAt) {
    setOpenedAt(index);
    if (index != null) setAt(index);
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== at && i >= 0 && i < photos.length) setAt(i);
  };

  const shown = photos[at];
  return (
    <Modal visible={index != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        {index != null ? (
          <FlatList
            horizontal
            pagingEnabled
            data={photos}
            keyExtractor={(p, i) => `${i}-${p.uri}`}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            renderItem={({ item }) => (
              <Pressable onPress={onClose} style={{ width, height }} accessibilityLabel="Close the photograph">
                <Image source={photoSource(item.uri)} style={styles.viewerImage} resizeMode="contain" />
              </Pressable>
            )}
          />
        ) : null}
        <View style={[styles.viewerFoot, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} pointerEvents="none">
          {photos.length > 1 ? (
            <Text style={styles.count}>
              {at + 1} / {photos.length}
            </Text>
          ) : null}
          {shown?.caption ? <Text style={styles.viewerCaption}>{shown.caption}</Text> : null}
          {shown?.credit ? (
            <Text style={styles.credit} numberOfLines={2}>
              {shown.credit}
            </Text>
          ) : null}
          <Text style={[TYPE.label, styles.hint]}>Tap to close</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  strip: {
    gap: 14,
    paddingVertical: 2,
  },
  viewer: {
    flex: 1,
    backgroundColor: "rgba(20,18,16,0.96)",
  },
  viewerImage: {
    flex: 1,
    marginHorizontal: 12,
    marginVertical: 90,
  },
  viewerFoot: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 0,
    alignItems: "center",
  },
  count: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 2,
    color: PAPER.cover,
  },
  viewerCaption: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: PAPER.cover,
    marginTop: 6,
  },
  credit: {
    fontFamily: FONT.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: INK.faded,
    textAlign: "center",
    marginTop: 6,
  },
  hint: {
    marginTop: 12,
    color: INK.faded,
  },
});
