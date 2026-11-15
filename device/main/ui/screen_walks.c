/**
 * Choosing a walk (design canvas, "Walks"). Each walk's label scene fills the
 * circle, its slip laid in the middle, between the tabs: the walk, and how
 * far it is from you. With a fix the walks come nearest first, by whichever
 * of their stops is nearest. The arrows either side turn to the next walk (or
 * swipe); Map, at the top, shows the whole walk and where you are, and comes
 * back to just this. Only the walk is chosen here: the upper button (START)
 * sets out from its first stop, or, if one of its stops is much nearer, asks
 * where to begin (screen_begin.c). The lower goes back.
 */
#include <stdio.h>
#include <stdlib.h>
#include "ui.h"
#include "data.h"
#include "motion.h"
#include "position.h"
#include "scene.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* A drag this far across turns to the next walk; anything less is let go. */
#define TURN_PX 50

/* Where each walk's dot sits, following the rim at the foot of the circle. */
static const lv_point_t spots[WALK_COUNT] = {
    {128, 415}, {145, 424}, {163, 430}, {181, 436}, {200, 439}, {219, 441},
    {239, 441}, {258, 439}, {277, 436}, {295, 430}, {313, 424}, {330, 415},
};

/* There's one chooser at a time, so its parts live here. */
static struct {
    lv_obj_t *scr, *layer; /* layer: what's rebuilt for each walk */
    lv_obj_t *dots[WALK_COUNT];
    lv_point_t pressed_at;
} ch;

/* The walks in the order shown (nearest first, with a fix), where you are in it, and for each walk
 * how far its nearest stop is (−1: not known). */
static int order[WALK_COUNT], shown;
static int away[WALK_COUNT];
static bool returning; /* the chooser comes back from its map, or from where to begin, just as it was */

static void show_walk(int pos);

void walks_start(void)
{
    if (begin_worth_asking()) {
        returning = true;
        ui_show(SCR_BEGIN);
    } else {
        ui_start_walk(0);
    }
}

void walks_show_again(void)
{
    returning = true;
    ui_show(SCR_WALKS);
}

static void map_clicked(lv_event_t *e)
{
    LV_UNUSED(e);
    returning = true;
    ui_open_map();
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
 * if it went far enough across. A tap on the scene does nothing.
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

/** Walk `order[pos]`: its scene, and its slip. */
static void show_walk(int pos)
{
    shown = (pos + WALK_COUNT) % WALK_COUNT;
    ui_walk = order[shown];
    const walk_t *w = &walks[ui_walk];

    lv_obj_clean(ch.layer);
    scene_create(ch.layer, &art_scenes[ui_walk]);

    /* The walk and how far, on a slip in the middle, between the tabs' bands and the arrows. */
    lv_obj_t *s = slip(ch.layer, 0, 0, 300, LV_SIZE_CONTENT);
    lv_obj_align(s, LV_ALIGN_BOTTOM_MID, 0, 316 - SCREEN_H);
    lv_obj_set_style_pad_ver(s, 10, 0);
    lv_obj_set_style_pad_row(s, 1, 0);
    lv_obj_set_flex_flow(s, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    char buf[48], far[16];
    snprintf(buf, sizeof buf, "WALK %02d \xC2\xB7 %d STOPS \xC2\xB7 %s", ui_walk + 1, w->stop_count, w->distance);
    lv_obj_set_style_text_letter_space(line(s, &jost_medium_14, C_BLUE, 276, buf), 1, 0);
    line(s, &jost_light_25, C_CHARCOAL, 276, w->name);
    /* How far: to its first stop, or, if one of its stops is much nearer, to that. */
    position_t p = position_now();
    int first = p.known ? walk_metres_from_start(w, p.lat, p.lon) : -1;
    if (first < 0) {
        snprintf(buf, sizeof buf, "Starts at %s", w->stops[0].name);
    } else if (first - away[ui_walk] >= BEGIN_ASK_M) {
        walk_distance_words(away[ui_walk], far, sizeof far);
        snprintf(buf, sizeof buf, "A stop %s from you", far);
    } else {
        walk_distance_words(first, far, sizeof far);
        snprintf(buf, sizeof buf, "Starts %s from you", far);
    }
    line(s, &jost_regular_16, C_SEPIA, 276, buf);

    for (int k = 0; k < WALK_COUNT; k++) lv_obj_set_style_bg_color(ch.dots[k], k == shown ? C_BLUE : C_BLUE_TINT, 0);
    motion_once(s, 0, 255, 400, 80, m_opa);
    motion_once(s, 12, 0, 400, 80, m_y);
}

static int nearer(const void *a, const void *b)
{
    int i = *(const int *)a, j = *(const int *)b;
    return away[i] != away[j] ? away[i] - away[j] : i - j;
}

/** How far each walk's nearest stop is, and the walks in order: nearest first if the guide knows where it is. */
static void put_in_order(void)
{
    position_t p = position_now();
    for (int i = 0; i < WALK_COUNT; i++) {
        order[i] = i;
        away[i] = -1;
        if (!p.known) continue;
        const walk_t *w = &walks[i];
        for (int k = 0; k < w->stop_count; k++) {
            int m = (int)position_metres(p.lat, p.lon, w->stops[k].lat_e6 / 1e6, w->stops[k].lon_e6 / 1e6);
            if (away[i] < 0 || m < away[i]) away[i] = m;
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

    /* The walks' arrows, either side, between the tabs' heights. */
    arrow(scr, 10, 186, 50, -1, arrow_clicked);
    arrow(scr, 406, 186, 50, 1, arrow_clicked);
    /* The walk on the map, at the top. */
    lv_obj_t *map = pill(scr, SCREEN_W / 2 - 56, 30, 112, 40, false, C_BLUE, C_BLUE, "Map", map_clicked);
    lv_obj_move_to_index(map_mark(map, C_BLUE), 0);
    for (int k = 0; k < WALK_COUNT; k++) {
        ch.dots[k] = disc(scr, spots[k].x, spots[k].y, 8, C_BLUE_TINT);
        lv_obj_set_style_outline_width(ch.dots[k], 2, 0);
        lv_obj_set_style_outline_color(ch.dots[k], C_SLIP, 0);
        lv_obj_set_style_outline_opa(ch.dots[k], 180, 0);
    }
    if (returning) {
        returning = false;
        show_walk(shown);
    } else {
        put_in_order();
        show_walk(0);
    }
    ui_hints(scr, 0xFAF6EC, "START", "BACK");

    lv_obj_add_event_cb(scr, swiped, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(scr, forget, LV_EVENT_DELETE, NULL);
    return scr;
}
