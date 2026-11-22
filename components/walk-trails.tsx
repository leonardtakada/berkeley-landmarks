import React, { useMemo } from "react";
import { GeoJSONSource, Images, Layer } from "@maplibre/maplibre-react-native";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

import { WALK_TAG_IMAGES } from "@/components/walk-tags.generated";
import { INK } from "@/constants/book";
import { tours } from "@/data/tours";
import { isoLine, isoPoint } from "@/lib/iso-map";
import { WALK_TAG_ROUNDEL, WALK_TAGS, WALK_TRAILS } from "@/lib/walk-trails.generated";

/**
 * The zoom each rank of a walk's tags is shown from: its one tag, then those
 * 2000, 1000 and 500 m apart (scripts/iso/walk-trails.ts, TAG_APART), so
 * there's about one of a walk's tags to a screen at any zoom. (A layer to a
 * rank: a layer's least zoom is kept to the fraction, a filter's isn't.)
 */
const RANK_FROM_ZOOM = [12.5, 15.3, 16.3, 17.3];
/** The tags' layers, one to a rank (for the map to ask which tag is under a press). */
export const WALK_TAG_LAYERS = RANK_FROM_ZOOM.map((_, rank) => `walk-tags-${rank}`);
/** Between these zooms a tag bears the walk's name; further out (among the clusters) and closer in (over the buildings), its roundel alone. */
const NAMED_ZOOMS = [14, 16];

const byZoom = (...stops: number[]) => ["interpolate", ["linear"], ["zoom"], ...stops] as unknown as ExpressionSpecification;
type LatLng = { latitude: number; longitude: number };

/**
 * The walks on the city map, before one is chosen, as a pictorial guide map
 * marks its walking courses: a dotted vermilion trail along the streets the
 * walks take (scripts/iso/walk-trails.ts: each stretch once, however many
 * walks share it), on the ground under what stands; and its tag — its number
 * on a vermilion roundel set on the trail, its name in tracked blue capitals
 * on a slip of paper — once for each walk far out, more often the closer in
 * (about one of a walk's to a screen), and far out and close in the roundel
 * alone. The tags give way to the landmarks' pins and to each other, the
 * earlier walks' first. A tag pressed opens
 * its walk. Where tags would cover each other, the earlier walks' are shown.
 * Hidden while a walk is open.
 */
export function WalkTrails({
  iso,
  shown,
  onPress,
  trailsBefore,
  tagsBefore,
}: {
  iso: boolean;
  /** Whether they're to be seen. (Hidden, not taken away: the pins are placed under the tags, and stay there.) */
  shown: boolean;
  onPress: (tourId: string) => void;
  /** The layer the trails go under (on the drawing, what stands). */
  trailsBefore?: string;
  /** The layer the tags go under: the landmarks' pins, which are placed first, so the tags make way for them. */
  tagsBefore?: string;
}) {
  const visibility = shown ? "visible" : "none";
  const { trails, tags } = useMemo(() => {
    const line = (pts: LatLng[]) => (iso ? isoLine(pts) : pts.map((p) => [p.longitude, p.latitude]));
    return {
      trails: {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "MultiLineString" as const,
          // On the drawing, following the terraces up and down.
          coordinates: WALK_TRAILS.map((t) => line(t.map(([latitude, longitude]) => ({ latitude, longitude })))),
        },
      },
      tags: {
        type: "FeatureCollection" as const,
        features: WALK_TAGS.map(([id, latitude, longitude, rank]) => {
          const n = tours.findIndex((t) => t.id === id) + 1;
          return {
            type: "Feature" as const,
            properties: { id, n, rank, img: `walk-${id}`, no: `walk-no-${id}` },
            geometry: {
              type: "Point" as const,
              coordinates: iso ? isoPoint({ latitude, longitude }) : [longitude, latitude],
            },
          };
        }),
      },
    };
  }, [iso]);

  return (
    <>
      <Images images={WALK_TAG_IMAGES} />
      <GeoJSONSource id="walk-trails" data={trails}>
        <Layer
          id="walk-trail-dots"
          type="line"
          beforeId={trailsBefore}
          layout={{ visibility, "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": INK.vermilion,
            "line-width": byZoom(12, 1.5, 14, 2.3, 16, 3.2, 18, 4.2),
            // Dots: dashes of no length, round-capped, two and a bit widths apart.
            "line-dasharray": [0, 2.2],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource
        id="walk-tags"
        data={tags}
        onPress={(event) => {
          // (The press also reaches the map, which would take it for a press on the ground.)
          event?.stopPropagation?.();
          const id = event?.nativeEvent?.features?.[0]?.properties?.id;
          if (typeof id === "string") onPress(id);
        }}
      >
        {/* The closer ranks first, so the further ones lie over them and are placed first. */}
        {[...RANK_FROM_ZOOM.keys()].reverse().map((rank) => (
          <Layer
            // (Placed anew if where it goes changes: the map's native side can't take a layer's place away from it.)
            key={`${rank} ${tagsBefore ?? "top"}`}
            id={`walk-tags-${rank}`}
            type="symbol"
            minzoom={RANK_FROM_ZOOM[rank]}
            beforeId={tagsBefore}
            filter={["==", ["get", "rank"], rank]}
            layout={{
              visibility,
              "icon-image": ["step", ["zoom"], ["get", "no"], NAMED_ZOOMS[0], ["get", "img"], NAMED_ZOOMS[1], ["get", "no"]] as unknown as ExpressionSpecification,
              // The roundel on the trail, the name running off to its right.
              "icon-anchor": "left",
              "icon-offset": [-WALK_TAG_ROUNDEL, 0],
              "icon-size": byZoom(12.5, 0.85, 14, 1),
              "icon-padding": 4,
              // The earlier walks' tags first, where they'd cover each other.
              "symbol-sort-key": ["get", "n"],
            }}
          />
        ))}
      </GeoJSONSource>
    </>
  );
}
