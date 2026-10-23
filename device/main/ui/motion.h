/**
 * The guide's motion: paper-toy, eased, never springy (design.md, "Motion").
 * Loops are keyframes over a cycle, eased between frames, like the design
 * canvas's CSS; several may run on one object at once (one per property).
 */
#pragma once
#include "lvgl.h"

/** A keyframe: at `t` per mille of the cycle, the value is `v`. */
typedef struct {
    uint16_t t;
    int16_t v;
} kf_t;

typedef void (*motion_apply_t)(lv_obj_t *obj, int32_t v);

/** Loops `obj` through `kf` (up to 16, copied) every `period_ms`, after `delay_ms`. */
void motion_loop(lv_obj_t *obj, const kf_t *kf, uint8_t n, uint32_t period_ms, uint32_t delay_ms, motion_apply_t apply);

/** Runs once from `a` to `b`, eased out, holding `a` until it starts. */
void motion_once(lv_obj_t *obj, int32_t a, int32_t b, uint32_t ms, uint32_t delay_ms, motion_apply_t apply);

/** Stops every motion on `obj`. */
void motion_stop(lv_obj_t *obj);

#define KF(...) ((const kf_t[]){__VA_ARGS__}), (sizeof((const kf_t[]){__VA_ARGS__}) / sizeof(kf_t))

/* What a motion moves. */
void m_x(lv_obj_t *o, int32_t v);       /* translate x, px */
void m_y(lv_obj_t *o, int32_t v);       /* translate y, px */
void m_opa(lv_obj_t *o, int32_t v);     /* 0..255; paints the object off-screen first, so keep it small */
void m_scale_y(lv_obj_t *o, int32_t v); /* images; 256 = 1 */
void m_scale(lv_obj_t *o, int32_t v);   /* images; 256 = 1 */
void m_zoom(lv_obj_t *o, int32_t v);    /* any object, about its centre; 256 = 1 */
void m_turn(lv_obj_t *o, int32_t v);    /* any object, about its centre; 0.1 degree, in half-degree steps */
void m_bg_opa(lv_obj_t *o, int32_t v);  /* a box's fill alone, painted directly; 0..255 */
void m_rotate(lv_obj_t *o, int32_t v);  /* images; 0.1 degree */
void m_size(lv_obj_t *o, int32_t v);    /* a square kept centred on its parent */
void m_arc_opa(lv_obj_t *o, int32_t v); /* an arc's stroke */
void m_outline(lv_obj_t *o, int32_t v); /* a ring spreading out from a button: 0..1000 */
