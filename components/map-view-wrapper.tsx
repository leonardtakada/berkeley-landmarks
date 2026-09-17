import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, Polygon, Region } from "react-native-maps";
import SuperCluster from "supercluster";

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RegionLike extends Coordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MarkerProps {
  coordinate: Coordinate;
  title?: string;
  description?: string;
  onPress?: () => void;
  onSelect?: () => void;
  pinColor?: string;
  tracksViewChanges?: boolean;
  tracksInfoWindowChanges?: boolean;
  children?: React.ReactNode;
}

interface PolylineProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
}

interface PolygonProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}

interface MapViewWrapperProps {
  style?: any;
  initialRegion?: RegionLike;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  region?: RegionLike | undefined;
  onPress?: () => void;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  mapType?: "standard" | "satellite" | "hybrid" | "terrain" | "mutedStandard";
  children?: React.ReactNode;
  /** Marker data for clustering (replaces children markers when provided) */
  clusterMarkers?: Array<{
    id: string;
    coordinate: Coordinate;
    pinColor?: string;
    onPress?: () => void;
  }>;
  clusterRadius?: number;
  clusterMaxZoom?: number;
}

export function MapMarker(props: MarkerProps) {
  const { title: _t, description: _d, ...rest } = props;
  return (
    <Marker
      {...rest}
      onSelect={props.onPress}
    />
  );
}

export function MapPolyline(props: PolylineProps) {
  return <Polyline {...props} />;
}

export function MapPolygon(props: PolygonProps) {
  return <Polygon coordinates={props.coordinates} strokeColor={props.strokeColor} strokeWidth={props.strokeWidth} fillColor={props.fillColor} />;
}

/** Convert map latitudeDelta to integer zoom level (approximate) */
function regionToZoom(region: RegionLike): number {
  return Math.round(Math.log2(360 / region.latitudeDelta));
}

const MapViewWrapper = forwardRef<any, MapViewWrapperProps>(
  ({ children, clusterMarkers, clusterRadius = 50, clusterMaxZoom = 17, ...props }, ref) => {
    const [currentRegion, setCurrentRegion] = useState<RegionLike | null>(null);
    const clusterEngine = useRef<SuperCluster>(
      new SuperCluster({ radius: clusterRadius, maxZoom: clusterMaxZoom })
    );

    // Index markers into supercluster
    const points = useMemo(() => {
      if (!clusterMarkers) return [];
      return clusterMarkers.map((m) => ({
        type: "Feature" as const,
        properties: {
          cluster: false,
          id: m.id,
          pinColor: m.pinColor,
          onPress: m.onPress,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [m.coordinate.longitude, m.coordinate.latitude],
        },
      }));
    }, [clusterMarkers]);

    useEffect(() => {
      if (points.length > 0) {
        clusterEngine.current.load(points);
      }
    }, [points]);

    // Get clusters for current viewport
    const clusters = useMemo(() => {
      if (!currentRegion || points.length === 0) return [];
      const { longitudeDelta, latitude, longitude } = currentRegion;
      const bounds: [number, number, number, number] = [
        longitude - longitudeDelta,
        latitude - longitudeDelta,
        longitude + longitudeDelta,
        latitude + longitudeDelta,
      ];
      const zoom = regionToZoom(currentRegion);
      return clusterEngine.current.getClusters(bounds, zoom);
    }, [currentRegion, points]);

    const handleRegionChangeComplete = useCallback((region: Region) => {
      setCurrentRegion(region as RegionLike);
    }, []);

    // If clustering is enabled and markers are provided, render clustered view
    if (clusterMarkers && clusterMarkers.length > 0) {
      return (
        <MapView
          ref={ref}
          {...props}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {/* Non-marker children (polygons, polylines) */}
          {React.Children.toArray(children).filter((child) => {
            if (!React.isValidElement(child)) return false;
            // Pass through everything except MapMarker
            return (child.type as any)?.name !== "MapMarker" && (child.type as any) !== MapMarker;
          })}

          {clusters.map((cluster) => {
            if (cluster.properties.cluster) {
              // Cluster bubble
              const [lng, lat] = cluster.geometry.coordinates;
              const count = cluster.properties.point_count;
              const size = count < 10 ? 36 : count < 50 ? 44 : 52;
              const bgColor = count < 10 ? "#7B8B6F" : count < 50 ? "#5D6B52" : "#3F4B36";
              return (
                <Marker
                  key={`cluster-${cluster.id}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.clusterBubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
                    <Text style={styles.clusterText}>
                      {count}
                    </Text>
                  </View>
                </Marker>
              );
            }
            // Individual marker
            const [lng, lat] = cluster.geometry.coordinates;
            return (
              <Marker
                key={cluster.properties.id}
                coordinate={{ latitude: lat, longitude: lng }}
                pinColor={cluster.properties.pinColor}
                tracksViewChanges={false}
                onSelect={cluster.properties.onPress}
              />
            );
          })}
        </MapView>
      );
    }

    // Default: pass through children as-is (no clustering)
    return (
      <MapView ref={ref} {...props}>
        {children}
      </MapView>
    );
  }
);

MapViewWrapper.displayName = "MapViewWrapper";

export default MapViewWrapper;

const styles = StyleSheet.create({
  clusterBubble: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
    }),
  },
  clusterText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
});
