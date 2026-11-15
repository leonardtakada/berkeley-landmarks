import React, { useMemo } from "react";
import { GeoJSONSource, Images, Layer } from "@maplibre/maplibre-react-native";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

import { WALK_LABEL_IMAGES } from "@/components/walk-labels.generated";
import { INK } from "@/constants/book";
import { tours } from "@/data/tours";
import { isoLine, isoPoint } from "@/lib/iso-map";
import { WALK_LABEL_DOT, WALK_OUTLINES } from "@/lib/walk-outlines.generated";

/** Points across, at a zoom: a band that thickens as the map draws in. */
const byZoom = (...stops: number[]) => ["interpolate", ["linear"], ["zoom"], ...stops] as unknown as ExpressionSpecification;
const BAND = [12, 3, 14, 6, 16, 10, 18, 14];
/** A walk's ink: blue, or vermilion (lib/walk-outlines.generated.ts — walks that overlap most in different inks). */
const INKED = ["match", ["get", "ink"], 1, INK.vermilion, INK.blue] as unknown as ExpressionSpecification;

/**
 * The walks on the city map, before one is chosen: each walk's ground drawn
 * round (scripts/iso/walk-outlines.ts) — a fine line with a screened band
 * along its inside, in blue or vermilion so that where outlines cross each
 * can be followed, printed over the drawing — and its label, the
 * walk's travel label with its number and name, hung over the outline on a
 * fine line, over the landmarks' pins. A label pressed opens its walk. Where labels would
 * cover each other, the map shows the earlier walks'.
 */
export function WalkOutlines({
  iso,
  onPress,
  outlinesBefore,
  labelsOver,
  labelsBefore,
}: {
  iso: boolean;
  onPress: (tourId: string) => void;
  /** The layer the outlines go under (on the drawing, its walkers). */
  outlinesBefore?: string;
  /** The layer the labels go straight over (the landmarks' pins: the last of them)… */
  labelsOver?: string;
  /** …or else under (on the drawing, the reader's own mark). */
  labelsBefore?: string;
}) {
  const { outlines, labels } = useMemo(() => {
    const at = (lat: number, lon: number) => (iso ? isoPoint({ latitude: lat, longitude: lon }, 0) : [lon, lat]);
    const walks = tours.map((t, i) => ({ t, n: i + 1, w: WALK_OUTLINES[t.id] })).filter((x) => x.w);
    return {
      outlines: {
        type: "FeatureCollection" as const,
        features: walks.map(({ t, n, w }) => {
          const ring = [...w.outline, w.outline[0]].map(([latitude, longitude]) => ({ latitude, longitude }));
          return {
            type: "Feature" as const,
            properties: { id: t.id, n, ink: w.ink },
            geometry: {
              type: "LineString" as const,
              // On the drawing, following the terraces up and down.
              coordinates: iso ? isoLine(ring) : ring.map((p) => [p.longitude, p.latitude]),
            },
          };
        }),
      },
      labels: {
        type: "FeatureCollection" as const,
        features: walks.map(({ t, n, w }) => ({
          type: "Feature" as const,
          properties: { id: t.id, n, img: `walk-${t.id}` },
          geometry: { type: "Point" as const, coordinates: at(w.label[0], w.label[1]) },
        })),
      },
    };
  }, [iso]);

  return (
    <>
      <Images images={WALK_LABEL_IMAGES} />
      <GeoJSONSource id="walk-outlines" data={outlines}>
        {/* A screened band along the inside of each outline (they run anticlockwise: inside is to the left)… */}
        <Layer
          id="walk-bands"
          type="line"
          beforeId={outlinesBefore}
          layout={{ "line-join": "round" }}
          paint={{
            "line-color": INKED,
            "line-opacity": 0.16,
            "line-width": byZoom(...BAND),
            "line-offset": byZoom(...BAND.map((v, i) => (i % 2 ? -v / 2 : v))),
          }}
        />
        {/* …and the outline itself, a fine line. */}
        <Layer
          id="walk-lines"
          type="line"
          beforeId={outlinesBefore}
          layout={{ "line-join": "round" }}
          paint={{ "line-color": INKED, "line-opacity": 0.9, "line-width": byZoom(12, 1, 15, 1.6, 18, 2.2) }}
        />
      </GeoJSONSource>
      <GeoJSONSource
        id="walk-labels"
        data={labels}
        onPress={(event) => {
          // (The press also reaches the map, which would take it for a press on the ground.)
          event?.stopPropagation?.();
          const id = event?.nativeEvent?.features?.[0]?.properties?.id;
          if (typeof id === "string") onPress(id);
        }}
      >
        <Layer
          // (Placed anew if where it goes changes: the map's native side can't take a layer's place away from it.)
          key={labelsOver ? `over ${labelsOver}` : `under ${labelsBefore}`}
          id="walk-label-tags"
          type="symbol"
          {...(labelsOver ? { afterId: labelsOver } : { beforeId: labelsBefore })}
          layout={{
            "icon-image": ["get", "img"],
            // The label's foot on the outline: the dot at the bottom of its line on the point.
            "icon-anchor": "bottom",
            "icon-offset": [0, WALK_LABEL_DOT],
            "icon-size": byZoom(12, 0.72, 14, 0.9, 15, 1),
            "icon-padding": 2,
            // The earlier walks' labels first, where they'd cover each other.
            "symbol-sort-key": ["get", "n"],
          }}
        />
      </GeoJSONSource>
    </>
  );
}
