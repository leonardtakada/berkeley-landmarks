/**
 * The walks' buildings, printed as the app prints its plates (blue on cream,
 * round, the credit lettered round the foot): scripts/device/pack-prints.ts
 * puts them on the card as /sdcard/guide/pr<N>.jpg, 160 px.
 */
#pragma once
#include "lvgl.h"

#define PRINT_PX 160

/** Landmark lm-N's print, decoded from the card (the last two kept); NULL if the card hasn't it. */
const lv_image_dsc_t *print_of(int lm);

/**
 * The print of lm-N, round, centred on (cx, cy), with the app's second plate
 * (`plate`: vermilion, but for on a vermilion ground) set behind it a little
 * out of register; NULL (and nothing made) if the card hasn't it. Its ring
 * (border colour) is `ring`.
 */
lv_obj_t *print_show(lv_obj_t *parent, int lm, int32_t cx, int32_t cy, lv_color_t ring, lv_color_t plate);
