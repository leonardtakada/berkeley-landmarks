import React, { type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

import { parseSvg, splitSheets, type SvgNode } from "@/lib/svg-tree";

const TAGS: Record<string, React.ComponentType<any>> = {
  g: G,
  path: Path,
  circle: Circle,
  ellipse: Ellipse,
  rect: Rect,
  line: Line,
  polygon: Polygon,
  polyline: Polyline,
  defs: Defs,
  clipPath: ClipPath,
};

/** SVG attributes as react-native-svg props (`stroke-width` → `strokeWidth`). */
export function svgProps(attrs: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("data-") || k === "xmlns") continue;
    out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out;
}

/** Draws some elements differently: return an element for a node, or undefined to draw it as it is. */
export type Swap = (node: SvgNode, key: string) => ReactNode | undefined;

/** A sheet holding one moving part, for the caller to print and move. */
export interface MovingSheet {
  role: string;
  root: SvgNode;
  /** Where the sheet sits over the drawing (absolute, in points). */
  place: ViewStyle;
  /** The part of the drawing it covers, [x, y, w, h] in the drawing's units. */
  box: [number, number, number, number];
  /** Points per drawing unit. */
  unit: number;
  /** The sheet (or a variant of it, e.g. smiling) as an Svg filling `place`. */
  print: (root?: SvgNode, swap?: Swap) => ReactNode;
}

function drawNode(node: SvgNode, key: string, swap?: Swap): ReactNode {
  const swapped = swap?.(node, key);
  if (swapped !== undefined) return swapped;
  const Tag = TAGS[node.tag];
  if (!Tag) return null;
  return (
    <Tag key={key} {...svgProps(node.attrs)}>
      {node.children.map((c, i) => drawNode(c, `${key}.${i}`, swap))}
    </Tag>
  );
}

/**
 * One of the guide's baked drawings, drawn from its SVG string like SvgXml.
 *
 * With `part`, the drawing is printed as a stack of sheets (see
 * `splitSheets`), and each sheet holding a moving part (`data-anim`) is
 * handed to `part` to print and move — slide, squash, fade — as a whole, in
 * its place in the stacking order. Nothing is drawn again as it moves, so a
 * page of moving drawings stays cheap to scroll.
 */
export function LivingSvg({
  xml,
  width,
  height,
  part,
}: {
  xml: string;
  width: number;
  height: number;
  part?: (sheet: MovingSheet, key: string) => ReactNode;
}) {
  const root = parseSvg(xml);
  if (!part) {
    return (
      <Svg width={width} height={height} viewBox={root.attrs.viewBox}>
        {root.children.map((c, i) => drawNode(c, String(i)))}
      </Svg>
    );
  }
  const [vx, vy, vw] = (root.attrs.viewBox ?? "0 0 200 240").split(/[\s,]+/).map(Number);
  const unit = width / vw;
  return (
    <View style={{ width, height }} pointerEvents="none">
      {splitSheets(xml).map((sheet, i) => {
        const [x, y, w, h] = sheet.box;
        const place: ViewStyle = { position: "absolute", left: (x - vx) * unit, top: (y - vy) * unit, width: w * unit, height: h * unit };
        const print = (r: SvgNode = sheet.root, swap?: Swap) => (
          <Svg width={w * unit} height={h * unit} viewBox={sheet.box.join(" ")}>
            {r.children.map((c, j) => drawNode(c, `${i}.${j}`, swap))}
          </Svg>
        );
        if (!sheet.role) {
          return (
            <View key={i} style={place}>
              {print()}
            </View>
          );
        }
        return part({ role: sheet.role, root: sheet.root, place, box: sheet.box, unit, print }, String(i));
      })}
    </View>
  );
}
