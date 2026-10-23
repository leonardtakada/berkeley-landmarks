/**
 * Every landmark in the guide, for the free map (Explore): generated from the
 * app's data by scripts/device/export-walks.ts (landmarks_gen.c).
 */
#pragma once
#include <stdint.h>

typedef struct {
    const char *name;
    const char *architect; /* the credit, cut to a line ("" if none) */
    int16_t year;          /* built, or 0 */
    int32_t lat_e6, lon_e6; /* degrees × 1e6 */
    int16_t lm;            /* lm-N: its narration on the card is lm<N>.caf */
    const char *speaker;   /* who opens its narration (an architect's key), or NULL for the guide */
    const char *caption;   /* its narration's first lines, or NULL if it has no narration */
} landmark_t;

extern const landmark_t landmarks[];
extern const int landmark_count;
