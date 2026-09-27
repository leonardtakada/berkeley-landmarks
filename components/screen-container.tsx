import { Image, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

/**
 * Which page stock this screen is printed on.
 * - "cover": the book cover — cream stock (`background`, #F2F0E6).
 * - "page": interior pages — warm paper white (`pageBackground`).
 */
export type PageStock = "cover" | "page";

export interface ScreenContainerProps extends ViewProps {
  /** Page stock. Interior screens should use "page". Defaults to "cover". */
  variant?: PageStock;
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * The outer View extends to full screen (including status bar area) with the background color,
 * while the inner SafeAreaView ensures content is within safe bounds.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer className="p-4">
 *   <Text className="text-2xl font-bold text-foreground">
 *     Welcome
 *   </Text>
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  variant = "cover",
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  return (
    <View
      className={cn(
        "flex-1",
        variant === "page" ? "bg-pageBackground" : "bg-background",
        containerClassName
      )}
      {...props}
    >
      {/* Paper grain — faint book-page texture over every screen */}
      <Image
        source={require("@/assets/textures/paper-grain.png")}
        style={styles.grain}
        resizeMode="repeat"
      />
      <SafeAreaView
        edges={edges}
        className={cn("flex-1", safeAreaClassName)}
        style={style}
      >
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  grain: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
    opacity: 0.045,
    pointerEvents: "none",
  },
});
