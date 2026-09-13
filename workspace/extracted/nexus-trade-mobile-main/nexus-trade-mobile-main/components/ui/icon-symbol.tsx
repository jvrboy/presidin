// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "chart.bar.fill": "bar-chart",
  "gearshape.fill": "settings",
  "arrow.clockwise": "refresh",
  "play.fill": "play-arrow",
  "pause.fill": "pause",
  "stop.fill": "stop",
  "bolt.fill": "bolt",
  "wifi": "wifi",
  "wifi.slash": "wifi-off",
  "shield.fill": "security",
  "arrow.up.right": "north-east",
  "arrow.down.right": "south-east",
  "link": "link",
  "checkmark.circle.fill": "check-circle",
  "exclamationmark.triangle.fill": "warning",
  "server.rack": "dns",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "insights": "insights",
  "analytics": "analytics",
  "trending.up": "trending-up",
  "trending.down": "trending-down",
  "candlestick": "candlestick-chart",
  "tune": "tune",
  "filter.list": "filter-list",
  "download": "download",
  "upload": "upload",
  "notifications": "notifications",
  "notifications.off": "notifications-off",
  "palette": "palette",
  "text.format": "format-size",
  "layers": "layers",
  "auto.graph": "auto-graph",
  "speedometer": "speed",
  "science": "science",
  "psychology": "psychology",
  "model.training": "model-training",
  "timeline": "timeline",
  "hub": "hub",
  "lock": "lock",
  "visibility": "visibility",
  "search": "search",
  "more": "more-horiz",
} as unknown as IconMapping;

export const ICON_CATALOG = [
  "insights", "analytics", "trending.up", "trending.down", "candlestick", "tune", "filter.list", "download", "upload", "notifications",
  "notifications.off", "palette", "text.format", "layers", "auto.graph", "speedometer", "science", "psychology", "model.training", "timeline",
  "hub", "lock", "visibility", "search", "more",
] as const;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
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
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
