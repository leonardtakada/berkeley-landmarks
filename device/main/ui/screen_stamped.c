/**
 * The two stamped moments: at the door of a stop (its label collected), and
 * the walk done or ended. The host fills the screen, glad; the slip says
 * where you are; the stamp presses onto its corner with an ink ring, then
 * rocks a little. At the door, the stop's narration follows by itself.
 */
#include "ui.h"
#include <stdio.h>
#include <string.h>
#include "gnss/gnss.h"
#include "motion.h"
#include "portrait.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define PRESS_MS 500

/* How long the door holds before the narration starts on its own. */
#define AT_THE_DOOR_MS 7000

/** Presses the stamp (`d` across) at (cx, cy) in after `delay`: down from half as big again and a turn, an ink ring spreading. */
static void press(lv_obj_t *parent, lv_obj_t *s, int32_t cx, int32_t cy, int32_t d, int32_t tilt10, uint32_t delay)
{
    lv_obj_t *ink = box(parent, cx - d * 7 / 10, cy - d * 7 / 10, d * 14 / 10, d * 14 / 10);
    lv_obj_t *ring = box(ink, 0, 0, d, d);
    lv_obj_set_style_radius(ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(ring, 3, 0);
    lv_obj_set_style_border_color(ring, C_VERMILION, 0);
    lv_obj_set_style_opa(ring, LV_OPA_TRANSP, 0);
    motion_once(ring, d * 9 / 10, d * 135 / 100, 1100, delay + PRESS_MS - 100, m_size);
    motion_once(ring, 140, 0, 1100, delay + PRESS_MS - 100, m_opa);
    lv_obj_move_foreground(s);

    /* After it lands, it rocks four degrees and back, slowly. */
    motion_loop(s, KF({0, (int16_t)tilt10}, {500, (int16_t)(tilt10 + 40)}, {1000, (int16_t)tilt10}), 9000, delay + PRESS_MS + 1000, m_turn);
    motion_once(s, tilt10 - 140, tilt10, PRESS_MS, delay, m_turn);
    motion_once(s, 397, 256, PRESS_MS, delay, m_zoom);
    motion_once(s, 0, 255, PRESS_MS * 7 / 10, delay, m_opa);
}

/** The slip held up in front, its lines set left, its foot at `bottom`. */
static lv_obj_t *card(lv_obj_t *scr, int32_t x, int32_t bottom, int32_t w)
{
    lv_obj_t *c = slip(scr, 0, 0, w, LV_SIZE_CONTENT);
    lv_obj_align(c, LV_ALIGN_BOTTOM_LEFT, x, bottom - SCREEN_H);
    lv_obj_set_flex_flow(c, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(c, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_left(c, 20, 0);
    lv_obj_set_style_pad_right(c, 16, 0);
    lv_obj_set_style_pad_ver(c, 13, 0);
    lv_obj_set_style_pad_row(c, 2, 0);
    motion_once(c, 0, 255, 500, 500, m_opa);
    motion_once(c, 14, 0, 500, 500, m_y);
    return c;
}

static lv_obj_t *kicker_in(lv_obj_t *parent, const char *s)
{
    lv_obj_t *k = text_in(parent, &jost_medium_16, C_BLUE, s);
    lv_obj_set_style_text_letter_space(k, 3, 0);
    return k;
}

static lv_obj_t *title_in(lv_obj_t *parent, int32_t w, const char *s)
{
    lv_obj_t *t = text_in(parent, &jost_light_25, C_CHARCOAL, s);
    lv_obj_set_width(t, w);
    lv_label_set_long_mode(t, LV_LABEL_LONG_MODE_WRAP);
    return t;
}

/** The host, glad (or the walk's scene); returns the screen's ground. */
static uint32_t glad(lv_obj_t *scr)
{
    const art_portrait_t *art = walk_host();
    lv_obj_t *p = walk_companion(scr, art, MOOD_GLAD);
    if (p) portrait_rise(p, 80, 150);
    return walk_ground(art);
}

/** The day, for the foot of the stamp, from the GNSS once it knows; until then, the town. */
static void stamp_day(char *buf, size_t len)
{
    static const char *months[] = {"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"};
    gnss_state_t g = gnss_state();
    int y = 0, m = 0, d = 0;
    if (sscanf(g.date, "%d-%d-%d", &y, &m, &d) == 3 && y >= 2025 && m >= 1 && m <= 12) {
        snprintf(buf, len, "%d %s %d", d, months[m - 1], y);
    } else {
        snprintf(buf, len, "BERKELEY");
    }
}

lv_obj_t *screen_arrived(void)
{
    const walk_t *w = walk_now();
    int at = walk_at();
    walk_collect();

    lv_obj_t *scr = ui_screen(lv_color_hex(walk_ground(walk_host())));
    uint32_t ground = glad(scr);
    lv_obj_add_event_cb(scr, ui_go, LV_EVENT_CLICKED, UI_GO(walk_narration_screen()));
    ui_after(scr, AT_THE_DOOR_MS, ui_listen);

    if (walk_host()) say_once(scr, 22, 146, 124, walk_host_speaks() ? "Here we are. Mine." : "Here we are.", 1600);

    char buf[48];
    lv_obj_t *c = card(scr, 52, 426, 278);
    kicker_in(c, "AT THE DOOR");
    title_in(c, 240, walk_stop()->name);
    snprintf(buf, sizeof buf, "Label collected \xC2\xB7 %d of %d", walk_collected_count(), w->stop_count);
    text_in(c, &jost_regular_18, C_SEPIA, buf);

    /* Between the buttons' tabs, on the slip's corner. */
    char top[12], mid[4], day[16];
    snprintf(top, sizeof top, "WALK %02d", ui_walk + 1);
    snprintf(mid, sizeof mid, "%02d", at + 1);
    stamp_day(day, sizeof day);
    lv_obj_t *s = stamp(scr, 388, 232, 116, top, mid, &jost_light_54, day, true, -80);
    press(scr, s, 388, 232, 116, -80, 1000);

    ui_hints(scr, ground, "LISTEN", "MENU");
    return scr;
}

lv_obj_t *screen_walked(void)
{
    const walk_t *w = walk_now();
    int got = walk_collected_count(), n = w->stop_count;
    bool all = got == n;

    lv_obj_t *scr = ui_screen(lv_color_hex(walk_ground(walk_host())));
    uint32_t ground = glad(scr);

    if (walk_host()) say_once(scr, 22, 150, 124, all ? "Well walked." : "Until next time.", 1800);

    char top[12], buf[48];
    snprintf(top, sizeof top, "WALK %02d", ui_walk + 1);
    lv_obj_t *c = card(scr, 58, 426, 314);
    lv_obj_add_flag(c, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(c, ui_go, LV_EVENT_CLICKED, UI_GO(SCR_WALKS));
    kicker_in(c, top);
    title_in(c, 270, w->name);
    if (all) snprintf(buf, sizeof buf, "All %d labels collected", n);
    else snprintf(buf, sizeof buf, "%d of %d labels collected", got, n);
    text_in(c, &jost_regular_18, C_SEPIA, buf);
    lv_obj_t *cta = box(c, 0, 0, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(cta, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(cta, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(cta, 6, 0);
    lv_obj_set_style_margin_top(cta, 4, 0);
    text_in(cta, &jost_medium_16, C_BLUE, "Choose another walk");
    arrow_right(cta, C_BLUE);

    char mid[12], day[16];
    if (all) snprintf(mid, sizeof mid, "WALKED");
    else snprintf(mid, sizeof mid, "%d OF %d", got, n);
    stamp_day(day, sizeof day);
    lv_obj_t *s = stamp(scr, 388, 276, 128, top, mid, &jost_semibold_24, day, false, -120);
    press(scr, s, 388, 276, 128, -120, 1100);

    ui_hints(scr, ground, "WALKS", NULL);
    return scr;
}
