/**
 * The guide's walks, as the device shows them: generated from the app's data
 * by scripts/device/export-walks.ts (walks_gen.c) until the SD bundle
 * (Phase 2) replaces it.
 */
#pragma once
#include <stddef.h>
#include <stdint.h>
#include "art.h"

typedef struct {
    const char *name;
    const char *speaker;     /* who narrates it: an architect's key, or NULL for the guide */
    const char *caption;     /* the narration's opening lines */
    int32_t lat_e6, lon_e6;  /* the building, millionths of a degree */
    int16_t passing;         /* where the route passes it: an index into the walk's route (−1: no route) */
    int16_t lm;              /* its landmark (lm-N): its narration on the card is lm<N>.caf */
} stop_t;

typedef struct {
    const char *name;
    const char *distance;
    const char *duration;
    const char *host; /* the architect who walks it with you (`lead ?? cast[0]`), or NULL */
    const stop_t *stops;
    int stop_count;
    const int32_t *route; /* the way a walker takes (the app's routeCoordinates): lat, lon pairs in e6 */
    int route_len;        /* points */
} walk_t;

typedef struct {
    const char *key, *name;
} architect_t;

#define WALK_COUNT 12
extern const walk_t walks[WALK_COUNT];
extern const architect_t architects[];
extern const int architect_count;

/** An architect's full name ("Bernard Maybeck"), or the key itself if unknown. */
const char *architect_name(const char *key);

/** An architect's portrait, if it's baked into the firmware yet; NULL otherwise. */
const art_portrait_t *portrait_of(const char *key);

/** Their face in a circle, for stepping aside at a handover; NULL if not baked. */
const lv_image_dsc_t *cameo_of(const char *key);

/** What the host says about a walk's size: "Ten stops, about a mile." */
void walk_size_line(const walk_t *w, char *buf, size_t len);
