#include "motion.h"

#define MAX_KF 16

/* Keyframes are copied in, so callers can pass them as compound literals. */
typedef struct {
    lv_obj_t *obj;
    motion_apply_t apply;
    uint8_t n;
    kf_t kf[MAX_KF];
} motion_t;

/** Smoothstep between two keyframes: eased in and out, no overshoot. */
static int32_t ease(int32_t a, int32_t b, int32_t num, int32_t den)
{
    if (den <= 0) return b;
    int32_t x = (num << 10) / den;                     /* 0..1024 */
    int32_t s = (((x * x) >> 10) * (3072 - 2 * x)) >> 10; /* 3x² - 2x³ */
    return a + (((b - a) * s) >> 10);
}

static void loop_exec(lv_anim_t *a, int32_t t)
{
    motion_t *m = lv_anim_get_user_data(a);
    const kf_t *k = m->kf;
    int32_t v = k[m->n - 1].v;
    if (t <= k[0].t) {
        v = k[0].v;
    } else {
        for (uint8_t i = 1; i < m->n; i++) {
            if (t <= k[i].t) {
                v = ease(k[i - 1].v, k[i].v, t - k[i - 1].t, k[i].t - k[i - 1].t);
                break;
            }
        }
    }
    m->apply(m->obj, v);
}

static void once_exec(lv_anim_t *a, int32_t v)
{
    motion_t *m = lv_anim_get_user_data(a);
    m->apply(m->obj, v);
}

static void freed(lv_anim_t *a)
{
    lv_free(lv_anim_get_user_data(a));
}

static motion_t *new_motion(lv_obj_t *obj, motion_apply_t apply, const kf_t *kf, uint8_t n)
{
    motion_t *m = lv_malloc(sizeof(motion_t));
    m->obj = obj;
    m->apply = apply;
    m->n = LV_MIN(n, MAX_KF);
    if (kf) lv_memcpy(m->kf, kf, m->n * sizeof(kf_t));
    return m;
}

void motion_loop(lv_obj_t *obj, const kf_t *kf, uint8_t n, uint32_t period_ms, uint32_t delay_ms, motion_apply_t apply)
{
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, obj);
    lv_anim_set_user_data(&a, new_motion(obj, apply, kf, n));
    lv_anim_set_custom_exec_cb(&a, loop_exec);
    lv_anim_set_deleted_cb(&a, freed);
    lv_anim_set_values(&a, 0, 1000);
    lv_anim_set_duration(&a, period_ms);
    lv_anim_set_delay(&a, delay_ms);
    lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_path_cb(&a, lv_anim_path_linear);
    apply(obj, kf[0].v);
    lv_anim_start(&a);
}

void motion_once(lv_obj_t *obj, int32_t from, int32_t to, uint32_t ms, uint32_t delay_ms, motion_apply_t apply)
{
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, obj);
    lv_anim_set_user_data(&a, new_motion(obj, apply, NULL, 0));
    lv_anim_set_custom_exec_cb(&a, once_exec);
    lv_anim_set_deleted_cb(&a, freed);
    lv_anim_set_values(&a, from, to);
    lv_anim_set_duration(&a, ms);
    lv_anim_set_delay(&a, delay_ms);
    lv_anim_set_path_cb(&a, lv_anim_path_ease_out);
    apply(obj, from);
    lv_anim_start(&a);
}

void motion_stop(lv_obj_t *obj)
{
    lv_anim_delete(obj, NULL);
}

/* Style setters redraw even when nothing changed, so each motion checks first:
 * a slip holding still for most of its cycle shouldn't repaint every frame. */
void m_x(lv_obj_t *o, int32_t v)
{
    if (lv_obj_get_style_translate_x(o, 0) != v) lv_obj_set_style_translate_x(o, v, 0);
}

void m_y(lv_obj_t *o, int32_t v)
{
    if (lv_obj_get_style_translate_y(o, 0) != v) lv_obj_set_style_translate_y(o, v, 0);
}

void m_opa(lv_obj_t *o, int32_t v)
{
    lv_opa_t opa = (lv_opa_t)LV_CLAMP(0, v, 255);
    if (lv_obj_get_style_opa(o, 0) != opa) lv_obj_set_style_opa(o, opa, 0);
}

/* Images check for themselves. */
void m_scale_y(lv_obj_t *o, int32_t v) { lv_image_set_scale_y(o, (uint32_t)LV_MAX(v, 1)); }
void m_scale(lv_obj_t *o, int32_t v) { lv_image_set_scale(o, (uint32_t)LV_MAX(v, 1)); }
/* In half degrees: a finer turn redraws as often for no visible gain. */
void m_rotate(lv_obj_t *o, int32_t v) { lv_image_set_rotation(o, v - v % 5); }

void m_arc_opa(lv_obj_t *o, int32_t v)
{
    lv_opa_t opa = (lv_opa_t)LV_CLAMP(0, v, 255);
    if (lv_obj_get_style_arc_opa(o, LV_PART_MAIN) != opa) lv_obj_set_style_arc_opa(o, opa, LV_PART_MAIN);
}

void m_zoom(lv_obj_t *o, int32_t v)
{
    if (lv_obj_get_style_transform_scale_x(o, 0) == v) return;
    lv_obj_set_style_transform_pivot_x(o, LV_PCT(50), 0);
    lv_obj_set_style_transform_pivot_y(o, LV_PCT(50), 0);
    lv_obj_set_style_transform_scale(o, v, 0);
}

void m_turn(lv_obj_t *o, int32_t v)
{
    v -= v % 5;
    if (lv_obj_get_style_transform_rotation(o, 0) == v) return;
    lv_obj_set_style_transform_pivot_x(o, LV_PCT(50), 0);
    lv_obj_set_style_transform_pivot_y(o, LV_PCT(50), 0);
    lv_obj_set_style_transform_rotation(o, v, 0);
}

void m_bg_opa(lv_obj_t *o, int32_t v)
{
    lv_opa_t opa = (lv_opa_t)LV_CLAMP(0, v, 255);
    if (lv_obj_get_style_bg_opa(o, 0) != opa) lv_obj_set_style_bg_opa(o, opa, 0);
}

void m_size(lv_obj_t *o, int32_t v)
{
    if (lv_obj_get_style_width(o, 0) == v && lv_obj_get_style_height(o, 0) == v) return;
    lv_obj_set_size(o, v, v);
    lv_obj_center(o);
}

void m_outline(lv_obj_t *o, int32_t v)
{
    /* 0..1000: the ring spreads to 12 px as it fades. */
    int32_t w = v * 12 / 1000;
    lv_opa_t opa = (lv_opa_t)(115 - v * 115 / 1000);
    if (lv_obj_get_style_outline_width(o, 0) == w && lv_obj_get_style_outline_opa(o, 0) == opa) return;
    lv_obj_set_style_outline_width(o, w, 0);
    lv_obj_set_style_outline_opa(o, opa, 0);
}
