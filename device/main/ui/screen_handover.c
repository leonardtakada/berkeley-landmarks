/**
 * Handing over: at a stop another architect narrates, the host steps aside
 * into a small round cameo and the stop's architect comes up from below on
 * their own ground and fills the screen, brows up, smiling. Then their
 * narration starts by itself. On a walk whose host isn't drawn yet, the
 * architect comes up over the walk's scene.
 *
 * (The canvas wipes the guest's ground up in a widening circle; here it
 * slides up whole, which the S3 can draw.)
 */
#include "ui.h"
#include <stdio.h>
#include "motion.h"
#include "portrait.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define CAMEO_X 30
#define CAMEO_Y 200

/* How long the handover holds before the guest starts. */
#define HANDOVER_MS 4500

static void listen_to_guest(void)
{
    ui_show(SCR_LISTENING);
}

lv_obj_t *screen_handover(void)
{
    const art_portrait_t *host = walk_host(), *guest = walk_speaker();
    if (!guest) return screen_guidestop();
    const stop_t *stop = walk_stop();
    palette_t pal = palette_for(guest->ground);
    lv_obj_t *scr = ui_screen(lv_color_hex(walk_ground(host)));
    lv_obj_add_event_cb(scr, ui_go, LV_EVENT_CLICKED, UI_GO(SCR_LISTENING));
    ui_after(scr, HANDOVER_MS, listen_to_guest);

    /* The host (or the scene), until the guest's ground covers them. */
    walk_companion(scr, host, MOOD_ASIDE);

    lv_obj_t *stage = box(scr, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(stage, pal.ground, 0);
    lv_obj_set_style_bg_opa(stage, LV_OPA_COVER, 0);
    motion_once(stage, SCREEN_H, 0, 800, 400, m_y);
    portrait_rise(portrait_create(stage, guest, MOOD_HELLO), 120, 700);

    /* The host steps aside into a cameo, ringed in cream. */
    const lv_image_dsc_t *face = host ? cameo_of(walk_now()->host) : NULL;
    if (face) {
        lv_obj_t *cameo = box(scr, CAMEO_X, CAMEO_Y, ART_CAMEO_PX, ART_CAMEO_PX);
        lv_obj_set_style_radius(cameo, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_outline_width(cameo, 3, 0);
        lv_obj_set_style_outline_color(cameo, C_CREAM, 0);
        lv_obj_set_style_outline_opa(cameo, LV_OPA_COVER, 0);
        lv_image_set_src(lv_image_create(cameo), face);
        motion_once(cameo, 0, 256, 500, 900, m_zoom);
    }

    char buf[64];
    snprintf(buf, sizeof buf, "STOP %d OF %d", walk_at() + 1, walk_now()->stop_count);
    lv_obj_t *k = kicker(scr, pal.kick, 40, buf);
    motion_once(k, 0, 255, 400, 1000, m_opa);

    if (host) {
        snprintf(buf, sizeof buf, "Over to %s.", architect_name(stop->speaker));
        say_once(scr, 26, 128, 104, buf, 1100);
    }
    say_once(scr, 336, 150, 104, "This one's mine.", 2200);

    lv_obj_t *card = slip(scr, 0, 0, 272, LV_SIZE_CONTENT);
    lv_obj_align(card, LV_ALIGN_BOTTOM_LEFT, 58, 418 - SCREEN_H);
    lv_obj_set_style_pad_ver(card, 12, 0);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *t = text_in(card, &jost_light_25, C_CHARCOAL, stop->name);
    lv_obj_set_width(t, 240);
    lv_label_set_long_mode(t, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);
    snprintf(buf, sizeof buf, "in the voice of %s", architect_name(stop->speaker));
    text_in(card, &jost_light_italic_15, C_SEPIA, buf);
    motion_once(card, 0, 255, 500, 1500, m_opa);
    motion_once(card, 14, 0, 500, 1500, m_y);

    ui_hints(scr, guest->ground, "LISTEN", "MENU");
    return scr;
}
