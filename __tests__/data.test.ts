import { describe, it, expect } from "vitest";
import { landmarks, CATEGORY_COLORS, CATEGORY_LABELS, BERKELEY_CENTER } from "../data/landmarks";
import { tours } from "../data/tours";

describe("Landmark Data", () => {
  it("should have at least 40 landmarks", () => {
    expect(landmarks.length).toBeGreaterThanOrEqual(40);
  });

  it("should have unique IDs for all landmarks", () => {
    const ids = landmarks.map((l) => l.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have valid coordinates for all landmarks", () => {
    for (const landmark of landmarks) {
      expect(landmark.latitude).toBeGreaterThan(37.84);
      expect(landmark.latitude).toBeLessThan(37.91);
      expect(landmark.longitude).toBeGreaterThan(-122.31);
      expect(landmark.longitude).toBeLessThan(-122.23);
    }
  });

  it("should have valid categories for all landmarks", () => {
    const validCategories = Object.keys(CATEGORY_COLORS);
    for (const landmark of landmarks) {
      expect(validCategories).toContain(landmark.category);
    }
  });

  it("should have required fields for all landmarks", () => {
    for (const landmark of landmarks) {
      expect(landmark.id).toBeTruthy();
      expect(landmark.name).toBeTruthy();
      expect(landmark.address).toBeTruthy();
      expect(landmark.architect).toBeTruthy();
      expect(landmark.yearBuilt).toBeTruthy();
      expect(landmark.description).toBeTruthy();
      expect(landmark.style).toBeTruthy();
      expect(landmark.neighborhood).toBeTruthy();
    }
  });

  it("should have matching CATEGORY_COLORS and CATEGORY_LABELS keys", () => {
    const colorKeys = Object.keys(CATEGORY_COLORS).sort();
    const labelKeys = Object.keys(CATEGORY_LABELS).sort();
    expect(colorKeys).toEqual(labelKeys);
  });

  it("should have valid BERKELEY_CENTER coordinates", () => {
    expect(BERKELEY_CENTER.latitude).toBeCloseTo(37.8716, 2);
    expect(BERKELEY_CENTER.longitude).toBeCloseTo(-122.2727, 2);
    expect(BERKELEY_CENTER.latitudeDelta).toBeGreaterThan(0);
    expect(BERKELEY_CENTER.longitudeDelta).toBeGreaterThan(0);
  });
});

describe("Tour Data", () => {
  it("should have at least 5 tours", () => {
    expect(tours.length).toBeGreaterThanOrEqual(5);
  });

  it("should have unique IDs for all tours", () => {
    const ids = tours.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have valid stops referencing existing landmarks", () => {
    const landmarkIds = new Set(landmarks.map((l) => l.id));
    for (const tour of tours) {
      expect(tour.stops.length).toBeGreaterThan(0);
      for (const stop of tour.stops) {
        expect(landmarkIds.has(stop.landmarkId)).toBe(true);
      }
    }
  });

  it("should have ordered stops", () => {
    for (const tour of tours) {
      const orders = tour.stops.map((s) => s.order);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });

  it("should have valid route coordinates", () => {
    for (const tour of tours) {
      expect(tour.routeCoordinates.length).toBeGreaterThan(0);
      for (const coord of tour.routeCoordinates) {
        expect(coord.latitude).toBeGreaterThan(37.84);
        expect(coord.latitude).toBeLessThan(37.91);
        expect(coord.longitude).toBeGreaterThan(-122.31);
        expect(coord.longitude).toBeLessThan(-122.23);
      }
    }
  });

  it("should have required fields for all tours", () => {
    for (const tour of tours) {
      expect(tour.id).toBeTruthy();
      expect(tour.name).toBeTruthy();
      expect(tour.neighborhood).toBeTruthy();
      expect(tour.description).toBeTruthy();
      expect(tour.author).toBeTruthy();
      expect(tour.distance).toBeTruthy();
      expect(tour.duration).toBeTruthy();
      expect(tour.color).toBeTruthy();
    }
  });
});
