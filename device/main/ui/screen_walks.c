/**
 * Choosing a walk (design canvas, "Walks"): each walk's label scene fills the
 * circle with its slip laid over it. Swipe or press the side buttons to turn
 * to the next walk; tap anywhere else to set out on it.
 */
#include <stdio.h>
#include "ui.h"
#include "data.h"
#include "motion.h"
#include "scene.h"
#include "theme.h"
#include "widgets.h"

/* Where the walks' dots sit, following the rim at the foot of the circle. */
static const lv_point_t spots[WALK_COUNT] = {
    {128, 415}, {145, 424}, {163, 430}, {181, 436}, {200, 439}, {219, 441},
    {239, 441}, {258, 439}, {277, 436}, {295, 430}, {313, 424}, {330, 415},
};

/* A drag this far across turns the page; a touch that moves less than a tap's
 * slack sets out; anything between is let go. */
#define TURN_PX 50
#define TAP_SLACK_PX 16

/* There's one walk picker at a time, so its parts live here. */
static lv_obj_t *page;
static lv_obj_t *dots[WALK_COUNT];
static lv_point_t pressed_at;

static void turn_to(lv_obj_t *scr, int i, int dir);

static void page_pressed(lv_event_t *e)
{
    LV_UNUSED(e);
    lv_indev_get_point(lv_indev_active(), &pressed_at);
}

/**
 * LVGL reports a swipe only when it's quick; a slower drag ends as a click.
 * So the click looks at how far the finger went before setting out.
 */
static void page_clicked(lv_event_t *e)
{
    lv_point_t at;
    lv_indev_get_point(lv_indev_active(), &at);
    int32_t dx = at.x - pressed_at.x, dy = at.y - pressed_at.y;
    if (LV_ABS(dx) >= TURN_PX && LV_ABS(dx) > LV_ABS(dy)) {
        int dir = dx < 0 ? 1 : -1;
        turn_to(lv_obj_get_screen(lv_event_get_current_target_obj(e)), ui_walk + dir, dir);
    } else if (LV_ABS(dx) <= TAP_SLACK_PX && LV_ABS(dy) <= TAP_SLACK_PX) {
        ui_show(SCR_FINDING);
    }
}

static lv_obj_t *slip_line(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, const char *s)
{
    lv_obj_t *l = lv_label_create(parent);
    lv_obj_set_style_text_font(l, font, 0);
    lv_obj_set_style_text_color(l, color, 0);
    lv_label_set_text(l, s);
    return l;
}

/** Walk `i`'s scene and slip, sliding in from `from_x` px aside (0: no slide). */
static lv_obj_t *build_page(lv_obj_t *scr, int i, int32_t from_x)
{
    const walk_t *w = &walks[i];
    lv_obj_t *p = box(scr, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_add_flag(p, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(p, page_pressed, LV_EVENT_PRESSED, NULL);
    lv_obj_add_event_cb(p, page_clicked, LV_EVENT_CLICKED, NULL);
    scene_create(p, &art_scenes[i]);

    lv_obj_t *s = slip(p, 64, 0, 268, LV_SIZE_CONTENT);
    lv_obj_align(s, LV_ALIGN_BOTTOM_LEFT, 64, 408 - SCREEN_H);
    lv_obj_set_style_pad_bottom(s, 14, 0);
    lv_obj_set_flex_flow(s, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_top(s, 14, 0);

    char buf[48];
    snprintf(buf, sizeof buf, "WALK %02d", i + 1);
    lv_obj_t *k = slip_line(s, &jost_medium_16, C_BLUE, buf);
    lv_obj_set_style_text_letter_space(k, 3, 0);
    lv_obj_t *title = slip_line(s, &jost_light_25, C_CHARCOAL, w->name);
    lv_obj_set_width(title, 240);
    lv_label_set_long_mode(title, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, 0);
    snprintf(buf, sizeof buf, "%d stops \xC2\xB7 %s \xC2\xB7 %s", w->stop_count, w->distance, w->duration);
    slip_line(s, &jost_regular_18, C_SEPIA, buf);

    lv_obj_t *cta = box(s, 0, 0, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(cta, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(cta, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(cta, 6, 0);
    lv_obj_set_style_margin_top(cta, 6, 0);
    slip_line(cta, &jost_medium_16, C_BLUE, "Set out on foot");
    arrow_right(cta, C_BLUE);

    motion_once(s, 0, 255, 500, 120, m_opa);
    motion_once(s, 14, 0, 500, 120, m_y);
    if (from_x) {
        motion_once(p, 0, 255, 550, 0, m_opa);
        motion_once(p, from_x, 0, 550, 0, m_x);
    }
    return p;
}

static void turn_to(lv_obj_t *scr, int i, int dir)
{
    ui_walk = (i + WALK_COUNT) % WALK_COUNT;
    lv_obj_t *old = page;
    page = build_page(scr, ui_walk, old ? 28 * dir : 0);
    /* Over the old page, under the buttons and dots; the old one goes once it's covered. */
    lv_obj_move_to_index(page, old ? lv_obj_get_index(old) + 1 : 0);
    if (old) lv_obj_delete_delayed(old, 600);
    for (int k = 0; k < WALK_COUNT; k++) {
        if (dots[k]) lv_obj_set_style_bg_color(dots[k], k == ui_walk ? C_BLUE : C_BLUE_TINT, 0);
    }
}

void screen_walks_turn(int dir)
{
    if (page) turn_to(lv_obj_get_screen(page), ui_walk + dir, dir);
}

static void side_clicked(lv_event_t *e)
{
    int dir = (int)(intptr_t)lv_event_get_user_data(e);
    turn_to(lv_obj_get_screen(lv_event_get_target_obj(e)), ui_walk + dir, dir);
}

static void swiped(lv_event_t *e)
{
    lv_indev_t *indev = lv_indev_active();
    lv_dir_t d = lv_indev_get_gesture_dir(indev);
    if (d != LV_DIR_LEFT && d != LV_DIR_RIGHT) return;
    /* A swipe isn't also a tap on the page. */
    lv_indev_wait_release(indev);
    int dir = d == LV_DIR_LEFT ? 1 : -1;
    turn_to(lv_event_get_current_target_obj(e), ui_walk + dir, dir);
}

static lv_obj_t *side_button(lv_obj_t *scr, int32_t x, int dir)
{
    lv_obj_t *b = disc(scr, x, 209, 48, C_SLIP);
    lv_obj_set_style_bg_opa(b, 230, 0);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(b, 8);
    lv_obj_center(chevron(b, dir > 0, C_BLUE));
    lv_obj_add_event_cb(b, side_clicked, LV_EVENT_CLICKED, (void *)(intptr_t)dir);
    return b;
}

static void forget(lv_event_t *e)
{
    /* A new picker may already be up while this one fades out; leave its parts be. */
    if (page && lv_obj_get_screen(page) != lv_event_get_current_target_obj(e)) return;
    page = NULL;
    lv_memzero(dots, sizeof dots);
}

lv_obj_t *screen_walks(void)
{
    lv_obj_t *scr = ui_screen(C_PAPER);
    page = NULL;
    lv_memzero(dots, sizeof dots);

    side_button(scr, 12, -1);
    side_button(scr, 406, 1);
    for (int k = 0; k < WALK_COUNT; k++) {
        dots[k] = disc(scr, spots[k].x, spots[k].y, 8, C_BLUE_TINT);
        lv_obj_set_style_outline_width(dots[k], 2, 0);
        lv_obj_set_style_outline_color(dots[k], C_SLIP, 0);
        lv_obj_set_style_outline_opa(dots[k], 180, 0);
    }
    turn_to(scr, ui_walk, 0);
    ui_hints(scr, 0xFAF6EC, "SET OUT", "BACK");

    lv_obj_add_event_cb(scr, swiped, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(scr, forget, LV_EVENT_DELETE, NULL);
    return scr;
}
