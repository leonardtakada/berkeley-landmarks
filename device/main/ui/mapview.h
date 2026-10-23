/**
 * The paper map, from the card: the app's tiles (scripts/bake_vector.mjs),
 * packed by scripts/narration/pack_guide.py into /sdcard/guide/tiles.bin with
 * tiles.idx. 256 px JPEGs, web Mercator, zooms 11–16, decoded as they come into
 * view and the last dozen kept. North up; laid behind whatever the screen puts
 * on it. Without the tiles on the card it's plain paper.
 */
#pragma once
#include <stdbool.h>
#include "lvgl.h"

#define MAPVIEW_ZOOM_MIN 13
#define MAPVIEW_ZOOM_MAX 16

typedef struct mapview mapview_t;

/** A full-screen map on `parent`, before anything that goes on top of it. */
mapview_t *mapview_create(lv_obj_t *parent);

/** Centres the map on (lat, lon) at `zoom`, bringing in the tiles that show. */
void mapview_set(mapview_t *m, double lat, double lon, int zoom);

/** Where (lat, lon) falls on the screen, in px. */
void mapview_project(const mapview_t *m, double lat, double lon, float *x, float *y);

/** Metres to a pixel at the map's centre. */
float mapview_metres_per_px(const mapview_t *m);

/** True if the card has the tiles. */
bool mapview_has_tiles(void);
