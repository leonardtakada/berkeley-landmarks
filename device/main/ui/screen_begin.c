/**
 * Where to begin: asked on Start only when one of the walk's stops is much
 * nearer you than its first (BEGIN_ASK_M), on the blue board as "End the
 * walk?" is. Two answers, large: begin at the nearest stop, filled beside the
 * upper button, which takes it; or at the first, ringed below it. A walk begun
 * part way goes on to its end, then round to the stops before, and the line
 * under the answers says which those are. The lower button goes back to the
 * walk on Choose.
 */
#include "ui.h"
#include <stdio.h>
#include "position.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define TAB_RIGHT_EDGE 404 /* where the tabs end, under the buttons */
#define ANSWER_X 66
#define ANSWER_W (TAB_RIGHT_EDGE - ANSWER_X)
#define ANSWER_H 66

static int here; /* the stop nearest you, on the walk showing */

/** How far you are from stop `k` of the walk showing; −1 if not known. */
static int metres_to(int k)
{
    position_t p = position_now();
    const stop_t *s = &walks[ui_walk].stops[k];
    return p.known ? (int)position_metres(p.lat, p.lon, s->lat_e6 / 1e6, s->lon_e6 / 1e6) : -1;
}

bool begin_worth_asking(void)
{
    const walk_t *w = &walks[ui_walk];
    int first = metres_to(0);
    if (first < 0) return false;
    here = 0;
    int near = first;
    for (int k = 1; k < w->stop_count; k++) {
        int m = metres_to(k);
        if (m < near) near = m, here = k;
    }
    return here != 0 && first - near >= BEGIN_ASK_M;
}

void begin_here(void)
{
    ui_start_walk(here);
}

static void here_clicked(lv_event_t *e)
{
    LV_UNUSED(e);
    begin_here();
}

static void first_clicked(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_start_walk(0);
}

/** An answer: a pill `ANSWER_H` tall at `y`, its choice above and the stop below. */
static lv_obj_t *answer(lv_obj_t *scr, int32_t y, bool filled, const char *choice, int k, lv_event_cb_t clicked)
{
    lv_color_t ink = filled ? C_BLUE : C_CREAM, soft = filled ? C_BLUE : C_BLUE_TINT;
    lv_obj_t *a = box(scr, ANSWER_X, y, ANSWER_W, ANSWER_H);
    lv_obj_set_style_radius(a, ANSWER_H / 2, 0);
    lv_obj_set_style_bg_color(a, C_CREAM, 0);
    lv_obj_set_style_bg_opa(a, filled ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(a, filled ? 0 : 2, 0);
    lv_obj_set_style_border_color(a, C_CREAM, 0);
    lv_obj_set_style_pad_hor(a, 26, 0);
    lv_obj_set_flex_flow(a, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(a, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    /* Pressed, it darkens a shade, so the finger sees it took. */
    lv_obj_set_style_bg_opa(a, LV_OPA_COVER, LV_STATE_PRESSED);
    lv_obj_set_style_bg_color(a, filled ? C_BLUE_TINT : lv_color_mix(C_CREAM, C_BOARD, 60), LV_STATE_PRESSED);
    lv_obj_add_flag(a, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(a, 6);
    lv_obj_add_event_cb(a, clicked, LV_EVENT_CLICKED, NULL);

    lv_obj_t *c = text_in(a, &jost_medium_18, ink, choice);
    lv_obj_set_style_text_letter_space(c, 1, 0);
    char buf[80], far[16];
    walk_distance_words(metres_to(k), far, sizeof far);
    snprintf(buf, sizeof buf, "Stop %d \xC2\xB7 %s \xC2\xB7 %s", k + 1, walks[ui_walk].stops[k].name, far);
    lv_obj_t *s = text_in(a, &jost_regular_16, soft, buf);
    lv_obj_set_size(s, ANSWER_W - 52, jost_regular_16.line_height);
    lv_obj_set_style_text_align(s, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(s, LV_LABEL_LONG_MODE_DOTS);
    return a;
}

lv_obj_t *screen_begin(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);
    begin_worth_asking(); /* `here`, as things stand now */

    char buf[64];
    snprintf(buf, sizeof buf, "WALK %02d", ui_walk + 1);
    lv_obj_t *k = kicker(scr, C_BLUE_TINT, 34, buf);
    lv_obj_set_style_text_letter_space(k, 4, 0);
    line_centered(scr, &jost_light_32, C_CREAM, 54, "Where to begin?");

    /* Beside the upper button, which takes it: begin here. Below it: from the start. */
    answer(scr, UPPER_CY - ANSWER_H / 2 + 8, true, "BEGIN HERE", here, here_clicked);
    answer(scr, UPPER_CY + ANSWER_H / 2 + 24, false, "FROM THE START", 0, first_clicked);

    if (here == 1) snprintf(buf, sizeof buf, "Begun here, stop 1 comes at the end.");
    else snprintf(buf, sizeof buf, "Begun here, stops 1 to %d come at the end.", here);
    lv_obj_t *note = line_centered(scr, &jost_regular_16, C_BLUE_TINT, UPPER_CY + ANSWER_H * 3 / 2 + 40, buf);
    lv_obj_set_width(note, 300);

    ui_hints(scr, 0x0A2C8D, NULL, "BACK");
    return scr;
}
