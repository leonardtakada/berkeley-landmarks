/**
 * Ending a walk part way: End walk in the menu asks first, on the blue
 * board. The upper button (END) ends it, showing the walk's stamp with the
 * labels collected so far; the lower (BACK) goes back where you were.
 */
#include "ui.h"
#include <stdio.h>
#include "theme.h"
#include "walk.h"
#include "widgets.h"

lv_obj_t *screen_endwalk(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);

    /* The host looks on from a cameo, if they're drawn. */
    const lv_image_dsc_t *face = cameo_of(walk_now()->host);
    if (face) {
        lv_obj_t *cameo = box(scr, (SCREEN_W - ART_CAMEO_PX) / 2, 40, ART_CAMEO_PX, ART_CAMEO_PX);
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

    ui_hints(scr, 0x0A2C8D, "END", "BACK");
    return scr;
}
