import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Partial<Record<string, ComponentProps<typeof MaterialIcons>["name"]>>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "map.fill": "map",
  "map": "map",
  "figure.walk": "directions-walk",
  "building.columns.fill": "account-balance",
  "building.columns": "account-balance",
  "location.fill": "my-location",
  "xmark": "close",
  "magnifyingglass": "search",
  "line.3.horizontal.decrease.circle": "filter-list",
  "arrow.left": "arrow-back",
  "info.circle.fill": "info",
  "mappin.and.ellipse": "place",
  "clock.fill": "schedule",
  "ruler.fill": "straighten",
  "star.fill": "star",
  "chevron.down": "keyboard-arrow-down",
  "chevron.up": "keyboard-arrow-up",
  "building.2.fill": "apartment",
  "storefront.fill": "storefront",
  "graduationcap.fill": "school",
  "theatermasks.fill": "theater-comedy",
  "building.2.crop.circle.fill": "business",
  "flag.fill": "flag",
  "rosette": "workspace-premium",
  "camera.fill": "photo-camera",
  "pencil": "edit",
  "arrow.up.arrow.down": "sort",
} satisfies IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={(MAPPING[name] ?? "help-outline") as ComponentProps<typeof MaterialIcons>["name"]} style={style} />;
}
