import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { PaperSheet } from "@/components/paper-grain";
import { PAPER } from "@/constants/book";
import { cn } from "@/lib/utils";

/**
 * Which page stock this screen is printed on.
 * - "cover": the book cover — cream board (#F2F0E6).
 * - "page": interior leaves — warm paper white (#FAF6EC).
 */
export type PageStock = "cover" | "page";

export interface ScreenContainerProps extends ViewProps {
  /** Page stock. Interior screens should use "page". Defaults to "cover". */
  variant?: PageStock;
  /** SafeArea edges to apply. Defaults to ["top", "left", "right"]. */
  edges?: Edge[];
  /** Tailwind className for the content area. */
  className?: string;
  /** Additional className for the outer container (paper layer). */
  containerClassName?: string;
  /** Additional className for the SafeAreaView (content layer). */
  safeAreaClassName?: string;
}

/**
 * A full-bleed sheet of paper stock with safe-area-aware content on top.
 * The stock (colour, grain, gutter) runs under the status bar; content stays
 * inside the safe edges.
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
      className={cn("flex-1", containerClassName)}
      style={{ backgroundColor: PAPER[variant] }}
      {...props}
    >
      <PaperSheet stock={variant} />
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={style}>
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
