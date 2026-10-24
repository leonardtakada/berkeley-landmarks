/**
 * Getting about: what the two side buttons do on each screen, the tabs that
 * say so beside them, and the moves through a walk that the buttons and the
 * screens' own taps share. And a log of the last touches, for the console.
 */
#include <stdio.h>
#include "bsp/esp-bsp.h"
#include "ui.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* The tabs sit inside the rim, level with the buttons: the upper at about two o'clock, the lower at four. */
#define TAB_H 32
#define TAB_RIGHT 404
#define UPPER_CY 123
#define LOWER_CY 343

/* Where the controls and "End the walk?" go back to. */
static screen_id_t controls_over = SCR_FOLLOW, asked_over = SCR_FOLLOW;

static bool walking(screen_id_t s)
{
    switch (s) {
    case SCR_FOLLOW:
    case SCR_MAP:
    case SCR_CONTROLS:
    case SCR_ARRIVED:
    case SCR_LISTENING:
    case SCR_GUIDESTOP:
    case SCR_HANDOVER:
    case SCR_RESTING:
    case SCR_HARDWARE:
        return true;
    default:
        return false;
    }
}

void ui_arrive(void)
{
    ui_show(SCR_ARRIVED);
}

void ui_listen(void)
{
    ui_show(walk_narration_screen());
}

void ui_next_stop(void)
{
    if (walk_is_free()) {
        ui_show(SCR_EXPLORE); /* on your own: told, back to the map */
        return;
    }
    if (walk_at_last()) {
        ui_show(SCR_WALKED);
        return;
    }
    walk_to(walk_at() + 1);
    ui_show(SCR_FOLLOW);
}

void ui_last_stop(void)
{
    walk_to(walk_at() - 1);
    ui_show(SCR_FOLLOW);
}

void ui_open_controls(void)
{
    if (ui_current() != SCR_CONTROLS && ui_current() != SCR_HARDWARE) controls_over = ui_current();
    ui_show_anim(SCR_CONTROLS, LV_SCREEN_LOAD_ANIM_OVER_BOTTOM, 320);
}

void ui_close_controls(void)
{
    ui_show_anim(controls_over, LV_SCREEN_LOAD_ANIM_OUT_TOP, 320);
}

void ui_ask_end(void)
{
    asked_over = ui_current();
    ui_show(SCR_ENDWALK);
}

void ui_keep_walking(void)
{
    ui_show(asked_over);
}

void ui_button(button_t b)
{
    screen_id_t s = ui_current();
    if (b == BTN_LOWER_HELD) {
        if (walking(s) && !walk_is_free()) ui_ask_end();
        return;
    }
    bool upper = b == BTN_UPPER;
    switch (s) {
    case SCR_COVER:
        ui_show(upper ? SCR_WALKS : SCR_EXPLORE);
        break;
    case SCR_EXPLORE:
        if (upper) explore_go();
        else ui_show(SCR_COVER);
        break;
    case SCR_WALKS:
        if (upper) ui_show(SCR_FINDING);
        else ui_show(SCR_COVER);
        break;
    case SCR_FINDING:
        ui_show(upper ? SCR_FOLLOW : SCR_WALKS);
        break;
    case SCR_FOLLOW:
        if (upper) ui_arrive();
        else ui_open_controls();
        break;
    case SCR_MAP:
        if (!upper) ui_show(SCR_FOLLOW);
        break;
    case SCR_CONTROLS:
        if (upper) ui_next_stop();
        else ui_close_controls();
        break;
    case SCR_HARDWARE:
        if (!upper) ui_show(SCR_CONTROLS);
        break;
    case SCR_ARRIVED:
        if (upper) ui_listen();
        else ui_open_controls();
        break;
    case SCR_HANDOVER:
        if (upper) ui_show(SCR_LISTENING);
        else ui_open_controls();
        break;
    case SCR_LISTENING:
    case SCR_GUIDESTOP:
        if (walk_is_free()) ui_show(SCR_EXPLORE); /* on your own: either button, back to the map */
        else if (upper) ui_next_stop();
        else ui_open_controls();
        break;
    case SCR_RESTING:
        ui_show(SCR_FOLLOW);
        break;
    case SCR_ENDWALK:
        if (upper) ui_show(SCR_WALKED);
        else ui_keep_walking();
        break;
    case SCR_WALKED:
        if (upper) ui_show(SCR_WALKS);
        break;
    default:
        break;
    }
}

static void tab_tapped(lv_event_t *e)
{
    ui_button((button_t)(intptr_t)lv_event_get_user_data(e));
}

/** A tab beside a button: filled for the upper (going on), ruled for the lower. */
static lv_obj_t *tab(lv_obj_t *scr, bool dark, button_t b, const char *s)
{
    bool upper = b == BTN_UPPER;
    lv_obj_t *t = box(scr, 0, 0, LV_SIZE_CONTENT, TAB_H);
    lv_obj_set_style_radius(t, TAB_H / 2, 0);
    lv_obj_set_style_pad_hor(t, 12, 0);
    lv_obj_set_flex_flow(t, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(t, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_color_t ink;
    if (upper) {
        lv_obj_set_style_bg_color(t, dark ? C_CREAM : C_BLUE, 0);
        lv_obj_set_style_bg_opa(t, LV_OPA_COVER, 0);
        ink = dark ? C_BLUE : C_CREAM;
    } else {
        lv_obj_set_style_bg_color(t, C_SLIP, 0);
        lv_obj_set_style_bg_opa(t, dark ? LV_OPA_TRANSP : LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(t, 2, 0);
        lv_obj_set_style_border_color(t, dark ? C_CREAM : C_BLUE, 0);
        ink = dark ? C_CREAM : C_BLUE;
    }
    lv_obj_t *l = text_in(t, &jost_medium_16, ink, s);
    lv_obj_set_style_text_letter_space(l, 2, 0);
    lv_obj_align(t, LV_ALIGN_TOP_RIGHT, TAB_RIGHT - SCREEN_W, (upper ? UPPER_CY : LOWER_CY) - TAB_H / 2);
    lv_obj_add_flag(t, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(t, 18); /* 68 px tall to the finger, about 6.5 mm */
    lv_obj_add_event_cb(t, tab_tapped, LV_EVENT_CLICKED, (void *)(intptr_t)b);
    return t;
}

lv_obj_t *ui_hints(lv_obj_t *scr, uint32_t ground, const char *upper, const char *lower)
{
    bool dark = palette_for(ground).dark;
    lv_obj_t *t = upper ? tab(scr, dark, BTN_UPPER, upper) : NULL;
    if (lower) tab(scr, dark, BTN_LOWER, lower);
    return t;
}

/* --- The last touches, for the console (`touches`) ------------------------------- */

#define TOUCHES 12

static struct {
    uint32_t at_ms;
    int16_t x, y;
    const char *scr;
    bool on;         /* landed on something that takes a tap */
    lv_area_t thing; /* that thing, as drawn */
    bool clicked;    /* and let go on it */
} touches[TOUCHES];
static int touched_n;

static void touched(lv_event_t *e)
{
    lv_obj_t *obj = lv_event_get_param(e);
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
        if (touched_n) touches[(touched_n - 1) % TOUCHES].clicked = true;
        return;
    }
    lv_point_t p;
    lv_indev_get_point(lv_indev_active(), &p);
    typeof(touches[0]) *t = &touches[touched_n++ % TOUCHES];
    *t = (typeof(touches[0])){.at_ms = lv_tick_get(), .x = (int16_t)p.x, .y = (int16_t)p.y, .scr = ui_current_name()};
    t->on = obj && obj != lv_screen_active();
    if (t->on) lv_obj_get_coords(obj, &t->thing);
}

void ui_watch_touches(void)
{
    lv_indev_t *touch = bsp_display_get_input_dev();
    if (!touch) return;
    lv_indev_add_event_cb(touch, touched, LV_EVENT_PRESSED, NULL);
    lv_indev_add_event_cb(touch, touched, LV_EVENT_CLICKED, NULL);
}

void ui_print_touches(void)
{
    uint32_t now = lv_tick_get();
    printf("OK touches=%d", touched_n);
    for (int i = LV_MAX(0, touched_n - TOUCHES); i < touched_n; i++) {
        const typeof(touches[0]) *t = &touches[i % TOUCHES];
        printf(" %d,%d@-%lus/%s", t->x, t->y, (unsigned long)((now - t->at_ms) / 1000), t->scr);
        if (t->on) {
            printf("/on[%ld,%ld-%ld,%ld]%s", (long)t->thing.x1, (long)t->thing.y1, (long)t->thing.x2, (long)t->thing.y2,
                   t->clicked ? "" : "/slid");
        } else {
            printf("/nothing");
        }
    }
    printf("\n");
}
