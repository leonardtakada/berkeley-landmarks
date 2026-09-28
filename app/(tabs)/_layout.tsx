import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTabsWithTriggers } from "expo-router/ui";
import type { ScreenTrigger } from "expo-router/build/ui/common";

import { BookPages } from "@/components/book-pages";
import { BookmarkRibbons } from "@/components/bookmark-ribbons";
import { PAPER } from "@/constants/book";

/**
 * The book: cover, then three sections reached by the ribbons at its head.
 * Order here is page order — turning to a later section turns forward.
 */
const TRIGGERS: ScreenTrigger[] = [
  { type: "internal", name: "index", href: "/" },
  { type: "internal", name: "tours", href: "/tours" },
  { type: "internal", name: "registry", href: "/registry" },
  { type: "internal", name: "profile", href: "/profile" },
];

export default function BookLayout() {
  const { state, descriptors, navigation, NavigationContent } = useTabsWithTriggers({
    triggers: TRIGGERS,
  });
  const [turning, setTurning] = useState(false);
  const focused = state.routes[state.index].name;

  return (
    <NavigationContent>
      <View style={styles.book}>
        <BookPages
          routes={state.routes}
          index={state.index}
          order={TRIGGERS.map((t) => t.name)}
          descriptors={descriptors}
          onTurningChange={setTurning}
        />
        <BookmarkRibbons
          focused={focused}
          onSelect={(name) => {
            // One leaf at a time: a page mid-turn can't be grabbed again.
            if (!turning) navigation.navigate(name);
          }}
        />
      </View>
    </NavigationContent>
  );
}

const styles = StyleSheet.create({
  book: {
    flex: 1,
    backgroundColor: PAPER.shade,
  },
});
