import { Tabs } from "expo-router";

import { BookmarkTabBar } from "@/components/bookmark-tab-bar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();

  return (
    <Tabs
      // The cover (index) reads as a closed front board — show it clean,
      // without the bookmark ribbons.
      tabBar={(props: any) =>
        props.state?.index === 0 ? null : <BookmarkTabBar {...props} />
      }
      screenOptions={{
        // The bookmark ribbons hang from the HEAD of the book, like
        // ribbons draped over the top edge of a closed guidebook.
        tabBarPosition: "top",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.5,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Landmarks",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={26}
              name={focused ? "building.columns.fill" : "building.columns"}
              color={color}
              weight="semibold"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tours"
        options={{
          title: "Tours",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="figure.walk" color={color} weight="medium" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Appendix",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={26}
              name={focused ? "person.crop.circle.fill" : "person.crop.circle"}
              color={color}
              weight="medium"
            />
          ),
        }}
      />
    </Tabs>
  );
}
