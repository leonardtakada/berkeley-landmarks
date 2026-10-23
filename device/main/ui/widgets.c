#include "widgets.h"
#include <math.h>
#include "motion.h"

lv_obj_t *box(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h)
{
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_style_all(o);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_pos(o, x, y);
    lv_obj_set_size(o, w, h);
    return o;
}

lv_obj_t *disc(lv_obj_t *parent, int32_t x, int32_t y, int32_t d, lv_color_t color)
{
    lv_obj_t *o = box(parent, x, y, d, d);
    lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(o, color, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    return o;
}

lv_obj_t *text_in(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, const char *s)
{
    lv_obj_t *l = lv_label_create(parent);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, color, 0);
    lv_label_set_text(l, s);
    return l;
}

lv_obj_t *line_centered(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, int32_t y, const char *s)
{
    lv_obj_t *l = text_in(parent, font, color, s);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(l, LV_ALIGN_TOP_MID, 0, y);
    return l;
}

lv_obj_t *text_at(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, int32_t x, int32_t y, const char *s)
{
    lv_obj_t *l = text_in(parent, font, color, s);
    lv_obj_set_pos(l, x, y);
    return l;
}

lv_obj_t *kicker(lv_obj_t *parent, lv_color_t color, int32_t y, const char *s)
{
    lv_obj_t *l = line_centered(parent, &jost_medium_16, color, y, s);
    lv_obj_set_style_text_letter_space(l, 3, 0);
    return l;
}

lv_obj_t *slip(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h)
{
    lv_obj_t *o = box(parent, x, y, w, h);
    lv_obj_set_style_bg_color(o, C_SLIP, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(o, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_width(o, 3, 0);
    lv_obj_set_style_border_color(o, C_BLUE, 0);
    lv_obj_set_style_shadow_width(o, 14, 0);
    lv_obj_set_style_shadow_offset_y(o, 5, 0);
    lv_obj_set_style_shadow_color(o, lv_color_hex(0x1E1810), 0);
    lv_obj_set_style_shadow_opa(o, LV_OPA_20, 0);
    return o;
}

static lv_obj_t *say_slip(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, const char *s)
{
    lv_obj_t *o = slip(parent, x, y, w, LV_SIZE_CONTENT);
    lv_obj_set_style_pad_hor(o, 9, 0);
    lv_obj_set_style_pad_ver(o, 7, 0);
    lv_obj_t *l = text_in(o, &jost_regular_18, C_CHARCOAL, s);
    lv_obj_set_width(l, w - 18);
    lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_WRAP);
    return o;
}

lv_obj_t *say(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, const char *s, bool second)
{
    lv_obj_t *o = say_slip(parent, x, y, w, s);
    /* In for a third of the cycle, out for the rest; the second slip takes the other half. */
    motion_loop(o, KF({0, 0}, {40, 0}, {90, 255}, {420, 255}, {470, 0}, {1000, 0}), 10000, second ? 5000 : 0, m_opa);
    motion_loop(o, KF({0, 6}, {40, 6}, {90, 0}, {420, 0}, {470, -4}, {1000, -4}), 10000, second ? 5000 : 0, m_y);
    return o;
}

lv_obj_t *say_once(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, const char *s, uint32_t delay_ms)
{
    lv_obj_t *o = say_slip(parent, x, y, w, s);
    motion_once(o, 0, 255, 450, delay_ms, m_opa);
    motion_once(o, 6, 0, 450, delay_ms, m_y);
    return o;
}

/* The rim: a 10 px band whose outer edge is 224 px from the centre, with a 2° gap either side of each stop. */
#define RIM_R 224
#define RIM_W 10
#define RIM_GAP 20 /* tenths of a degree */

typedef struct {
    int32_t start, end; /* tenths of a degree, clockwise from three o'clock; end may pass 3600 */
} rim_t;

static void rim_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    const rim_t *r = lv_event_get_user_data(e);
    lv_area_t scr;
    lv_obj_get_coords(lv_obj_get_screen(o), &scr);

    lv_draw_arc_dsc_t dsc;
    lv_draw_arc_dsc_init(&dsc);
    dsc.center.x = scr.x1 + SCREEN_W / 2;
    dsc.center.y = scr.y1 + SCREEN_H / 2;
    dsc.radius = RIM_R;
    dsc.width = RIM_W;
    dsc.start_angle = (r->start % 3600) / 10.0f;
    dsc.end_angle = (r->end % 3600) / 10.0f;
    dsc.color = lv_obj_get_style_arc_color(o, LV_PART_MAIN);
    dsc.opa = lv_obj_get_style_arc_opa(o, LV_PART_MAIN);
    if (r->end > r->start) lv_draw_arc(lv_event_get_layer(e), &dsc);
}

/** The screen area a stretch of rim covers, a few px over for the anti-aliased edge and whole degrees. */
static void rim_area(int32_t start, int32_t end, lv_area_t *out)
{
    int32_t x1 = SCREEN_W, y1 = SCREEN_H, x2 = 0, y2 = 0;
    for (int32_t a = start;; a += 10) {
        int32_t deg = LV_MIN(a, end) / 10;
        for (int32_t rad = RIM_R - RIM_W; rad <= RIM_R; rad += RIM_W) {
            int32_t x = SCREEN_W / 2 + lv_trigo_cos(deg) * rad / LV_TRIGO_SIN_MAX;
            int32_t y = SCREEN_H / 2 + lv_trigo_sin(deg) * rad / LV_TRIGO_SIN_MAX;
            x1 = LV_MIN(x1, x), y1 = LV_MIN(y1, y), x2 = LV_MAX(x2, x), y2 = LV_MAX(y2, y);
        }
        if (a >= end) break;
    }
    out->x1 = x1 - 4, out->y1 = y1 - 4, out->x2 = x2 + 4, out->y2 = y2 + 4;
}

/** Fits the arc's box to its span, so redrawing it leaves the rest of the screen alone. */
static void rim_fit(lv_obj_t *o, const rim_t *r)
{
    lv_area_t a;
    rim_area(r->start, r->end, &a);
    lv_obj_invalidate(o);
    lv_obj_set_pos(o, a.x1, a.y1);
    lv_obj_set_size(o, lv_area_get_width(&a), lv_area_get_height(&a));
    lv_obj_invalidate(o);
}

static void rim_freed(lv_event_t *e)
{
    lv_free(lv_event_get_user_data(e));
}

lv_obj_t *rim_arc(lv_obj_t *parent, lv_color_t color)
{
    rim_t *r = lv_malloc(sizeof(rim_t));
    r->start = r->end = -1;
    lv_obj_t *o = box(parent, 0, 0, 1, 1);
    lv_obj_set_user_data(o, r);
    lv_obj_set_style_arc_color(o, color, 0);
    lv_obj_set_style_arc_opa(o, LV_OPA_COVER, 0);
    lv_obj_add_event_cb(o, rim_draw, LV_EVENT_DRAW_MAIN, r);
    lv_obj_add_event_cb(o, rim_freed, LV_EVENT_DELETE, r);
    rim_arc_set(o, 0, 10);
    return o;
}

void rim_arc_set(lv_obj_t *o, int32_t from10, int32_t len10)
{
    rim_t *r = lv_obj_get_user_data(o);
    int32_t start = ((2700 + from10) % 3600 + 3600) % 3600;
    if (r->start == start && r->end == start + len10) return;
    r->start = start;
    r->end = start + len10;
    rim_fit(o, r);
}

lv_obj_t *rim_progress(lv_obj_t *parent, lv_color_t color)
{
    rim_t *r = lv_malloc(sizeof(rim_t));
    r->start = r->end = 2700;
    /* The whole screen, so the box never moves; rim_progress_set marks only the stretch that changed. */
    lv_obj_t *o = box(parent, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_set_user_data(o, r);
    lv_obj_set_style_arc_color(o, color, 0);
    lv_obj_set_style_arc_opa(o, LV_OPA_COVER, 0);
    lv_obj_add_event_cb(o, rim_draw, LV_EVENT_DRAW_MAIN, r);
    lv_obj_add_event_cb(o, rim_freed, LV_EVENT_DELETE, r);
    return o;
}

void rim_progress_set(lv_obj_t *o, int32_t len10)
{
    rim_t *r = lv_obj_get_user_data(o);
    int32_t end = r->start + LV_CLAMP(0, len10, 3599);
    if (end == r->end) return;
    lv_area_t a;
    rim_area(LV_MIN(end, r->end), LV_MAX(end, r->end), &a);
    lv_area_t scr;
    lv_obj_get_coords(lv_obj_get_screen(o), &scr);
    lv_area_move(&a, scr.x1, scr.y1);
    r->end = end;
    lv_obj_invalidate_area(o, &a);
}

lv_obj_t *rim_segment(lv_obj_t *parent, int i, int n, lv_color_t color)
{
    lv_obj_t *o = rim_arc(parent, color);
    rim_arc_set(o, i * 3600 / n + RIM_GAP, 3600 / n - 2 * RIM_GAP);
    return o;
}

/* The pointer: its tip 7 px inside the rim, its base 44 px further in, 54 px across. */
#define POINTER_TIP 207
#define POINTER_BASE 163
#define POINTER_HALF 27
#define POINTER_BOX 90 /* its square box, centred POINTER_AT px out */
#define POINTER_AT 182

typedef struct {
    int32_t deg10;
    lv_color_t color, shadow;
} pointer_t;

static void pointer_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    const pointer_t *pt = lv_event_get_user_data(e);
    lv_area_t scr;
    lv_obj_get_coords(lv_obj_get_screen(o), &scr);
    float a = (float)pt->deg10 * (float)M_PI / 1800.0f;
    float ux = sinf(a), uy = -cosf(a); /* out along the bearing */
    float cx = scr.x1 + SCREEN_W / 2.0f, cy = scr.y1 + SCREEN_H / 2.0f;

    lv_draw_triangle_dsc_t d;
    lv_draw_triangle_dsc_init(&d);
    for (int pass = 0; pass < 2; pass++) {
        /* The shadow first, dropped down and to the right like the arrow's on the canvas. */
        float ox = pass ? 0 : 3, oy = pass ? 0 : 5;
        d.color = pass ? pt->color : pt->shadow;
        d.p[0].x = cx + ux * POINTER_TIP + ox;
        d.p[0].y = cy + uy * POINTER_TIP + oy;
        d.p[1].x = cx + ux * POINTER_BASE - uy * POINTER_HALF + ox;
        d.p[1].y = cy + uy * POINTER_BASE + ux * POINTER_HALF + oy;
        d.p[2].x = cx + ux * POINTER_BASE + uy * POINTER_HALF + ox;
        d.p[2].y = cy + uy * POINTER_BASE - ux * POINTER_HALF + oy;
        lv_draw_triangle(lv_event_get_layer(e), &d);
    }
}

static void pointer_freed(lv_event_t *e)
{
    lv_free(lv_event_get_user_data(e));
}

lv_obj_t *rim_pointer(lv_obj_t *parent, lv_color_t color, lv_color_t shadow)
{
    pointer_t *pt = lv_malloc(sizeof(pointer_t));
    pt->deg10 = -1;
    pt->color = color;
    pt->shadow = shadow;
    lv_obj_t *o = box(parent, 0, 0, POINTER_BOX, POINTER_BOX);
    lv_obj_set_user_data(o, pt);
    lv_obj_add_event_cb(o, pointer_draw, LV_EVENT_DRAW_MAIN, pt);
    lv_obj_add_event_cb(o, pointer_freed, LV_EVENT_DELETE, pt);
    rim_pointer_set(o, 0);
    return o;
}

void rim_pointer_set(lv_obj_t *o, int32_t deg10)
{
    pointer_t *pt = lv_obj_get_user_data(o);
    if (pt->deg10 == deg10) return;
    pt->deg10 = deg10;
    float a = (float)deg10 * (float)M_PI / 1800.0f;
    lv_obj_set_pos(o, (int32_t)lroundf(SCREEN_W / 2.0f + POINTER_AT * sinf(a)) - POINTER_BOX / 2,
                   (int32_t)lroundf(SCREEN_H / 2.0f - POINTER_AT * cosf(a)) - POINTER_BOX / 2);
    lv_obj_invalidate(o);
}

static lv_obj_t *ring(lv_obj_t *parent, int32_t d, int32_t w, lv_color_t color)
{
    lv_obj_t *o = box(parent, 0, 0, d, d);
    lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(o, w, 0);
    lv_obj_set_style_border_color(o, color, 0);
    lv_obj_center(o);
    return o;
}

/* Lettering round a stamp: standing on the circle at the top, hanging from it at the foot. */
static void stamp_lettering(lv_obj_t *parent, int32_t d, int32_t radius, bool top, const char *s)
{
    lv_obj_t *a = lv_arclabel_create(parent);
    lv_obj_remove_flag(a, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(a, d, d);
    lv_obj_set_style_text_font(a, &jost_medium_16, 0);
    lv_obj_set_style_text_color(a, C_VERMILION, 0);
    lv_obj_set_style_text_letter_space(a, 2, 0);
    lv_arclabel_set_text(a, s);
    lv_arclabel_set_radius(a, radius);
    lv_arclabel_set_angle_start(a, top ? 180 : 0);
    lv_arclabel_set_angle_size(a, 180);
    lv_arclabel_set_dir(a, top ? LV_ARCLABEL_DIR_CLOCKWISE : LV_ARCLABEL_DIR_COUNTER_CLOCKWISE);
    lv_arclabel_set_text_horizontal_align(a, LV_ARCLABEL_TEXT_ALIGN_CENTER);
    lv_arclabel_set_text_vertical_align(a, top ? LV_ARCLABEL_TEXT_ALIGN_TRAILING : LV_ARCLABEL_TEXT_ALIGN_LEADING);
    lv_obj_center(a);
}

lv_obj_t *stamp(lv_obj_t *parent, int32_t cx, int32_t cy, int32_t d, const char *top, const char *middle,
                const lv_font_t *middle_font, const char *bottom, bool inner, int32_t tilt10)
{
    lv_obj_t *o = disc(parent, cx - d / 2, cy - d / 2, d, C_SLIP);
    ring(o, d - 2, 4, C_VERMILION);
    ring(o, d * 172 / 200, 1, C_VERMILION);
    if (inner) ring(o, d * 108 / 200, 1, C_VERMILION);
    /* Both lines of lettering fill a 10 px band starting 0.7 of the way out. LVGL
     * sets letters by their line box, so the radii are offset as on the cover:
     * +3 puts the top line's baseline on the band, −9 hangs the foot's from it. */
    int32_t band = d * 70 / 200;
    if (top) stamp_lettering(o, d, band + 3, true, top);
    if (bottom) stamp_lettering(o, d, band + 10 - 9, false, bottom);
    lv_obj_t *m = text_in(o, middle_font, C_VERMILION, middle);
    lv_obj_set_style_text_letter_space(m, middle_font == &jost_light_54 ? -1 : 3, 0);
    lv_obj_center(m);
    lv_obj_set_style_transform_pivot_x(o, LV_PCT(50), 0);
    lv_obj_set_style_transform_pivot_y(o, LV_PCT(50), 0);
    lv_obj_set_style_transform_rotation(o, tilt10, 0);
    return o;
}

lv_obj_t *stop_dot(lv_obj_t *parent, int32_t d, int n, lv_color_t bg, lv_color_t fg)
{
    lv_obj_t *o = lv_obj_create(parent);
    lv_obj_remove_style_all(o);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(o, d, d);
    lv_obj_set_style_radius(o, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(o, bg, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    lv_obj_t *l = text_in(o, &jost_medium_14, fg, "");
    lv_label_set_text_fmt(l, "%d", n);
    lv_obj_center(l);
    return o;
}

static lv_obj_t *polyline(lv_obj_t *parent, const lv_point_precise_t *pts, uint32_t n, int32_t w, lv_color_t color)
{
    lv_obj_t *l = lv_line_create(parent);
    lv_line_set_points(l, pts, n);
    lv_obj_set_style_line_width(l, w, 0);
    lv_obj_set_style_line_color(l, color, 0);
    lv_obj_set_style_line_rounded(l, true, 0);
    lv_obj_remove_flag(l, LV_OBJ_FLAG_CLICKABLE);
    return l;
}

lv_obj_t *chevron(lv_obj_t *parent, bool right, lv_color_t color)
{
    static const lv_point_precise_t r[] = {{2, 0}, {9, 7}, {2, 14}};
    static const lv_point_precise_t l[] = {{9, 0}, {2, 7}, {9, 14}};
    return polyline(parent, right ? r : l, 3, 3, color);
}

lv_obj_t *arrow_right(lv_obj_t *parent, lv_color_t color)
{
    lv_obj_t *o = box(parent, 0, 0, 18, 12);
    static const lv_point_precise_t shaft[] = {{1, 6}, {16, 6}};
    static const lv_point_precise_t head[] = {{11, 1}, {16, 6}, {11, 11}};
    polyline(o, shaft, 2, 2, color);
    polyline(o, head, 3, 2, color);
    return o;
}

lv_obj_t *map_mark(lv_obj_t *parent, lv_color_t color)
{
    lv_obj_t *o = box(parent, 0, 0, 26, 24);
    static const lv_point_precise_t outline[] = {{2, 5}, {9, 2}, {17, 5}, {24, 2}, {24, 19}, {17, 22}, {9, 19}, {2, 22}, {2, 5}};
    static const lv_point_precise_t fold1[] = {{9, 2}, {9, 19}};
    static const lv_point_precise_t fold2[] = {{17, 5}, {17, 22}};
    polyline(o, outline, 9, 2, color);
    polyline(o, fold1, 2, 2, color);
    polyline(o, fold2, 2, 2, color);
    return o;
}
