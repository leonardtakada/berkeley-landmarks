/**
 * Ending a walk part way: held down, the lower button (or End walk on the
 * controls) asks first, on the blue board. Ending shows the walk's stamp
 * with the labels collected so far; keeping goes back where you were.
 */
#include "ui.h"
#include <stdio.h>
#include "motion.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define FAINT_CREAM 128

static void end_it(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_show(SCR_WALKED);
}

static void keep_on(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_keep_walking();
}

static lv_obj_t *button(lv_obj_t *scr, int32_t y, bool filled, const char *s, lv_event_cb_t cb)
{
    lv_obj_t *b = box(scr, 143, y, 180, 54);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_radius(b, 27, 0);
    if (filled) {
        lv_obj_set_style_bg_color(b, C_CREAM, 0);
        lv_obj_set_style_bg_opa(b, LV_OPA_COVER, 0);
    } else {
        lv_obj_set_style_border_width(b, 2, 0);
        lv_obj_set_style_border_color(b, C_CREAM, 0);
        lv_obj_set_style_border_opa(b, FAINT_CREAM, 0);
    }
    lv_obj_center(text_in(b, filled ? &jost_medium_16 : &jost_regular_16, filled ? C_BLUE : C_CREAM, s));
    lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, NULL);
    return b;
}

lv_obj_t *screen_endwalk(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);

    /* The host looks on from a cameo, if they're drawn. */
    const lv_image_dsc_t *face = cameo_of(walk_now()->host);
    if (face) {
        lv_obj_t *cameo = box(scr, (SCREEN_W - ART_CAMEO_PX) / 2, 46, ART_CAMEO_PX, ART_CAMEO_PX);
        lv_obj_set_style_radius(cameo, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_clip_corner(cameo, true, 0);
        lv_obj_set_style_outline_width(cameo, 3, 0);
        lv_obj_set_style_outline_color(cameo, C_CREAM, 0);
        lv_obj_set_style_outline_opa(cameo, LV_OPA_COVER, 0);
        lv_image_set_src(lv_image_create(cameo), face);
    }

    char buf[48];
    snprintf(buf, sizeof buf, "WALK %02d", ui_walk + 1);
    lv_obj_t *k = kicker(scr, C_BLUE_TINT, 150, buf);
    lv_obj_set_style_text_letter_space(k, 4, 0);
    line_centered(scr, &jost_light_32, C_CREAM, 172, "End the walk?");
    int got = walk_collected_count(), n = walk_now()->stop_count;
    if (got) snprintf(buf, sizeof buf, "%d of %d labels collected so far.", got, n);
    else snprintf(buf, sizeof buf, "No labels collected yet.");
    line_centered(scr, &jost_regular_16, C_BLUE_TINT, 218, buf);

    lv_obj_t *end = button(scr, 262, true, "End walk", end_it);
    motion_once(end, 0, 255, 400, 150, m_opa);
    lv_obj_t *keep = button(scr, 330, false, "Keep walking", keep_on);
    motion_once(keep, 0, 255, 400, 220, m_opa);

    ui_hints(scr, 0x0A2C8D, "END", "KEEP");
    return scr;
}
