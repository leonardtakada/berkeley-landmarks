// Type stubs for the untyped modules the iso scripts use. d3-contour: the part the terrain uses.
declare module "d3-contour" {
  interface ContourMultiPolygon {
    type: "MultiPolygon";
    value: number;
    coordinates: [number, number][][][];
  }
  interface Contours {
    (values: number[]): ContourMultiPolygon[];
    size(size: [number, number]): Contours;
    thresholds(thresholds: number[]): Contours;
  }
  export function contours(): Contours;
}

// vt-pbf ships no types either; the tiles script casts what it uses.
declare module "vt-pbf";
