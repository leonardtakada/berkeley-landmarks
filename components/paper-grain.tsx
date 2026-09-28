import { StyleSheet, View } from "react-native";

import { TiledTexture } from "@/components/tiled-texture";
import { PAPER } from "@/constants/book";

const STOCK = require("@/assets/textures/paper-stock.png");

/**
 * The tooth of smooth uncoated stock (scripts/paper-stock.mjs). Quiet by
 * design — felt more than seen. Drop it as the first child of a page.
 */
export function PaperGrain({ opacity = 1 }: { opacity?: number }) {
  return <TiledTexture source={STOCK} opacity={opacity} />;
}

/** A full sheet of stock: flat paper colour and its tooth. */
export function PaperSheet({ stock = "page" }: { stock?: "cover" | "page" }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: PAPER[stock] }]}>
      <PaperGrain />
    </View>
  );
}
