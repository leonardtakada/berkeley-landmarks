/**
 * Choosing a walk, and where to begin it. Each walk shows on the city map
 * (isometric, as the walk's own map): its route, its stops numbered, framed
 * on the stop to begin at with the stops either side of it and you, if you're
 * near. Its name is on a slip at the top, and the arrows either side turn to
 * the next walk (or swipe). With a fix the walks come nearest first, by
 * whichever of their stops is nearest, and each opens on that stop as where
 * to begin: the slip below names it and says how far, and its ‹ › choose
 * another, the map following. A walk begun part way goes on to its end, then round to the
 * stops it skipped. The upper button (START) sets out; the lower goes back.
 */
#include <stdio.h>
#include <stdlib.h>
#include "ui.h"
#include "data.h"
#include "mapview.h"
#include "motion.h"
#include "position.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* A drag this far across turns to the next walk; anything less is let go. */
#define TURN_PX 50
/* You're put in the route's frame if you're this near it; further off, the slip says how far. */
#define NEAR_M 1500

/* Where each walk's dot sits, following the rim at the foot of the circle. */
static const lv_point_t spots[WALK_COUNT] = {
    {128, 415}, {145, 424}, {163, 430}, {181, 436}, {200, 439}, {219, 441},
    {239, 441}, {258, 439}, {277, 436}, {295, 430}, {313, 424}, {330, 415},
};

/* There's one chooser at a time, so its parts live here. */
static struct {
    lv_obj_t *scr, *layer; /* layer: what's rebuilt for each walk */
    mapview_t *map;
    lv_obj_t *dots[WALK_COUNT];
    lv_obj_t *route, *stops, *you; /* on the map */
    lv_point_precise_t *pts;       /* the route's, freed with its line */
    lv_obj_t *begin_kick, *begin_name, *begin_meta;
    lv_point_t pressed_at;
} ch;

/* The walks in the order shown (nearest first, with a fix), where you are in it, and for each walk
 * its nearest stop and how far that is (−1: not known). */
static int order[WALK_COUNT], shown;
static int nearest[WALK_COUNT], away[WALK_COUNT];
static int begin_at; /* the stop chosen to begin at, on the walk showing */

static void show_walk(int pos);

/* --- Where to begin ----------------------------------------------------------------- */

static int metres_to(const stop_t *s)
{
    position_t p = position_now();
    return p.known ? (int)position_metres(p.lat, p.lon, s->lat_e6 / 1e6, s->lon_e6 / 1e6) : -1;
}

static void lay_stops(void)
{
    const walk_t *w = &walks[ui_walk];
    lv_obj_clean(ch.stops);
    /* The stop to begin at last, so it's on top. */
    for (int i = 0; i < w->stop_count; i++) {
        int k = i < begin_at ? i : i == w->stop_count - 1 ? begin_at : i + 1;
        float x, y;
        mapview_project(ch.map, w->stops[k].lat_e6 / 1e6, w->stops[k].lon_e6 / 1e6, &x, &y);
        bool chosen = k == begin_at;
        int d = chosen ? 32 : 22;
        lv_obj_t *dot = stop_dot(ch.stops, d, k + 1, chosen ? C_VERMILION : C_SLIP, chosen ? C_CREAM : C_BLUE);
        lv_obj_set_pos(dot, (int32_t)x - d / 2, (int32_t)y - d / 2);
        lv_obj_set_style_border_width(dot, 2, 0);
        lv_obj_set_style_border_color(dot, chosen ? C_SLIP : C_BLUE, 0);
    }
}

/** The stop to begin at framed with you, if you're near (else with the stop after it); the route and stops laid on. */
static void frame(void)
{
    const walk_t *w = &walks[ui_walk];
    const stop_t *s = &w->stops[begin_at], *next = &w->stops[(begin_at + 1) % w->stop_count];
    position_t p = position_now();
    bool you_in = p.known && metres_to(s) <= NEAR_M;
    int32_t pts[] = {s->lat_e6, s->lon_e6, you_in ? (int32_t)(p.lat * 1e6) : next->lat_e6, you_in ? (int32_t)(p.lon * 1e6) : next->lon_e6};
    lv_area_t box = {80, 106, 292, 230}; /* left of the upper tab, between the slips */
    mapview_fit(ch.map, pts, 2, &box, MAPVIEW_ZOOM_MAX - 1);

    for (int i = 0; i < w->route_len; i++) {
        float x, y;
        mapview_project(ch.map, w->route[i * 2] / 1e6, w->route[i * 2 + 1] / 1e6, &x, &y);
        ch.pts[i] = (lv_point_precise_t){x, y};
    }
    lv_line_set_points_mutable(ch.route, ch.pts, w->route_len);
    if (you_in) {
        float x, y;
        mapview_project(ch.map, p.lat, p.lon, &x, &y);
        lv_obj_set_pos(ch.you, (int32_t)x - 11, (int32_t)y - 11);
        lv_obj_remove_flag(ch.you, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(ch.you, LV_OBJ_FLAG_HIDDEN);
    }
    lay_stops();
}

static void show_begin(void)
{
    const walk_t *w = &walks[ui_walk];
    const stop_t *s = &w->stops[begin_at];
    lv_label_set_text_fmt(ch.begin_kick, "BEGIN AT STOP %d OF %d", begin_at + 1, w->stop_count);
    lv_label_set_text(ch.begin_name, s->name);
    int m = metres_to(s);
    char buf[48];
    const char *mark = begin_at == nearest[ui_walk] && m >= 0 ? " \xC2\xB7 the nearest" : "";
    if (m < 0) snprintf(buf, sizeof buf, "Finding you");
    else if (m < 1000) snprintf(buf, sizeof buf, "%d m from you%s", m < 50 ? m : m / 10 * 10, mark);
    else snprintf(buf, sizeof buf, "%d.%d km from you%s", m / 1000, m % 1000 / 100, mark);
    lv_label_set_text(ch.begin_meta, buf);
    frame();
}

static void step_begin(lv_event_t *e)
{
    int n = walks[ui_walk].stop_count;
    begin_at = (begin_at + (int)(intptr_t)lv_event_get_user_data(e) + n) % n;
    show_begin();
}

void walks_start(void)
{
    ui_start_walk(begin_at);
}

/* --- Turning through the walks --------------------------------------------------------- */

static void page_pressed(lv_event_t *e)
{
    LV_UNUSED(e);
    lv_indev_get_point(lv_indev_active(), &ch.pressed_at);
}

/**
 * LVGL reports a swipe only when it's quick; a slower drag ends as a click.
 * So the click looks at how far the finger went, and turns to the next walk
 * if it went far enough across. A tap on the map does nothing.
 */
static void page_clicked(lv_event_t *e)
{
    LV_UNUSED(e);
    lv_point_t at;
    lv_indev_get_point(lv_indev_active(), &at);
    int32_t dx = at.x - ch.pressed_at.x, dy = at.y - ch.pressed_at.y;
    if (LV_ABS(dx) >= TURN_PX && LV_ABS(dx) > LV_ABS(dy)) show_walk(shown + (dx < 0 ? 1 : -1));
}

static void swiped(lv_event_t *e)
{
    LV_UNUSED(e);
    lv_indev_t *indev = lv_indev_active();
    lv_dir_t d = lv_indev_get_gesture_dir(indev);
    if (d != LV_DIR_LEFT && d != LV_DIR_RIGHT) return;
    lv_indev_wait_release(indev);
    show_walk(shown + (d == LV_DIR_LEFT ? 1 : -1));
}

static void arrow_clicked(lv_event_t *e)
{
    show_walk(shown + (int)(intptr_t)lv_event_get_user_data(e));
}

/** A round arrow button, `d` across, ringed in blue on a slip. */
static lv_obj_t *arrow(lv_obj_t *parent, int32_t x, int32_t y, int32_t d, int dir, lv_event_cb_t clicked)
{
    lv_obj_t *b = disc(parent, x, y, d, C_SLIP);
    lv_obj_set_style_border_width(b, 2, 0);
    lv_obj_set_style_border_color(b, C_BLUE, 0);
    lv_obj_set_style_bg_color(b, C_BLUE_TINT, LV_STATE_PRESSED);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(b, 12);
    lv_obj_center(chevron(b, dir > 0, C_BLUE));
    lv_obj_add_event_cb(b, clicked, LV_EVENT_CLICKED, (void *)(intptr_t)dir);
    return b;
}

/** One line, cut short with dots if it's too long. */
static lv_obj_t *line(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, int32_t w, const char *s)
{
    lv_obj_t *l = text_in(parent, font, color, s);
    lv_obj_set_size(l, w, font->line_height);
    lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_DOTS);
    return l;
}

static void freed(lv_event_t *e)
{
    lv_free(lv_event_get_user_data(e));
}

/** Walk `order[pos]`: its route framed on the map, its slips, where to begin. */
static void show_walk(int pos)
{
    shown = (pos + WALK_COUNT) % WALK_COUNT;
    ui_walk = order[shown];
    const walk_t *w = &walks[ui_walk];
    begin_at = nearest[ui_walk];

    lv_obj_clean(ch.layer);
    ch.map = mapview_create(ch.layer);

    ch.route = lv_line_create(ch.layer);
    lv_obj_set_style_line_width(ch.route, 5, 0);
    lv_obj_set_style_line_color(ch.route, C_VERMILION, 0);
    lv_obj_set_style_line_opa(ch.route, 210, 0);
    lv_obj_set_style_line_rounded(ch.route, true, 0);
    ch.pts = lv_malloc(sizeof(lv_point_precise_t) * LV_MAX(1, w->route_len));
    lv_obj_add_event_cb(ch.route, freed, LV_EVENT_DELETE, ch.pts);
    ch.stops = box(ch.layer, 0, 0, SCREEN_W, SCREEN_H);
    ch.you = disc(ch.layer, 0, 0, 22, C_PAPER);
    lv_obj_set_style_border_width(ch.you, 4, 0);
    lv_obj_set_style_border_color(ch.you, C_VERMILION, 0);
    disc(ch.you, 4, 4, 6, C_VERMILION);

    /* The walk, on a slip at the top, above the tabs. */
    lv_obj_t *top = slip(ch.layer, SCREEN_W / 2 - 112, 32, 224, LV_SIZE_CONTENT);
    lv_obj_set_style_pad_ver(top, 7, 0);
    lv_obj_set_style_pad_row(top, 1, 0);
    lv_obj_set_flex_flow(top, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(top, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    char buf[48];
    snprintf(buf, sizeof buf, "WALK %02d \xC2\xB7 %d STOPS \xC2\xB7 %s", ui_walk + 1, w->stop_count, w->distance);
    line(top, &jost_medium_14, C_BLUE, 208, buf);
    line(top, &jost_regular_20, C_CHARCOAL, 208, w->name);

    /* Where to begin, with its own arrows: across the middle, between the tabs' heights. */
    lv_obj_t *beg = slip(ch.layer, 52, 240, 362, 80);
    lv_obj_set_style_pad_all(beg, 0, 0);
    lv_obj_t *mid = box(beg, 52, 0, 258, 77);
    lv_obj_set_flex_flow(mid, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(mid, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(mid, 1, 0);
    ch.begin_kick = line(mid, &jost_medium_14, C_BLUE, 250, "");
    lv_obj_set_style_text_letter_space(ch.begin_kick, 2, 0);
    ch.begin_name = line(mid, &jost_regular_20, C_CHARCOAL, 250, "");
    ch.begin_meta = line(mid, &jost_regular_16, C_SEPIA, 250, "");
    arrow(beg, 8, 16, 44, -1, step_begin);
    arrow(beg, 310, 16, 44, 1, step_begin);
    show_begin();

    for (int k = 0; k < WALK_COUNT; k++) lv_obj_set_style_bg_color(ch.dots[k], k == shown ? C_BLUE : C_BLUE_TINT, 0);
    motion_once(ch.layer, 0, 255, 300, 0, m_opa);
}

static int nearer(const void *a, const void *b)
{
    int i = *(const int *)a, j = *(const int *)b;
    return away[i] != away[j] ? away[i] - away[j] : i - j;
}

/** Each walk's nearest stop, and the walks in order: nearest first if the guide knows where it is. */
static void put_in_order(void)
{
    position_t p = position_now();
    for (int i = 0; i < WALK_COUNT; i++) {
        order[i] = i;
        nearest[i] = 0;
        away[i] = -1;
        if (!p.known) continue;
        const walk_t *w = &walks[i];
        for (int k = 0; k < w->stop_count; k++) {
            int m = (int)position_metres(p.lat, p.lon, w->stops[k].lat_e6 / 1e6, w->stops[k].lon_e6 / 1e6);
            if (away[i] < 0 || m < away[i]) away[i] = m, nearest[i] = k;
        }
    }
    if (p.known) qsort(order, WALK_COUNT, sizeof order[0], nearer);
}

static void forget(lv_event_t *e)
{
    /* A new chooser may already be up while this one fades out; leave its parts be. */
    if (ch.scr != lv_event_get_current_target_obj(e)) return;
    lv_memzero(&ch, sizeof ch);
}

lv_obj_t *screen_walks(void)
{
    lv_obj_t *scr = ui_screen(C_PAPER);
    lv_memzero(&ch, sizeof ch);
    ch.scr = scr;
    /* The layer takes the drags that turn the walks; what's on it is rebuilt for each walk. */
    ch.layer = box(scr, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_add_flag(ch.layer, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(ch.layer, page_pressed, LV_EVENT_PRESSED, NULL);
    lv_obj_add_event_cb(ch.layer, page_clicked, LV_EVENT_CLICKED, NULL);

    /* The walks' arrows, either side, between the upper tab's height and the slip below. */
    arrow(scr, 10, 164, 50, -1, arrow_clicked);
    arrow(scr, 406, 164, 50, 1, arrow_clicked);
    for (int k = 0; k < WALK_COUNT; k++) {
        ch.dots[k] = disc(scr, spots[k].x, spots[k].y, 8, C_BLUE_TINT);
        lv_obj_set_style_outline_width(ch.dots[k], 2, 0);
        lv_obj_set_style_outline_color(ch.dots[k], C_SLIP, 0);
        lv_obj_set_style_outline_opa(ch.dots[k], 180, 0);
    }
    put_in_order();
    show_walk(0);
    ui_hints(scr, 0xFAF6EC, "START", "BACK");

    lv_obj_add_event_cb(scr, swiped, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(scr, forget, LV_EVENT_DELETE, NULL);
    return scr;
}
