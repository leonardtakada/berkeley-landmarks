/**
 * The controls, pulled down like a shade over the walk (the handle on
 * Follow, or the lower button anywhere on a walk): how the guide is finding
 * you, the volume, the last and next stops, ending the walk, and Done to put
 * the shade back up over whatever it came down on. The status line is
 * simulated until the GNSS (Phase 4) and audio (Phase 5) report for real.
 */
#include "ui.h"
#include "motion.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define VOLUME_STEPS 10
#define FAINT_CREAM 128 /* the ring round a control: cream at half strength */

/* One controls shade at a time; the volume stays where you left it. */
static int volume = 6;
static lv_obj_t *ticks[VOLUME_STEPS];

static void show_volume(void)
{
    for (int k = 0; k < VOLUME_STEPS; k++) {
        if (!ticks[k]) return;
        bool on = k < volume;
        lv_obj_set_height(ticks[k], on ? 8 + k * 13 / 10 : 8);
        lv_obj_set_style_bg_opa(ticks[k], on ? LV_OPA_COVER : 56, 0);
    }
}

static void louder(lv_event_t *e)
{
    volume = LV_CLAMP(0, volume + (int)(intptr_t)lv_event_get_user_data(e), VOLUME_STEPS);
    show_volume();
}

static void close_shade(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_close_controls();
}

static void last_stop(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_last_stop();
}

static void end_walk(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_ask_end();
}

static void forget(lv_event_t *e)
{
    /* A new shade may already be down while this one goes. */
    if (ticks[0] && lv_obj_get_screen(ticks[0]) != lv_event_get_current_target_obj(e)) return;
    lv_memzero(ticks, sizeof ticks);
}

/** Comes in a row at a time, from just above. */
static void row_in(lv_obj_t *o, int i)
{
    motion_once(o, 0, 255, 450, 150 + i * 70, m_opa);
    motion_once(o, -10, 0, 450, 150 + i * 70, m_y);
}

static lv_obj_t *ringed(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h)
{
    lv_obj_t *b = box(parent, x, y, w, h);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_radius(b, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(b, 2, 0);
    lv_obj_set_style_border_color(b, C_CREAM, 0);
    lv_obj_set_style_border_opa(b, FAINT_CREAM, 0);
    return b;
}

static lv_obj_t *bar(lv_obj_t *parent, int32_t w, int32_t h)
{
    lv_obj_t *o = box(parent, 0, 0, w, h);
    lv_obj_set_style_radius(o, 2, 0);
    lv_obj_set_style_bg_color(o, C_CREAM, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
    lv_obj_center(o);
    return o;
}

static lv_obj_t *volume_button(lv_obj_t *parent, int32_t x, int dir)
{
    lv_obj_t *b = ringed(parent, x, 32, 60, 60);
    bar(b, 16, 3);
    if (dir > 0) bar(b, 3, 16);
    lv_obj_add_event_cb(b, louder, LV_EVENT_CLICKED, (void *)(intptr_t)dir);
    return b;
}

lv_obj_t *screen_controls(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);
    lv_memzero(ticks, sizeof ticks);
    lv_obj_add_event_cb(scr, forget, LV_EVENT_DELETE, NULL);

    lv_obj_t *fix = box(scr, 0, 58, SCREEN_W, 24);
    lv_obj_set_flex_flow(fix, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(fix, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(fix, 8, 0);
    lv_obj_t *live = disc(fix, 0, 0, 10, C_VERMILION);
    motion_loop(live, KF({0, 255}, {500, 115}, {1000, 255}), 1600, 0, m_bg_opa);
    text_in(fix, &jost_regular_18, C_CREAM, "Following you");
    text_in(fix, &jost_regular_18, C_BLUE_TINT, "\xC2\xB7 to 6 m \xC2\xB7 72%");
    /* The status line opens the hardware check. */
    lv_obj_add_flag(fix, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(fix, 8);
    lv_obj_add_event_cb(fix, ui_go, LV_EVENT_CLICKED, UI_GO(SCR_HARDWARE));
    row_in(fix, 0);

    lv_obj_t *vol = box(scr, 0, 146, SCREEN_W, 100);
    lv_obj_t *k = kicker(vol, C_BLUE_TINT, 4, "VOLUME");
    lv_obj_set_style_text_letter_space(k, 4, 0);
    volume_button(vol, 72, -1);
    lv_obj_t *steps = box(vol, 152, 52, 165, 20);
    lv_obj_set_flex_flow(steps, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(steps, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
    lv_obj_set_style_pad_column(steps, 5, 0);
    for (int i = 0; i < VOLUME_STEPS; i++) {
        ticks[i] = box(steps, 0, 0, 12, 8);
        lv_obj_set_style_bg_color(ticks[i], C_CREAM, 0);
    }
    show_volume();
    volume_button(vol, 334, 1);
    row_in(vol, 1);

    lv_obj_t *stops = box(scr, 103, 256, 260, 56);
    lv_obj_set_flex_flow(stops, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(stops, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *last = ringed(stops, 0, 0, 220, 56);
    lv_obj_center(text_in(last, &jost_medium_18, C_CREAM, "Last stop"));
    if (walk_at() > 0) {
        lv_obj_add_event_cb(last, last_stop, LV_EVENT_CLICKED, NULL);
    } else {
        /* There's no stop before the first. */
        lv_obj_remove_flag(last, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_style_opa(lv_obj_get_child(last, 0), 90, 0);
        lv_obj_set_style_border_opa(last, 50, 0);
    }
    row_in(stops, 2);

    lv_obj_t *end = box(scr, 123, 328, 180, 56);
    lv_obj_add_flag(end, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_radius(end, 28, 0);
    lv_obj_set_style_bg_color(end, C_CREAM, 0);
    lv_obj_set_style_bg_opa(end, LV_OPA_COVER, 0);
    lv_obj_center(text_in(end, &jost_medium_18, C_BLUE, "End walk"));
    lv_obj_add_event_cb(end, end_walk, LV_EVENT_CLICKED, NULL);
    row_in(end, 3);

    lv_obj_t *done = box(scr, 173, 392, 120, 40);
    lv_obj_add_flag(done, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(done, close_shade, LV_EVENT_CLICKED, NULL);
    lv_obj_t *grip = box(done, 30, 6, 40, 5);
    lv_obj_set_style_radius(grip, 3, 0);
    lv_obj_set_style_bg_color(grip, C_CREAM, 0);
    lv_obj_set_style_bg_opa(grip, 102, 0);
    motion_loop(grip, KF({0, 0}, {500, -4}, {1000, 0}), 2400, 0, m_y);

    ui_hints(scr, 0x0A2C8D, walk_at_last() ? "FINISH" : "NEXT STOP", "DONE");
    return scr;
}
