import React, { forwardRef } from "react";
import MapView, { Marker, Polyline, Polygon } from "react-native-maps";

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

interface MapViewWrapperProps {
  style?: any;
  initialRegion?: Region;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  region?: Region | undefined;
  onPress?: () => void;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  mapType?: "standard" | "satellite" | "hybrid" | "terrain" | "mutedStandard";
  children?: React.ReactNode;
}

export function MapMarker(props: MarkerProps) {
  // Omit title/description to prevent native callout.
  // Keep onPress — on iOS it works without title in react-native-maps 1.27+
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

interface PolygonProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}

export function MapPolygon(props: PolygonProps) {
  return <Polygon coordinates={props.coordinates} strokeColor={props.strokeColor} strokeWidth={props.strokeWidth} fillColor={props.fillColor} />;
}

const MapViewWrapper = forwardRef<any, MapViewWrapperProps>(
  ({ children, ...props }, ref) => {
    return (
      <MapView ref={ref} {...props}>
        {children}
      </MapView>
    );
  }
);

MapViewWrapper.displayName = "MapViewWrapper";

export default MapViewWrapper;
