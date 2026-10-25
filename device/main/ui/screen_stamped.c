/**
 * The walk done or ended: the host fills the screen, glad; the slip says how
 * many labels you collected; the walk's stamp presses onto its corner with an
 * ink ring, then rocks a little, and the guide reads the walk's end. (A
 * stop's own stamp is pressed on its story.)
 */
#include "ui.h"
#include <stdio.h>
#include <string.h>
#include "audio/player.h"
#include "gnss/gnss.h"
#include "motion.h"
#include "portrait.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

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

/* The walk's end, read by the guide once the stamp and its bells have settled. */
static void play_outro(void)
{
    char part[8];
    snprintf(part, sizeof part, "w%02do", ui_walk + 1);
    player_play(part, 0);
}

lv_obj_t *screen_walked(void)
{
    const walk_t *w = walk_now();
    int got = walk_collected_count(), n = w->stop_count;
    bool all = got == n;

    lv_obj_t *scr = ui_screen(lv_color_hex(walk_ground(walk_host())));
    uint32_t ground = glad(scr);

    if (walk_host()) say_once(scr, 22, 150, 124, all ? "Well walked." : "Until next time.", 1800);
    ui_after(scr, 2500, play_outro);

    char top[12], buf[48];
    snprintf(top, sizeof top, "WALK %02d", ui_walk + 1);
    lv_obj_t *c = card(scr, 62, 426, 236);
    kicker_in(c, top);
    title_in(c, 200, w->name);
    if (all) snprintf(buf, sizeof buf, "All %d labels collected", n);
    else snprintf(buf, sizeof buf, "%d of %d labels collected", got, n);
    text_in(c, &jost_regular_18, C_SEPIA, buf);

    char mid[12], day[16];
    if (all) snprintf(mid, sizeof mid, "WALKED");
    else snprintf(mid, sizeof mid, "%d OF %d", got, n);
    stamp_day(day, sizeof day);
    lv_obj_t *s = stamp(scr, 384, 226, 118, top, mid, &jost_semibold_24, day, false, -120);
    stamp_press(scr, s, 384, 226, 118, -120, 1100);

    ui_hints(scr, ground, "WALKS", "BACK");
    return scr;
}
