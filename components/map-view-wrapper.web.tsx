import React, { forwardRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Region extends Coordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MarkerProps {
  coordinate: Coordinate;
  title?: string;
  description?: string;
  onPress?: () => void;
  pinColor?: string;
  children?: React.ReactNode;
}

interface PolylineProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
}

interface MapViewWrapperProps {
  style?: any;
  initialRegion?: Region;
  onPress?: () => void;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  mapType?: string;
  children?: React.ReactNode;
}

export function MapMarker(_props: MarkerProps) {
  return null;
}

export function MapPolyline(_props: PolylineProps) {
  return null;
}

function WebMapFallback({
  children,
  style,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const colors = useColors();

  const markers: MarkerProps[] = [];
  React.Children.forEach(children, (child: any) => {
    if (child && child.props && child.props.coordinate) {
      markers.push(child.props);
    }
  });

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.mapPlaceholder, { backgroundColor: '#F7F3EC' }]}>
        <View style={styles.mapContent}>
          <View style={[styles.mapHeader, { backgroundColor: '#3D6B5C' }]}>
            <IconSymbol name="map.fill" size={20} color="#FFFFFF" />
            <Text style={styles.mapHeaderText}>Berkeley, California</Text>
          </View>

          <View style={styles.mapGrid}>
            {markers.slice(0, 50).map((marker, idx) => {
              const normLat = ((marker.coordinate.latitude - 37.85) / 0.04) * 100;
              const normLng = ((marker.coordinate.longitude + 122.30) / 0.07) * 100;
              return (
                <Pressable
                  key={idx}
                  onPress={marker.onPress}
                  style={[
                    styles.mapDot,
                    {
                      backgroundColor: marker.pinColor || colors.primary,
                      top: `${Math.max(5, Math.min(90, 100 - normLat))}%`,
                      left: `${Math.max(5, Math.min(90, normLng))}%`,
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={[styles.mapFooter, { backgroundColor: colors.surface }]}>
            <IconSymbol name="info.circle.fill" size={14} color={colors.muted} />
            <Text style={[styles.mapFooterText, { color: colors.muted }]}>
              Open in Expo Go on your device for the full interactive map
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const MapViewWrapper = forwardRef<any, MapViewWrapperProps>(
  ({ children, ...props }, _ref) => {
    return (
      <WebMapFallback style={props.style} onPress={props.onPress}>
        {children}
      </WebMapFallback>
    );
  }
);

MapViewWrapper.displayName = "MapViewWrapper";

export default MapViewWrapper;

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapPlaceholder: { flex: 1 },
  mapContent: { flex: 1 },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  mapHeaderText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  mapGrid: {
    flex: 1,
    position: "relative",
  },
  mapDot: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  mapFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  mapFooterText: {
    fontSize: 12,
    textAlign: "center",
  },
});
