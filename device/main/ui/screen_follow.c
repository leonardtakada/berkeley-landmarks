/**
 * Following the walk: the host fills the screen and walks along beside you,
 * eyes on the way ahead. A pointer riding inside the rim shows the bearing to
 * the next stop, the rim shows the stops (collected, the one now, the rest),
 * and the distance counts down on a slip held up in front. The upper button
 * says you're there; the lower brings the controls down. A walk whose host
 * isn't drawn yet shows its label scene.
 *
 * Until the GNSS and heading arrive (Phase 4), the walk is simulated from the
 * stop's crow-flies distance and bearing from the stop before, closing at
 * walking pace; the guide calls the arrival itself near the door.
 */
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include "motion.h"
#include "portrait.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* About 80 m a minute on foot, as the app reckons it. */
#define METRES_PER_MIN 80

/* Close enough to call it there. */
#define AT_THE_DOOR_M 25

/* How far the eyes go toward the pointer, in tenths of the drawing's units. */
#define GAZE 34

/* The pointer sways this far each side of the bearing (0.1 degree). */
#define SWAY 40

typedef struct {
    lv_obj_t *metres, *stop, *kick;
    lv_timer_t *timer;
    uint32_t steps;
} walking_t;

/* There's one Follow at a time; its host looks where the pointer points. */
static lv_obj_t *host;

static void show_distance(walking_t *w)
{
    int m = walk_metres_left();
    lv_label_set_text_fmt(w->metres, "%d m", m);
    lv_label_set_text(w->stop, walk_stop()->name);
    lv_label_set_text_fmt(w->kick, "STOP %d OF %d \xC2\xB7 %d MIN", walk_at() + 1, walk_now()->stop_count,
                          LV_MAX(1, (m + METRES_PER_MIN / 2) / METRES_PER_MIN));
}

/* A second's walking: 1.4 m on average, in whole metres. */
static void step(lv_timer_t *t)
{
    walking_t *w = lv_timer_get_user_data(t);
    walk_step(w->steps++ % 5 % 2 ? 2 : 1);
    show_distance(w);
    if (walk_metres_left() <= AT_THE_DOOR_M && ui_is_current(lv_obj_get_screen(w->metres))) {
        lv_timer_pause(t);
        ui_arrive();
    }
}

static void bearing(lv_obj_t *pointer, int32_t deg10)
{
    rim_pointer_set(pointer, deg10);
    if (host) portrait_gaze(host, (int32_t)lroundf(GAZE * sinf((float)deg10 * (float)M_PI / 1800.0f)));
}

static void pull_down(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_open_controls();
}

static void here(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_arrive();
}

static void stopped(lv_event_t *e)
{
    walking_t *w = lv_event_get_user_data(e);
    lv_timer_delete(w->timer);
    /* A new Follow may already be up while this one fades out. */
    if (host && lv_obj_get_screen(host) == lv_event_get_current_target_obj(e)) host = NULL;
    lv_free(w);
}

lv_obj_t *screen_follow(void)
{
    const walk_t *walk = walk_now();
    const stop_t *s = walk_stop();
    int at = walk_at(), n = walk->stop_count;
    const art_portrait_t *art = walk_host();
    palette_t pal = palette_for(walk_ground(art));
    lv_obj_t *scr = ui_screen(pal.ground);

    host = walk_companion(scr, art, MOOD_WALK);
    if (host) portrait_rise(host, 80, 150);

    for (int i = 0; i < n; i++) {
        bool got = walk_collected(i);
        lv_obj_t *seg = rim_segment(scr, i, n, i == at ? pal.accent : got ? pal.mark : pal.ahead);
        if (i != at && !got) lv_obj_set_style_arc_opa(seg, pal.ahead_opa, 0);
        if (i == at) motion_loop(seg, KF({0, 255}, {500, 89}, {1000, 255}), 1600, 0, m_arc_opa);
    }

    /* The way ahead, swaying a little about its bearing. */
    int16_t b = (int16_t)(s->bearing * 10);
    lv_obj_t *pointer = rim_pointer(scr, pal.accent, pal.shadow);
    motion_loop(pointer, KF({0, (int16_t)(b - SWAY)}, {500, (int16_t)(b + SWAY)}, {1000, (int16_t)(b - SWAY)}), 3400, 0, bearing);

    /* The handle to the controls (the pointer may pass over it when the way is due ahead). */
    lv_obj_t *handle = box(scr, 193, 14, 80, 30);
    lv_obj_add_flag(handle, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(handle, 10);
    lv_obj_add_event_cb(handle, pull_down, LV_EVENT_CLICKED, NULL);
    lv_obj_t *grip = box(handle, 0, 0, 40, 5);
    lv_obj_set_style_radius(grip, 3, 0);
    lv_obj_set_style_bg_color(grip, pal.ahead, 0);
    lv_obj_set_style_bg_opa(grip, pal.ahead_opa, 0);
    lv_obj_center(grip);

    char buf[96];

    lv_obj_t *map = disc(scr, 34, 208, 56, pal.chip);
    lv_obj_set_style_bg_opa(map, pal.chip_opa, 0);
    lv_obj_center(map_mark(map, pal.mark));
    lv_obj_add_flag(map, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(map, 14);
    lv_obj_add_event_cb(map, ui_go, LV_EVENT_CLICKED, UI_GO(SCR_MAP));

    /* The host says where you're going, and who'll tell it. */
    if (host) {
        snprintf(buf, sizeof buf, "Next: %s.", s->name);
        say(scr, 322, 160, 120, buf, false);
        if (walk_host_speaks()) snprintf(buf, sizeof buf, "This one's mine.");
        else if (s->speaker) snprintf(buf, sizeof buf, "%s tells this one.", architect_name(s->speaker));
        else snprintf(buf, sizeof buf, "I'll listen with you.");
        say(scr, 322, 160, 120, buf, true);
    }

    /* The distance, on a slip held up in front; tapping it says you're there. */
    lv_obj_t *card = slip(scr, 0, 0, 236, LV_SIZE_CONTENT);
    lv_obj_align(card, LV_ALIGN_BOTTOM_LEFT, 94, -42);
    lv_obj_set_style_pad_ver(card, 12, 0);
    lv_obj_add_flag(card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(card, here, LV_EVENT_CLICKED, NULL);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    walking_t *w = lv_malloc(sizeof(walking_t));
    lv_memzero(w, sizeof(*w));
    /* Which stop, on the slip rather than at the top, where the pointer rides when the way is north. */
    w->kick = text_in(card, &jost_medium_16, C_BLUE, "");
    lv_obj_set_style_text_letter_space(w->kick, 2, 0);
    w->metres = lv_label_create(card);
    lv_obj_set_style_text_font(w->metres, &jost_light_58, 0);
    lv_obj_set_style_text_color(w->metres, C_CHARCOAL, 0);
    lv_obj_set_style_text_letter_space(w->metres, -1, 0);
    lv_obj_t *row = box(card, 0, 0, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 7, 0);
    stop_dot(row, 22, at + 1, C_BLUE, C_CREAM);
    w->stop = lv_label_create(row);
    lv_obj_set_style_text_font(w->stop, &jost_regular_18, 0);
    lv_obj_set_style_text_color(w->stop, C_SEPIA, 0);
    lv_obj_set_style_max_width(w->stop, 190, 0);
    lv_label_set_long_mode(w->stop, LV_LABEL_LONG_MODE_WRAP);
    show_distance(w);
    w->timer = lv_timer_create(step, 1000, w);
    lv_obj_add_event_cb(scr, stopped, LV_EVENT_DELETE, w);

    ui_hints(scr, walk_ground(art), "I'M HERE", "MENU");
    return scr;
}
