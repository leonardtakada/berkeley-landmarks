import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import SuperCluster from "supercluster";
import { getCachedTile, putCachedTile, prefetchBerkeleyTiles } from "@/lib/tile-cache.web";

// Leaflet touches `window` at import time — lazy-require inside effects so static rendering works.
const getLeaflet = (): typeof import("leaflet") => require("leaflet");

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
  pinColor?: string;
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

interface ClusterMarkerData {
  id: string;
  coordinate: Coordinate;
  pinColor?: string;
  onPress?: () => void;
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
  mapType?: string;
  children?: React.ReactNode;
  clusterMarkers?: ClusterMarkerData[];
  clusterRadius?: number;
  clusterMaxZoom?: number;
}

export function MapMarker(_props: MarkerProps) {
  return null;
}

export function MapPolyline(_props: PolylineProps) {
  return null;
}

export function MapPolygon(_props: PolygonProps) {
  return null;
}

function regionToZoom(region: RegionLike): number {
  return Math.max(1, Math.round(Math.log2(360 / region.latitudeDelta)));
}

/** Split a coordinate ring into rings wherever consecutive points jump far apart (hole encoding). */
function splitRings(coords: Coordinate[]): Coordinate[][] {
  const rings: Coordinate[][] = [];
  let current: Coordinate[] = [];
  for (const c of coords) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const d = Math.abs(c.latitude - prev.latitude) + Math.abs(c.longitude - prev.longitude);
      if (d > 0.5) {
        rings.push(current);
        current = [];
      }
    }
    current.push(c);
  }
  if (current.length > 0) rings.push(current);
  return rings;
}

function toLatLng(c: Coordinate): [number, number] {
  return [c.latitude, c.longitude];
}

/** Darken a hex color for marker borders (pencil outline feel). */
function darken(hex: string, amount = 0.45): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((ch) => ch + ch).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/**
 * Tile layer that reads/writes an IndexedDB cache: cached tiles render from
 * blob URLs (offline-friendly), fresh tiles are stored after first view.
 */
function makeCachedTileLayer(L: typeof import("leaflet")): any {
  return (L.TileLayer as any).extend({
    createTile(this: any, coords: { x: number; y: number; z: number }, done: (err?: unknown, tile?: HTMLElement) => void) {
      const tile = document.createElement("img");
      const url: string = this.getTileUrl(coords);
      getCachedTile(coords.z, coords.x, coords.y).then((blob) => {
        if (blob) {
          tile.src = URL.createObjectURL(blob);
          done(null, tile);
          return;
        }
        tile.onload = () => {
          done(null, tile);
          fetch(url)
            .then((r) => (r.ok ? r.blob() : null))
            .then((b) => {
              if (b) putCachedTile(coords.z, coords.x, coords.y, b);
            })
            .catch(() => {});
        };
        tile.onerror = (e) => done(e, tile);
        tile.src = url;
      });
      return tile;
    },
  });
}

const WebMap = forwardRef<any, MapViewWrapperProps>(function WebMap(
  {
    style,
    initialRegion,
    minZoomLevel,
    maxZoomLevel,
    onPress,
    clusterMarkers,
    clusterRadius = 50,
    clusterMaxZoom = 17,
    children,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayLayer = useRef<L.LayerGroup | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);

  // Extract overlay geometry from declarative children
  const overlays = useMemo(() => {
    const polys: PolylineProps[] = [];
    const shapes: PolygonProps[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child || !child.props) return;
      const p = child.props;
      if (p.coordinates && p.coordinates.length > 1) {
        if ("strokeColor" in p && "fillColor" in p) shapes.push(p);
        else polys.push(p);
      }
    });
    return { polys, shapes };
  }, [children]);
  const overlayKey = useMemo(
    () => JSON.stringify(overlays),
    [overlays]
  );

  const markerData = useMemo(() => clusterMarkers ?? [], [clusterMarkers]);
  const markerKey = useMemo(
    () => JSON.stringify(markerData.map((m) => [m.id, m.pinColor, m.coordinate.latitude, m.coordinate.longitude])),
    [markerData]
  );

  const pressRef = useRef(onPress);
  pressRef.current = onPress;

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = getLeaflet();
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      minZoom: minZoomLevel ?? 11,
      maxZoom: maxZoomLevel ?? 19,
      zoomSnap: 0.5,
    });
    mapRef.current = map;

    new (makeCachedTileLayer(L))("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Warm the offline cache for the Berkeley bbox (low zooms, gentle pace).
    setTimeout(() => {
      prefetchBerkeleyTiles();
    }, 2000);

    // Warm, printed-map tint — subtle sepia on the tile pane only
    const tilePane = map.getPane("tilePane");
    if (tilePane) tilePane.style.filter = "sepia(0.32) saturate(0.55) brightness(1.06) contrast(0.92)";

    overlayLayer.current = L.layerGroup().addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);

    if (initialRegion) {
      map.setView(
        [initialRegion.latitude, initialRegion.longitude],
        regionToZoom(initialRegion)
      );
    }

    map.on("click", () => pressRef.current?.());

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply view when initialRegion identity changes (remount-like behavior)
  useEffect(() => {
    if (mapRef.current && initialRegion) {
      mapRef.current.setView(
        [initialRegion.latitude, initialRegion.longitude],
        regionToZoom(initialRegion),
        { animate: true }
      );
    }
  }, [initialRegion]);

  // Draw static overlays (boundary, dimming, tour route)
  useEffect(() => {
    const layer = overlayLayer.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    const L = getLeaflet();
    layer.clearLayers();

    for (const shape of overlays.shapes) {
      const rings = splitRings(shape.coordinates);
      if (rings.length > 1) {
        // Outer ring + holes (dimming overlay)
        L.polygon(rings.map((r) => r.map(toLatLng)), {
          stroke: false,
          fillColor: shape.fillColor ?? "rgba(26,26,26,0.35)",
          fillOpacity: 1,
          interactive: false,
        }).addTo(layer);
      } else {
        L.polygon(rings[0].map(toLatLng), {
          color: shape.strokeColor ?? "#7B8B6F",
          weight: shape.strokeWidth ?? 2,
          opacity: 0.55,
          fillColor: shape.fillColor ?? "rgba(123,139,111,0.06)",
          fillOpacity: 0.5,
          lineJoin: "round",
          interactive: false,
        }).addTo(layer);
      }
    }

    for (const poly of overlays.polys) {
      const dashed = poly.lineDashPattern && poly.lineDashPattern.length > 1;
      L.polyline(poly.coordinates.map(toLatLng), {
        color: poly.strokeColor ?? "#3D6B5C",
        weight: poly.strokeWidth ?? 3,
        opacity: 0.85,
        // Dotted trail marking when a dash pattern is requested
        dashArray: dashed ? poly.lineDashPattern!.join(" ") : undefined,
        lineCap: dashed ? "round" : "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(layer);
    }

    // When a tour route is present, frame it (route is the only polyline child)
    if (overlays.polys.length > 0) {
      const all = overlays.polys.flatMap((p) => p.coordinates.map(toLatLng));
      if (all.length > 1) {
        map.fitBounds(L.latLngBounds(all), {
          paddingTopLeft: L.point(70, 110),
          paddingBottomRight: L.point(70, 130),
          animate: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  // Clustered landmark markers
  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayer.current;
    if (!map || !layer) return;
    const L = getLeaflet();

    const index = new SuperCluster({
      radius: clusterRadius,
      maxZoom: clusterMaxZoom,
    });
    index.load(
      markerData.map((m) => ({
        type: "Feature" as const,
        properties: { id: m.id, pinColor: m.pinColor ?? "#3D6B5C" },
        geometry: { type: "Point" as const, coordinates: [m.coordinate.longitude, m.coordinate.latitude] },
      }))
    );
    const handlers = new Map<string, () => void>();
    markerData.forEach((m) => handlers.set(m.id, () => m.onPress?.()));

    const render = () => {
      layer.clearLayers();
      const bounds = map.getBounds();
      const clusters = index.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        Math.round(map.getZoom())
      );
      for (const c of clusters) {
        const props = c.properties as any;
        if (props.cluster) {
          const count = props.point_count;
          const size = Math.min(40, 24 + Math.log2(count) * 5);
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(61,107,92,0.92);border:1px solid rgba(42,37,32,0.35);color:#F7F3EC;display:flex;align-items:center;justify-content:center;font-size:12px;font-family:Source Serif 4, Georgia, serif;">${count}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          L.marker([c.geometry.coordinates[1], c.geometry.coordinates[0]], {
            icon,
          })
            .on("click", () => {
              const target = Math.max(
                map.getZoom() + 2,
                index.getClusterExpansionZoom(props.cluster_id)
              );
              map.flyTo([c.geometry.coordinates[1], c.geometry.coordinates[0]], target, {
                duration: 0.6,
              });
            })
            .addTo(layer);
        } else {
          const color = props.pinColor;
          const cm = L.circleMarker([c.geometry.coordinates[1], c.geometry.coordinates[0]], {
            radius: 6,
            fillColor: color,
            fillOpacity: 0.95,
            color: darken(color),
            weight: 1.25,
            className: "bl-marker",
          });
          cm.on("click", (e: LeafletNS.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e as unknown as Event);
            handlers.get(props.id)?.();
          });
          cm.addTo(layer);
        }
      }
    };

    render();
    map.on("moveend zoomend", render);
    return () => {
      map.off("moveend zoomend", render);
      layer.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, clusterRadius, clusterMaxZoom]);

  return <div ref={containerRef} style={{ flex: 1, width: "100%", height: "100%", ...(style as object) }} />;
});

const MapViewWrapper = forwardRef<any, MapViewWrapperProps>((props, ref) => (
  <WebMap ref={ref} {...props} />
));

MapViewWrapper.displayName = "MapViewWrapper";

export default MapViewWrapper;
