/**
 * The walk's map: the city map, isometric as on the free map (mapview.c),
 * centred on you, with the walk's route in vermilion along the streets it
 * takes, its stops numbered (collected in blue, the one you're making for in
 * vermilion and larger, the rest on paper), and the slip at the top saying
 * where you're going and how far, from where the GNSS puts you. Without a fix
 * it centres on the stop you're making for. + and − on the left.
 *
 * It comes over whatever you were on, a story playing on under it, and the
 * lower button goes back to exactly that.
 */
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include "mapview.h"
#include "motion.h"
#include "position.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define CENTRE (SCREEN_W / 2)
#define TICK_MS 1000
#define WALK_MPS 1.4
#define METRES_PER_MIN 80

/* Kept between visits: how close in. */
static int zoom = MAPVIEW_ZOOM_MAX - 1;

typedef struct {
    mapview_t *map;
    lv_obj_t *route, *stops, *you, *kick, *name, *meta;
    lv_point_precise_t *pts;
    int laid_zoom;
    float cx, cy; /* where the centre was laid, to tell when you've moved */
    lv_timer_t *timer;
} walkmap_t;

static walkmap_t *wm; /* the one showing */

static void lay(walkmap_t *m)
{
    const walk_t *w = walk_now();
    for (int i = 0; i < w->route_len; i++) {
        float x, y;
        mapview_project(m->map, w->route[i * 2] / 1e6, w->route[i * 2 + 1] / 1e6, &x, &y);
        m->pts[i] = (lv_point_precise_t){x, y};
    }
    lv_line_set_points_mutable(m->route, m->pts, w->route_len);

    lv_obj_clean(m->stops);
    int at = walk_at();
    /* The one you're making for last, so it's on top. */
    for (int i = 0; i < w->stop_count; i++) {
        int k = i < at ? i : i == w->stop_count - 1 ? at : i + 1;
        float x, y;
        mapview_project(m->map, w->stops[k].lat_e6 / 1e6, w->stops[k].lon_e6 / 1e6, &x, &y);
        bool now = k == at, got = walk_collected(k);
        int d = now ? 34 : 26;
        lv_obj_t *dot = stop_dot(m->stops, d, k + 1, now ? C_VERMILION : got ? C_BLUE : C_SLIP, now || got ? C_CREAM : C_BLUE);
        lv_obj_set_pos(dot, (int32_t)x - d / 2, (int32_t)y - d / 2);
        lv_obj_set_style_border_width(dot, 2, 0);
        lv_obj_set_style_border_color(dot, now || got ? C_SLIP : C_BLUE, 0);
    }
}

static void refresh(walkmap_t *m, bool relay)
{
    walk_nav_t n = walk_nav();
    position_t p = position_now();
    const stop_t *s = walk_stop();
    double lat = p.known ? p.lat : s->lat_e6 / 1e6, lon = p.known ? p.lon : s->lon_e6 / 1e6;
    float x, y;
    mapview_project(m->map, lat, lon, &x, &y);
    if (relay || m->laid_zoom != zoom || fabsf(x - CENTRE) >= 1 || fabsf(y - CENTRE) >= 1) {
        mapview_set(m->map, lat, lon, zoom);
        m->laid_zoom = zoom;
        lay(m);
    }
    if (p.known) lv_obj_remove_flag(m->you, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(m->you, LV_OBJ_FLAG_HIDDEN);

    lv_label_set_text_fmt(m->kick, "%s \xC2\xB7 STOP %d OF %d", n.here ? "YOU'RE HERE" : "NEXT", walk_at() + 1, walk_now()->stop_count);
    if (n.here) lv_label_set_text(m->meta, "At the door");
    else if (!n.located) lv_label_set_text(m->meta, "Finding you");
    else lv_label_set_text_fmt(m->meta, "%d m \xC2\xB7 %d min", n.metres, LV_MAX(1, (n.metres + METRES_PER_MIN / 2) / METRES_PER_MIN));
}

static void tick(lv_timer_t *t)
{
    walkmap_t *m = lv_timer_get_user_data(t);
    walk_pretend_step(WALK_MPS * TICK_MS / 1000.0);
    refresh(m, false);
}

static void zoom_by(lv_event_t *e)
{
    int z = LV_CLAMP(MAPVIEW_ZOOM_MIN, zoom + (int)(intptr_t)lv_event_get_user_data(e), MAPVIEW_ZOOM_MAX);
    if (z == zoom || !wm) return;
    zoom = z;
    refresh(wm, true);
}

static void gone(lv_event_t *e)
{
    walkmap_t *m = lv_event_get_user_data(e);
    lv_timer_delete(m->timer);
    if (wm == m) wm = NULL;
    lv_free(m->pts);
    lv_free(m);
}

/** You: a vermilion ring with a dot, a pulse spreading from it. */
static lv_obj_t *you_mark(lv_obj_t *scr)
{
    lv_obj_t *you = box(scr, CENTRE - 55, CENTRE - 55, 110, 110);
    lv_obj_t *pulse = disc(you, 40, 40, 30, C_VERMILION);
    motion_loop(pulse, KF({0, 30}, {300, 72}, {600, 96}, {1000, 108}), 2200, 0, m_size);
    motion_loop(pulse, KF({0, 128}, {300, 64}, {600, 24}, {1000, 0}), 2200, 0, m_bg_opa);
    lv_obj_t *ring = disc(you, 43, 43, 24, C_PAPER);
    lv_obj_set_style_border_width(ring, 4, 0);
    lv_obj_set_style_border_color(ring, C_VERMILION, 0);
    disc(you, 50, 50, 10, C_VERMILION);
    return you;
}

lv_obj_t *screen_map(void)
{
    const walk_t *w = walk_now();
    walkmap_t *m = lv_malloc(sizeof(walkmap_t));
    lv_memzero(m, sizeof(*m));
    m->pts = lv_malloc(sizeof(lv_point_precise_t) * LV_MAX(1, w->route_len));
    m->laid_zoom = -1;
    wm = m;
    lv_obj_t *scr = ui_screen(C_PAPER);
    m->map = mapview_create(scr);

    m->route = lv_line_create(scr);
    lv_obj_set_style_line_width(m->route, 6, 0);
    lv_obj_set_style_line_color(m->route, C_VERMILION, 0);
    lv_obj_set_style_line_opa(m->route, 210, 0);
    lv_obj_set_style_line_rounded(m->route, true, 0);
    m->stops = box(scr, 0, 0, SCREEN_W, SCREEN_H);
    m->you = you_mark(scr);

    /* The slip at the top: where you're going, and how far. */
    lv_obj_t *s = slip(scr, 125, 28, 216, LV_SIZE_CONTENT); /* above the upper tab, inside the circle */
    lv_obj_set_style_pad_ver(s, 5, 0);
    lv_obj_set_style_pad_row(s, 1, 0);
    lv_obj_set_flex_flow(s, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    m->kick = text_in(s, &jost_medium_14, C_BLUE, "");
    lv_obj_set_style_text_letter_space(m->kick, 3, 0);
    m->name = text_in(s, &jost_regular_18, C_CHARCOAL, walk_stop()->name);
    lv_obj_set_width(m->name, 196);
    lv_obj_set_style_text_align(m->name, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(m->name, LV_LABEL_LONG_MODE_DOTS);
    m->meta = text_in(s, &jost_regular_15, C_SEPIA, "");

    zoom_button(scr, 150, 1, zoom_by);
    zoom_button(scr, 262, -1, zoom_by);

    refresh(m, true);
    m->timer = lv_timer_create(tick, TICK_MS, m);
    lv_obj_add_event_cb(scr, gone, LV_EVENT_DELETE, m);

    ui_hints(scr, 0xFAF6EC, NULL, "BACK");
    return scr;
}
