/**
 * The city map, isometric, as the app shows it: Berkeley seen from the
 * south-west and above (lib/iso.ts), painted by scripts/device/pack-iso.ts
 * and packed by scripts/narration/pack_guide.py into /sdcard/guide/iso.bin
 * with iso.idx. Four zooms of 256 px JPEGs, decoded as they come into view
 * and the last dozen kept; places are lifted onto the terraces they stand
 * on, as the app lifts its pins. Laid behind whatever the screen puts on it.
 * Without the tiles on the card it's plain paper, with places still where
 * they'd be.
 */
#pragma once
#include <stdbool.h>
#include "lvgl.h"

/* The zooms, far to near: 0.19, 0.38, 0.75 and 1.5 px to a metre of the drawing. */
#define MAPVIEW_ZOOM_MIN 0
#define MAPVIEW_ZOOM_MAX 3

typedef struct mapview mapview_t;

/** A full-screen map on `parent`, before anything that goes on top of it. */
mapview_t *mapview_create(lv_obj_t *parent);

/** Centres the map on (lat, lon) at `zoom`, bringing in the tiles that show. */
void mapview_set(mapview_t *m, double lat, double lon, int zoom);

/**
 * Frames the `n` points (lat, lon pairs in millionths of a degree) in `box`:
 * the nearest zoom up to `max_zoom` that holds them all (or the furthest, if
 * none does), their middle at the box's.
 */
void mapview_fit(mapview_t *m, const int32_t *e6, int n, const lv_area_t *box, int max_zoom);

/** Where (lat, lon) falls on the screen, in px, standing on its terrace. */
void mapview_project(const mapview_t *m, double lat, double lon, float *x, float *y);

/** The way a compass bearing runs across the screen, as a unit step in px. */
void mapview_direction(float bearing, float *dx, float *dy);

/** True if the card has the tiles. */
bool mapview_has_tiles(void);
