/**
 * The walk's map: the city map, isometric as on the free map (mapview.c),
 * with the walk's route faint along the streets it takes, its stops numbered
 * (collected in blue, the one you're making for in vermilion and larger, the
 * rest on paper), and the slip at the top saying where you're going and how
 * far, from where the GNSS puts you. You and the stop you're making for are
 * framed together, the map closing in as you near it, with the way between
 * you drawn strong: along the route while you're on it, else a dotted line
 * straight to the stop (the guide knows no streets off its routes). + or −
 * (on the left) takes the framing over: then the map keeps to you at that
 * zoom. Without a fix it frames the stop alone.
 *
 * It comes over whatever you were on, a story playing on under it, and the
 * lower button goes back to exactly that. Opened from Walks, it shows the walk
 * being chosen instead: all its stops, with you if you're near, the first in
 * vermilion, and how far that is.
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
#define NEAR_M 1500 /* a walk not yet begun is framed with you if you're this near one of its stops */
#define REFRAME_M 4 /* framing you and the stop, the map follows once you've gone this far */
/* Off the route, the way is dots straight to the stop, this far apart (LVGL dashes only level lines). */
#define CROW_DOTS 48
#define CROW_STEP 15

/* Kept between visits: how close in. */
static int zoom = MAPVIEW_ZOOM_MAX - 1;

typedef struct {
    bool preview; /* a walk being chosen, not the one under way */
    bool framed;  /* you and the stop framed together, until + or − */
    int marked;   /* the stop in vermilion: the one you're making for, or the first */
    mapview_t *map;
    lv_obj_t *route, *way, *crow, *stops, *you, *kick, *name, *meta;
    lv_point_precise_t *pts, *way_pts;
    int32_t *way_e6; /* the way ahead (walk_way), lat, lon pairs */
    int way_n;
    bool along;      /* the way is along the route, not straight to the stop */
    int laid_zoom;
    double fit_lat, fit_lon; /* where you were when last framed */
    lv_timer_t *timer;
} walkmap_t;

static walkmap_t *wm; /* the one showing */

static int way_max(void)
{
    return walk_now()->route_len + 2;
}

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
    int at = m->marked;
    /* The one you're making for last, so it's on top. */
    for (int i = 0; i < w->stop_count; i++) {
        int k = i < at ? i : i == w->stop_count - 1 ? at : i + 1;
        float x, y;
        mapview_project(m->map, w->stops[k].lat_e6 / 1e6, w->stops[k].lon_e6 / 1e6, &x, &y);
        bool now = k == at, got = !m->preview && walk_collected(k);
        int d = now ? 34 : 26;
        lv_obj_t *dot = stop_dot(m->stops, d, k + 1, now ? C_VERMILION : got ? C_BLUE : C_SLIP, now || got ? C_CREAM : C_BLUE);
        lv_obj_set_pos(dot, (int32_t)x - d / 2, (int32_t)y - d / 2);
        lv_obj_set_style_border_width(dot, 2, 0);
        lv_obj_set_style_border_color(dot, now || got ? C_SLIP : C_BLUE, 0);
    }
}

/** The way ahead, as the map lies now: a line along the route, or dots straight to the stop. */
static void lay_way(walkmap_t *m)
{
    for (int i = 0; i < m->way_n; i++) {
        float x, y;
        mapview_project(m->map, m->way_e6[i * 2] / 1e6, m->way_e6[i * 2 + 1] / 1e6, &x, &y);
        m->way_pts[i] = (lv_point_precise_t){x, y};
    }
    lv_line_set_points_mutable(m->way, m->way_pts, m->along ? m->way_n : 0);
    int shown = 0;
    if (!m->along && m->way_n == 2) {
        float x0 = m->way_pts[0].x, y0 = m->way_pts[0].y, dx = m->way_pts[1].x - x0, dy = m->way_pts[1].y - y0;
        float len = sqrtf(dx * dx + dy * dy);
        /* From a step clear of your ring to a step short of the stop's dot. */
        for (float d = 18; d < len - 14 && shown < CROW_DOTS; d += CROW_STEP, shown++) {
            lv_obj_t *dot = lv_obj_get_child(m->crow, shown);
            lv_obj_set_pos(dot, (int32_t)lroundf(x0 + dx * d / len) - 5, (int32_t)lroundf(y0 + dy * d / len) - 5);
            lv_obj_remove_flag(dot, LV_OBJ_FLAG_HIDDEN);
        }
    }
    for (int i = shown; i < CROW_DOTS; i++) lv_obj_add_flag(lv_obj_get_child(m->crow, i), LV_OBJ_FLAG_HIDDEN);
}

/** A walk being chosen: all its stops framed, with you if you're near one; then as zoomed. */
static void preview(walkmap_t *m, bool fit)
{
    const walk_t *w = walk_now();
    const stop_t *s = &w->stops[m->marked];
    position_t p = position_now();
    int metres = p.known ? walk_metres_from_start(w, p.lat, p.lon) : -1;
    if (fit) {
        int32_t pts[(32 + 1) * 2];
        int n = 0, nearest = -1;
        for (int k = 0; k < w->stop_count && k < 32; k++) {
            pts[n * 2] = w->stops[k].lat_e6, pts[n * 2 + 1] = w->stops[k].lon_e6, n++;
            if (p.known) {
                int d = (int)position_metres(p.lat, p.lon, w->stops[k].lat_e6 / 1e6, w->stops[k].lon_e6 / 1e6);
                if (nearest < 0 || d < nearest) nearest = d;
            }
        }
        if (nearest >= 0 && nearest <= NEAR_M) pts[n * 2] = (int32_t)(p.lat * 1e6), pts[n * 2 + 1] = (int32_t)(p.lon * 1e6), n++;
        lv_area_t box = {96, 128, 370, 380};
        mapview_fit(m->map, pts, n, &box, MAPVIEW_ZOOM_MAX - 1);
        zoom = mapview_zoom(m->map);
    } else {
        mapview_set(m->map, s->lat_e6 / 1e6, s->lon_e6 / 1e6, zoom);
    }
    m->laid_zoom = zoom;
    lay(m);
    if (p.known) {
        float x, y;
        mapview_project(m->map, p.lat, p.lon, &x, &y);
        lv_obj_set_pos(m->you, (int32_t)x - 55, (int32_t)y - 55);
        lv_obj_remove_flag(m->you, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(m->you, LV_OBJ_FLAG_HIDDEN);
    }
    lv_label_set_text_fmt(m->kick, "WALK %02d \xC2\xB7 %d STOPS", ui_walk + 1, w->stop_count);
    char far[16];
    walk_distance_words(metres, far, sizeof far);
    if (metres < 0) lv_label_set_text_fmt(m->meta, "Starts at %s", s->name);
    else lv_label_set_text_fmt(m->meta, "Starts %s from you", far);
}

static void refresh(walkmap_t *m, bool relay)
{
    if (m->preview) {
        if (relay) preview(m, false);
        return;
    }
    walk_nav_t n = walk_nav();
    position_t p = position_now();
    const stop_t *s = walk_stop();
    m->way_n = walk_way(m->way_e6, way_max(), &m->along);
    if (m->framed) {
        bool moved = p.known && position_metres(p.lat, p.lon, m->fit_lat, m->fit_lon) >= REFRAME_M;
        if (relay || moved) {
            int32_t pts[] = {s->lat_e6, s->lon_e6, (int32_t)(p.lat * 1e6), (int32_t)(p.lon * 1e6)};
            lv_area_t box = {104, 136, 362, 392}; /* clear of the slip, the zoom buttons and the tab */
            mapview_fit(m->map, pts, p.known ? 2 : 1, &box, MAPVIEW_ZOOM_MAX);
            zoom = mapview_zoom(m->map);
            m->laid_zoom = zoom;
            m->fit_lat = p.lat, m->fit_lon = p.lon;
            lay(m);
        }
    } else {
        double lat = p.known ? p.lat : s->lat_e6 / 1e6, lon = p.known ? p.lon : s->lon_e6 / 1e6;
        float x, y;
        mapview_project(m->map, lat, lon, &x, &y);
        if (relay || m->laid_zoom != zoom || fabsf(x - CENTRE) >= 1 || fabsf(y - CENTRE) >= 1) {
            mapview_set(m->map, lat, lon, zoom);
            m->laid_zoom = zoom;
            lay(m);
        }
    }
    lay_way(m);
    if (p.known) {
        float x, y;
        mapview_project(m->map, p.lat, p.lon, &x, &y);
        lv_obj_set_pos(m->you, (int32_t)x - 55, (int32_t)y - 55);
        lv_obj_remove_flag(m->you, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(m->you, LV_OBJ_FLAG_HIDDEN);
    }

    lv_label_set_text_fmt(m->kick, "%s \xC2\xB7 STOP %d OF %d", n.here ? "YOU'RE HERE" : "NEXT", walk_at() + 1, walk_now()->stop_count);
    if (n.here) lv_label_set_text(m->meta, "At the door");
    else if (!n.located) lv_label_set_text(m->meta, "Finding you");
    else {
        char far[16];
        walk_distance_words(n.metres, far, sizeof far);
        lv_label_set_text_fmt(m->meta, "%s \xC2\xB7 %d min", far, LV_MAX(1, (n.metres + METRES_PER_MIN / 2) / METRES_PER_MIN));
    }
}

static void tick(lv_timer_t *t)
{
    walkmap_t *m = lv_timer_get_user_data(t);
    if (m->preview) return;
    walk_pretend_step(WALK_MPS * TICK_MS / 1000.0);
    refresh(m, false);
}

static void zoom_by(lv_event_t *e)
{
    int z = LV_CLAMP(MAPVIEW_ZOOM_MIN, zoom + (int)(intptr_t)lv_event_get_user_data(e), MAPVIEW_ZOOM_MAX);
    if (z == zoom || !wm) return;
    zoom = z;
    wm->framed = false; /* yours now: the map keeps to you at this zoom */
    refresh(wm, true);
}

static void gone(lv_event_t *e)
{
    walkmap_t *m = lv_event_get_user_data(e);
    lv_timer_delete(m->timer);
    if (wm == m) wm = NULL;
    lv_free(m->pts);
    lv_free(m->way_pts);
    lv_free(m->way_e6);
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
    m->way_pts = lv_malloc(sizeof(lv_point_precise_t) * way_max());
    m->way_e6 = lv_malloc(sizeof(int32_t) * 2 * way_max());
    m->laid_zoom = -1;
    m->preview = ui_map_over() == SCR_WALKS;
    m->framed = !m->preview;
    m->marked = m->preview ? 0 : walk_at();
    wm = m;
    lv_obj_t *scr = ui_screen(C_PAPER);
    m->map = mapview_create(scr);

    m->route = lv_line_create(scr);
    lv_obj_set_style_line_width(m->route, 6, 0);
    lv_obj_set_style_line_color(m->route, C_VERMILION, 0);
    lv_obj_set_style_line_opa(m->route, m->preview ? 210 : 110, 0);
    lv_obj_set_style_line_rounded(m->route, true, 0);
    /* The way ahead, strong over the route: yours to take. */
    m->way = lv_line_create(scr);
    lv_obj_set_style_line_width(m->way, 7, 0);
    lv_obj_set_style_line_color(m->way, C_VERMILION, 0);
    lv_obj_set_style_line_rounded(m->way, true, 0);
    m->crow = box(scr, 0, 0, SCREEN_W, SCREEN_H);
    for (int i = 0; i < CROW_DOTS; i++) {
        lv_obj_t *dot = disc(m->crow, 0, 0, 10, C_VERMILION);
        lv_obj_add_flag(dot, LV_OBJ_FLAG_HIDDEN);
    }
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
    m->name = text_in(s, &jost_regular_18, C_CHARCOAL, m->preview ? w->name : w->stops[m->marked].name);
    lv_obj_set_width(m->name, 196);
    lv_obj_set_style_text_align(m->name, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(m->name, LV_LABEL_LONG_MODE_DOTS);
    m->meta = text_in(s, &jost_regular_15, C_SEPIA, "");

    zoom_button(scr, 150, 1, zoom_by);
    zoom_button(scr, 262, -1, zoom_by);

    if (m->preview) preview(m, true);
    else refresh(m, true);
    m->timer = lv_timer_create(tick, TICK_MS, m);
    lv_obj_add_event_cb(scr, gone, LV_EVENT_DELETE, m);

    ui_hints(scr, 0xFAF6EC, NULL, "BACK");
    return scr;
}
