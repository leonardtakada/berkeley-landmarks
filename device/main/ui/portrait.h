/**
 * The companion: an architect, filling the screen and alive on it.
 *
 * Built from the portrait's own layers (scripts/device/build-art.mjs), placed
 * where they sit on the 466 px screen, with the face at ART_FACE_Y. Lay the
 * screen in the portrait's `ground` colour first. It changes mood with the
 * walk (docs/tour-device-plan.md, "Motion and the companion"): every mood
 * breathes and blinks; the rest is what it does.
 */
#pragma once
#include "lvgl.h"
#include "art.h"

typedef enum {
    MOOD_IDLE,   /* looks about, grins now and then */
    MOOD_WALK,   /* bobs in step */
    MOOD_SEARCH, /* eyes dart, head peers side to side */
    MOOD_GLAD,   /* smile held, double blink, a small hop */
    MOOD_TALK,   /* mouth in a syllable rhythm, head nods */
    MOOD_LISTEN, /* eyes on the caption, a nod now and then */
    MOOD_SLEEP,  /* eyes shut, slow nod, snoring */
    MOOD_ASIDE,  /* steps aside for another architect: looks across, smiling */
    MOOD_HELLO,  /* steps in: brows up, smiling */
} mood_t;

lv_obj_t *portrait_create(lv_obj_t *parent, const art_portrait_t *art, mood_t mood);
void portrait_set_mood(lv_obj_t *portrait, mood_t mood);

/** Where the eyes look, in tenths of the drawing's units: + right, − left. For MOOD_WALK. */
void portrait_gaze(lv_obj_t *portrait, int32_t tenths);

/** Shades the portrait toward `color` by `opa`, as the guide dims to rest. */
void portrait_dim(lv_obj_t *portrait, lv_color_t color, lv_opa_t opa);

/** Rises into place from below after `delay_ms`, as the companion arrives. */
void portrait_rise(lv_obj_t *portrait, int32_t from_px, uint32_t delay_ms);
