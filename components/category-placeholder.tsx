import React from "react";
import { View, StyleSheet } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { LandmarkCategory } from "@/data/landmarks";

const CATEGORY_ICONS = {
  civic: "building.2.fill",
  residential: "house.fill",
  religious: "building.columns.fill",
  commercial: "storefront.fill",
  educational: "graduationcap.fill",
  cultural: "theatermasks.fill",
  historic_district: "building.2.crop.circle.fill",
  structure_of_merit: "flag.fill",
} as const;

interface CategoryPlaceholderProps {
  category: LandmarkCategory;
  color: string;
  size?: number;
  iconSize?: number;
  style?: any;
}

export function CategoryPlaceholder({
  category,
  color,
  size = 120,
  iconSize,
  style,
}: CategoryPlaceholderProps) {
  const resolvedIcon = iconSize ?? Math.round(size * 0.3);
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: color + "18",
          borderColor: color + "30",
          width: size,
          height: size,
          borderRadius: 6,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: color + "20",
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size * 0.25,
          },
        ]}
      >
        <IconSymbol
          name={CATEGORY_ICONS[category]}
          size={resolvedIcon}
          color={color}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
});
