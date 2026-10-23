/**
 * The map: the walk's route drawn north-up from its stops (each one's
 * distance and bearing from the stop before), the stops collected filled in,
 * the next one flagged, and you on the way to it (a pulsing mark and the way
 * you face). Until the GNSS (Phase 4), where you are is reckoned from the
 * simulated distance left. The dark tile map (Phase 6) takes over from this.
 */
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include "motion.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* The route fits in this box, under the slip, above Back and clear of the lower button's tab. */
#define ROUTE_X1 78
#define ROUTE_Y1 116
#define ROUTE_X2 388
#define ROUTE_Y2 306
#define MAX_PX_PER_M 0.8f

#define FLAG_H 46
#define MAX_STOPS 16

/* The way you face: a wedge from the mark, swaying as you walk. */
#define WEDGE_BOX 120

/** Where each stop falls on the screen, north up, fitted to the route's box. */
static void lay_out(const walk_t *w, lv_point_precise_t *pts, float *px_per_m)
{
    float x[MAX_STOPS], y[MAX_STOPS], x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    int n = LV_MIN(w->stop_count, MAX_STOPS);
    for (int i = 0; i < n; i++) {
        float r = (float)w->stops[i].bearing * (float)M_PI / 180.0f, m = w->stops[i].metres;
        x[i] = i ? x[i - 1] + m * sinf(r) : 0;
        y[i] = i ? y[i - 1] - m * cosf(r) : 0;
        x1 = fminf(x1, x[i]), x2 = fmaxf(x2, x[i]);
        y1 = fminf(y1, y[i]), y2 = fmaxf(y2, y[i]);
    }
    float k = fminf((ROUTE_X2 - ROUTE_X1) / fmaxf(x2 - x1, 1), (ROUTE_Y2 - ROUTE_Y1) / fmaxf(y2 - y1, 1));
    k = fminf(k, MAX_PX_PER_M);
    float ox = (ROUTE_X1 + ROUTE_X2) / 2.0f - (x1 + x2) / 2 * k, oy = (ROUTE_Y1 + ROUTE_Y2) / 2.0f - (y1 + y2) / 2 * k;
    for (int i = 0; i < n; i++) {
        pts[i].x = ox + x[i] * k;
        pts[i].y = oy + y[i] * k;
    }
    *px_per_m = k;
}

static void wedge_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    int32_t deg10 = (int32_t)(intptr_t)lv_obj_get_user_data(o);
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    float cx = (a.x1 + a.x2 + 1) / 2.0f, cy = (a.y1 + a.y2 + 1) / 2.0f;
    float r = (float)deg10 * 3.14159265f / 1800.0f, c = cosf(r), s = sinf(r);
    static const float pts[3][2] = {{0, 0}, {32, -42}, {14, -46}};
    lv_draw_triangle_dsc_t d;
    lv_draw_triangle_dsc_init(&d);
    d.color = C_VERMILION;
    d.opa = LV_OPA_50;
    for (int i = 0; i < 3; i++) {
        d.p[i].x = cx + pts[i][0] * c - pts[i][1] * s;
        d.p[i].y = cy + pts[i][0] * s + pts[i][1] * c;
    }
    lv_draw_triangle(lv_event_get_layer(e), &d);
}

static void m_wedge(lv_obj_t *o, int32_t v)
{
    v -= v % 5;
    if ((int32_t)(intptr_t)lv_obj_get_user_data(o) == v) return;
    lv_obj_set_user_data(o, (void *)(intptr_t)v);
    lv_obj_invalidate(o);
}

/* The flag: a swallowtail in vermilion whose tail flutters. */
static void flag_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    int32_t tail = (int32_t)(intptr_t)lv_obj_get_user_data(o);
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    lv_layer_t *layer = lv_event_get_layer(e);

    lv_draw_rect_dsc_t r;
    lv_draw_rect_dsc_init(&r);
    r.bg_color = C_VERMILION;
    lv_area_t cloth = {a.x1, a.y1, a.x1 + 24, a.y1 + 21};
    lv_draw_rect(layer, &r, &cloth);

    lv_draw_triangle_dsc_t d;
    lv_draw_triangle_dsc_init(&d);
    d.color = C_VERMILION;
    float x = a.x1 + 25, y = a.y1;
    d.p[0].x = x, d.p[0].y = y;
    d.p[1].x = x + tail, d.p[1].y = y;
    d.p[2].x = x, d.p[2].y = y + 11;
    lv_draw_triangle(layer, &d);
    d.p[0].x = x, d.p[0].y = y + 11;
    d.p[1].x = x + tail, d.p[1].y = y + 22;
    d.p[2].x = x, d.p[2].y = y + 22;
    lv_draw_triangle(layer, &d);
}

static void m_flag(lv_obj_t *o, int32_t v)
{
    if ((int32_t)(intptr_t)lv_obj_get_user_data(o) == v) return;
    lv_obj_set_user_data(o, (void *)(intptr_t)v);
    lv_obj_invalidate(o);
}

static void north_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    float cx = (a.x1 + a.x2 + 1) / 2.0f, cy = (a.y1 + a.y2 + 1) / 2.0f;
    lv_draw_triangle_dsc_t d;
    lv_draw_triangle_dsc_init(&d);
    d.color = C_BLUE;
    d.p[0].x = cx - 8, d.p[0].y = cy - 8;
    d.p[1].x = cx + 4, d.p[1].y = cy - 2;
    d.p[2].x = cx - 2, d.p[2].y = cy + 4;
    lv_draw_triangle(lv_event_get_layer(e), &d);
}

static lv_obj_t *custom(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h, lv_event_cb_t draw)
{
    lv_obj_t *o = box(parent, x, y, w, h);
    lv_obj_add_event_cb(o, draw, LV_EVENT_DRAW_MAIN, NULL);
    return o;
}

/* The label at the top names whichever stop was touched last (the one you're walking to, to begin with). */
static lv_obj_t *label_kick, *label_name;

static void name_stop(int i)
{
    const walk_t *w = walk_now();
    lv_label_set_text_fmt(label_kick, "STOP %d OF %d", i + 1, w->stop_count);
    lv_label_set_text(label_name, w->stops[i].name);
}

static void stop_touched(lv_event_t *e)
{
    name_stop((int)(intptr_t)lv_event_get_user_data(e));
}

/** A ruler for the route: the longest round distance that fits in about 90 px. */
static void scale_bar(lv_obj_t *scr, float px_per_m)
{
    static const int steps[] = {20, 50, 100, 200, 500, 1000, 2000};
    int m = steps[0];
    for (size_t i = 0; i < sizeof steps / sizeof *steps; i++) {
        if ((float)steps[i] * px_per_m <= 90) m = steps[i];
    }
    int32_t len = (int32_t)((float)m * px_per_m);
    lv_obj_t *bar = box(scr, 120, 366, len, 3);
    lv_obj_set_style_bg_color(bar, C_BLUE, 0);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
    for (int e = 0; e < 2; e++) {
        lv_obj_t *tick = box(scr, 120 + e * (len - 2), 360, 2, 14);
        lv_obj_set_style_bg_color(tick, C_BLUE, 0);
        lv_obj_set_style_bg_opa(tick, LV_OPA_COVER, 0);
    }
    if (m >= 1000) lv_label_set_text_fmt(text_at(scr, &jost_medium_16, C_BLUE, 120 + len + 10, 356, ""), "%d km", m / 1000);
    else lv_label_set_text_fmt(text_at(scr, &jost_medium_16, C_BLUE, 120 + len + 10, 356, ""), "%d m", m);
}

lv_obj_t *screen_map(void)
{
    const walk_t *w = walk_now();
    const stop_t *stop = walk_stop();
    int at = walk_at(), n = LV_MIN(w->stop_count, MAX_STOPS);
    lv_obj_t *scr = ui_screen(C_PAPER);

    /* The route, and its stops: collected filled in, the rest open. */
    static lv_point_precise_t pts[MAX_STOPS];
    float k;
    lay_out(w, pts, &k);
    lv_obj_t *route = lv_line_create(scr);
    lv_line_set_points_mutable(route, pts, n);
    lv_obj_set_style_line_width(route, 3, 0);
    lv_obj_set_style_line_color(route, C_BLUE_TINT, 0);
    lv_obj_set_style_line_rounded(route, true, 0);
    for (int i = 0; i < n; i++) {
        if (i == at) continue;
        bool got = walk_collected(i);
        lv_obj_t *d = disc(scr, (int32_t)pts[i].x - 11, (int32_t)pts[i].y - 11, 22, got ? C_BLUE : C_SLIP);
        lv_obj_set_style_border_width(d, 2, 0);
        lv_obj_set_style_border_color(d, C_BLUE, 0);
        lv_obj_t *num = text_in(d, &jost_medium_14, got ? C_SLIP : C_BLUE, "");
        lv_label_set_text_fmt(num, "%d", i + 1);
        lv_obj_center(num);
        lv_obj_add_flag(d, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_ext_click_area(d, 12);
        lv_obj_add_event_cb(d, stop_touched, LV_EVENT_CLICKED, (void *)(intptr_t)i);
    }

    /* You: on the way from the stop before, as far along as the distance left says. */
    lv_point_precise_t to = pts[at];
    float left = (float)walk_metres_left() * k;
    float r = (float)stop->bearing * (float)M_PI / 180.0f;
    int32_t me_x = (int32_t)(to.x - left * sinf(r)), me_y = (int32_t)(to.y + left * cosf(r));
    me_x = LV_CLAMP(60, me_x, SCREEN_W - 60), me_y = LV_CLAMP(100, me_y, 370);
    static lv_point_precise_t leg[2];
    leg[0].x = me_x, leg[0].y = me_y, leg[1].x = to.x, leg[1].y = to.y;
    lv_obj_t *leg_line = lv_line_create(scr);
    lv_line_set_points_mutable(leg_line, leg, 2);
    lv_obj_set_style_line_width(leg_line, 4, 0);
    lv_obj_set_style_line_color(leg_line, C_VERMILION, 0);
    lv_obj_set_style_line_rounded(leg_line, true, 0);
    lv_obj_t *pulse_box = box(scr, me_x - 55, me_y - 55, 110, 110);
    lv_obj_t *pulse = disc(pulse_box, 40, 40, 30, C_VERMILION);
    motion_loop(pulse, KF({0, 30}, {300, 72}, {600, 96}, {1000, 108}), 2200, 0, m_size);
    motion_loop(pulse, KF({0, 128}, {300, 64}, {600, 24}, {1000, 0}), 2200, 0, m_bg_opa);
    lv_obj_t *wedge = custom(scr, me_x - WEDGE_BOX / 2, me_y - WEDGE_BOX / 2, WEDGE_BOX, WEDGE_BOX, wedge_draw);
    /* The wedge is drawn leaning 28 degrees right of its own up; turned to face the stop, swaying. */
    int16_t face = (int16_t)(stop->bearing * 10 - 276);
    motion_loop(wedge, KF({0, (int16_t)(face - 70)}, {500, (int16_t)(face + 70)}, {1000, (int16_t)(face - 70)}), 3600, 0, m_wedge);
    lv_obj_t *me = disc(scr, me_x - 12, me_y - 12, 24, C_PAPER);
    lv_obj_set_style_border_width(me, 4, 0);
    lv_obj_set_style_border_color(me, C_VERMILION, 0);
    disc(scr, me_x - 5, me_y - 5, 10, C_VERMILION);

    /* The next stop's flag, its pole's foot on the stop. */
    int32_t fx = (int32_t)to.x, fy = (int32_t)to.y;
    lv_obj_t *pole = box(scr, fx - 1, fy - FLAG_H, 3, FLAG_H);
    lv_obj_set_style_bg_color(pole, C_BLUE, 0);
    lv_obj_set_style_bg_opa(pole, LV_OPA_COVER, 0);
    lv_obj_t *flag = custom(scr, fx, fy - FLAG_H, 34, 23, flag_draw);
    motion_loop(flag, KF({0, 7}, {500, 3}, {1000, 7}), 1600, 0, m_flag);
    char num[4];
    snprintf(num, sizeof num, "%d", at + 1);
    lv_obj_t *nl = text_in(flag, &jost_medium_16, C_SLIP, num);
    lv_obj_set_pos(nl, at + 1 >= 10 ? 4 : 9, 2);
    disc(scr, fx - 4, fy - 4, 8, C_BLUE);

    /* North is up; the rose rocks a little all the same. */
    lv_obj_t *north = disc(scr, 86 - 19, 132 - 19, 38, C_SLIP);
    lv_obj_set_style_border_width(north, 2, 0);
    lv_obj_set_style_border_color(north, C_BLUE, 0);
    lv_obj_t *needle = custom(north, 0, 0, 34, 34, north_draw);
    lv_obj_center(needle);
    lv_obj_set_pos(text_in(north, &jost_regular_16, C_BLUE, "N"), 5, 3);
    motion_loop(north, KF({0, 0}, {500, -60}, {1000, 0}), 9000, 0, m_turn);

    lv_obj_t *where = slip(scr, 108, 40, 250, 62);
    lv_obj_set_style_radius(where, 4, 0);
    lv_obj_set_flex_flow(where, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(where, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    label_kick = text_in(where, &jost_medium_16, C_BLUE, "");
    lv_obj_set_style_text_letter_space(label_kick, 3, 0);
    label_name = text_in(where, &jost_regular_18, C_CHARCOAL, "");
    lv_obj_set_width(label_name, 226);
    lv_obj_set_style_text_align(label_name, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(label_name, LV_LABEL_LONG_MODE_DOTS);
    name_stop(at);
    motion_once(where, 0, 255, 500, 300, m_opa);
    motion_once(where, -14, 0, 500, 300, m_y);

    scale_bar(scr, k);

    ui_hints(scr, 0xFAF6EC, NULL, "BACK");
    return scr;
}
