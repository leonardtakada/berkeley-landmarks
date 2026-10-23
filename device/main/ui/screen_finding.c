/**
 * Finding the reader: the walk's host fills the screen, looking about with
 * you and naming the first stop, while a sweep runs round the rim as the GPS
 * listens. A walk with no host shows its label scene instead, and the guide
 * says nothing. Until Phase 2 wires in the GNSS, tapping anywhere stands in
 * for the fix.
 *
 * (Rings spreading from behind the head looked well but redraw the whole
 * screen every frame, which holds the S3 to about 13 fps. The sweep redraws
 * only the stretch of rim it passes.)
 */
#include "ui.h"
#include <stdio.h>
#include "art.h"
#include "data.h"
#include "motion.h"
#include "portrait.h"
#include "scene.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* The sweep: a bright head with a fainter tail, once round in 2.4 s. */
#define SWEEP_MS 2400
#define HEAD_LEN 360 /* tenths of a degree */
#define TAIL_LEN 540
#define TAIL_GAP 20

static void found(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_show(SCR_FOLLOW);
}

static void sweep_head(void *arc, int32_t v) { rim_arc_set(arc, v, HEAD_LEN); }
static void sweep_tail(void *arc, int32_t v) { rim_arc_set(arc, v - TAIL_GAP - TAIL_LEN, TAIL_LEN); }

/** Turns a rim arc steadily round, for ever. */
static void spin(lv_obj_t *arc, lv_anim_exec_xcb_t exec)
{
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, arc);
    lv_anim_set_exec_cb(&a, exec);
    lv_anim_set_values(&a, 0, 3600);
    lv_anim_set_duration(&a, SWEEP_MS);
    lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_path_cb(&a, lv_anim_path_linear);
    lv_anim_start(&a);
}

lv_obj_t *screen_finding(void)
{
    /* Setting out: the first stop, nothing collected yet. */
    walk_begin();
    const walk_t *w = walk_now();
    const art_portrait_t *host = walk_host();
    palette_t pal = palette_for(host ? host->ground : 0xFAF6EC);
    lv_obj_t *scr = ui_screen(pal.ground);
    lv_obj_add_event_cb(scr, found, LV_EVENT_CLICKED, NULL);

    if (host) portrait_rise(portrait_create(scr, host, MOOD_SEARCH), 80, 150);
    else scene_create(scr, &art_scenes[ui_walk]);

    /* The rim, faint, with the sweep running round it. */
    lv_obj_t *track = rim_arc(scr, pal.ahead);
    lv_obj_set_style_arc_opa(track, pal.ahead_opa, 0);
    rim_arc_set(track, 0, 3599);
    lv_obj_t *tail = rim_arc(scr, pal.accent);
    lv_obj_set_style_arc_opa(tail, 110, 0);
    spin(tail, sweep_tail);
    spin(rim_arc(scr, pal.accent), sweep_head);

    char buf[64];
    snprintf(buf, sizeof buf, "WALK %02d", ui_walk + 1);
    /* Over a scene the kicker would land on the drawing; it goes on the slip instead. */
    if (host) kicker(scr, pal.kick, 40, buf);

    if (host) {
        snprintf(buf, sizeof buf, "Our first stop: %s.", w->stops[0].name);
        say(scr, 322, 160, 120, buf, false);
        walk_size_line(w, buf, sizeof buf);
        say(scr, 322, 160, 120, buf, true);
    }

    /* What's happening, on a slip held up in front. */
    lv_obj_t *card = host ? slip(scr, 106, 312, 226, 114) : slip(scr, 106, 300, 226, 128);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    if (!host) {
        lv_obj_t *k = lv_label_create(card);
        lv_obj_set_style_text_font(k, &jost_medium_16, 0);
        lv_obj_set_style_text_color(k, C_BLUE, 0);
        lv_obj_set_style_text_letter_space(k, 3, 0);
        lv_label_set_text(k, buf);
    }
    lv_obj_t *title = lv_label_create(card);
    lv_obj_set_style_text_font(title, &jost_light_32, 0);
    lv_obj_set_style_text_color(title, C_CHARCOAL, 0);
    lv_label_set_text_static(title, "Finding you");
    lv_obj_t *hint = lv_label_create(card);
    lv_obj_set_style_text_font(hint, &jost_regular_18, 0);
    lv_obj_set_style_text_color(hint, C_SEPIA, 0);
    lv_obj_set_style_text_align(hint, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_text_static(hint, "Hold the guide face up,\nunder open sky.");

    ui_hints(scr, host ? host->ground : 0xFAF6EC, "START", "BACK");
    return scr;
}
