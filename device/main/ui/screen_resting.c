/**
 * Resting, between stops: the screen dims to the blue board, the host dozes
 * in the dark with z's rising, and a night slip keeps the next stop and its
 * distance. A tap or either button wakes the guide.
 */
#include "ui.h"
#include <stdio.h>
#include "motion.h"
#include "portrait.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define NIGHT lv_color_hex(0x061E63)

/** A z rising from the sleeper's head and fading, `delay` into its 4.8 s cycle. */
static void z(lv_obj_t *scr, const lv_font_t *font, uint32_t delay)
{
    lv_obj_t *l = text_at(scr, font, C_CREAM, 344, 112, "z");
    motion_loop(l, KF({0, 0}, {150, 230}, {1000, 0}), 4800, delay, m_opa);
    motion_loop(l, KF({0, 0}, {1000, 30}), 4800, delay, m_x);
    motion_loop(l, KF({0, 0}, {1000, -64}), 4800, delay, m_y);
}

lv_obj_t *screen_resting(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);
    lv_obj_add_event_cb(scr, ui_go, LV_EVENT_CLICKED, UI_GO(SCR_FOLLOW));

    if (walk_host()) {
        lv_obj_t *host = portrait_create(scr, walk_host(), MOOD_SLEEP);
        portrait_dim(host, C_BOARD, 128);
        z(scr, &jost_light_25, 0);
        z(scr, &jost_light_28, 1600);
        z(scr, &jost_light_32, 3200);
    }

    lv_obj_t *card = box(scr, 93, 298, 280, 116);
    lv_obj_set_style_bg_color(card, NIGHT, 0);
    lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(card, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_width(card, 3, 0);
    lv_obj_set_style_border_color(card, C_CREAM, 0);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    char buf[40];
    snprintf(buf, sizeof buf, "NEXT \xC2\xB7 STOP %d", walk_at() + 1);
    lv_obj_t *k = text_in(card, &jost_medium_16, C_BLUE_TINT, buf);
    lv_obj_set_style_text_letter_space(k, 3, 0);
    lv_obj_t *name = text_in(card, &jost_light_25, C_CREAM, walk_stop()->name);
    lv_obj_set_style_max_width(name, 250, 0);
    lv_label_set_long_mode(name, LV_LABEL_LONG_MODE_DOTS);
    int m = walk_metres_left();
    snprintf(buf, sizeof buf, "%d m \xC2\xB7 %d min walk", m, LV_MAX(1, (m + 40) / 80));
    text_in(card, &jost_regular_18, C_BLUE_TINT, buf);

    lv_obj_t *wake = line_centered(scr, &jost_regular_18, C_BLUE_TINT, 422, "Tap to wake");
    lv_obj_set_style_text_letter_space(wake, 1, 0);
    motion_loop(wake, KF({0, 140}, {500, 217}, {1000, 140}), 6000, 0, m_opa);

    return scr;
}
