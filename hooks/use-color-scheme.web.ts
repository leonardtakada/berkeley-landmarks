import { useThemeContext } from "@/lib/theme-provider";

/** Same as native: the book is always printed on its light stock. */
export function useColorScheme() {
  return useThemeContext().colorScheme;
}
