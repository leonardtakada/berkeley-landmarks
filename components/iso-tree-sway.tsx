import { useIsFocused } from "expo-router";
import React, { useEffect, useState } from "react";
import { Layer } from "@maplibre/maplibre-react-native";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import { useReducedMotion, type SharedValue } from "react-native-reanimated";

import type { MapView } from "@/components/iso-walkers";
import { gustiness, windTime } from "@/lib/grass";

/** The tiles' groups of swaying crowns (scripts/iso/sway.ts, SWAY_GROUPS). */
const GROUPS = [0, 1, 2, 3];
/** From this zoom the trees are drawn (lib/iso-style.ts), and from this one there's room to see them sway. */
const TREES_FROM_ZOOM = 15;
const SWAY_FROM_ZOOM = 15.6;
/** How often each group is given a new lean, ms; the map glides between in this long. */
const TICK_MS = 180;
const GLIDE_MS = 260;
/** Points to a metre of the drawing at zoom 0 (512-point tiles, the drawing's metres at the equator). */
const PT_PER_M = 512 / 40075016.686;

/**
 * How far a group of crowns leans at time `t`, metres along the drawing:
 * east with the wind, further in a gust (the grass's, lib/grass.ts), and
 * each group fluttering in its own time — and kept within the reach the
 * tiles allowed it (scripts/iso/city.ts, SWAY_REACH).
 */
function lean(t: number, g: number) {
  const { power } = gustiness(t);
  const flutter = 0.16 * Math.sin((2 * Math.PI * t) / (1.9 + g * 0.37) + g * 1.7) + 0.08 * Math.sin((2 * Math.PI * t) / (0.83 + g * 0.11) + g);
  return Math.max(-0.3, Math.min(0.75, power * 0.5 + flutter * (0.5 + power)));
}

/**
 * The city map's trees, swaying in the wind: the crowns with nothing in
 * front of them (the tiles' `sway` layer), in a few groups, each leaning
 * east with the gusts and fluttering out of step with the rest. Still with
 * Reduce Motion, or when the map's too far out to see it.
 */
export function IsoTreeSway({ view }: { view: SharedValue<MapView> }) {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const [tick, setTick] = useState<{ t: number; zoom: number } | null>(null);
  const moving = focused && !reduceMotion;

  useEffect(() => {
    if (!moving) return;
    const id = setInterval(() => {
      const v = view.get();
      setTick(v && v.zoom >= SWAY_FROM_ZOOM ? { t: windTime(), zoom: v.zoom } : null);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [moving, view]);
  const t = moving && tick ? tick.t : null;
  const ptPerM = PT_PER_M * 2 ** (tick?.zoom ?? 0);
  return (
    <>
      {GROUPS.map((g) => {
        const a = t === null ? 0 : lean(t, g) * ptPerM;
        return (
          <Layer
            key={g}
            id={`sway-${g}`}
            type="fill"
            source="iso"
            source-layer="sway"
            // Over everything standing (nothing stands in front of these), under the street names.
            beforeId="street-names"
            minzoom={TREES_FROM_ZOOM}
            filter={["==", ["get", "w"], g]}
            layout={{ "fill-sort-key": ["get", "s"] }}
            paint={
              {
                "fill-color": ["get", "c"] as unknown as ExpressionSpecification,
                // (As everything standing: no anti-aliased edges, which would show the faces behind.)
                "fill-antialias": false,
                // East on the drawing is right and a little up the screen.
                "fill-translate": [Math.round(a * 0.866 * 100) / 100, Math.round(-a * 0.5 * 100) / 100],
                "fill-translate-anchor": "map",
                "fill-translate-transition": { duration: GLIDE_MS, delay: 0 },
              } as never
            }
          />
        );
      })}
    </>
  );
}
