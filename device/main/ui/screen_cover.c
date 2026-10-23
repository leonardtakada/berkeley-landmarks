/**
 * The cover (design canvas, "Main"): the board, the Campanile before a rising
 * sun, the title in Berkeley Post, a ring of lettering, and BEGIN, breathing
 * until it's pressed.
 *
 * The canvas turns the ring once in 80 s. Here it holds still: turning it
 * redraws the whole screen at every step, which the S3 manages only about ten
 * times a second, and everything else on the cover slows with it.
 */
#include "ui.h"
#include "art.h"
#include "motion.h"
#include "theme.h"
#include "widgets.h"

static lv_obj_t *ring_text(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, int32_t space,
                           uint32_t radius, lv_arclabel_dir_t dir, const char *s)
{
    lv_obj_t *a = lv_arclabel_create(parent);
    lv_obj_remove_flag(a, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(a, SCREEN_W, SCREEN_H);
    lv_obj_set_pos(a, 0, 0);
    lv_obj_set_style_text_font(a, font, 0);
    lv_obj_set_style_text_color(a, color, 0);
    lv_obj_set_style_text_letter_space(a, space, 0);
    lv_arclabel_set_text_static(a, s);
    lv_arclabel_set_radius(a, radius);
    lv_arclabel_set_angle_start(a, dir == LV_ARCLABEL_DIR_CLOCKWISE ? 180 : 0);
    lv_arclabel_set_angle_size(a, 180);
    lv_arclabel_set_dir(a, dir);
    lv_arclabel_set_text_horizontal_align(a, LV_ARCLABEL_TEXT_ALIGN_CENTER);
    /* Letters stand on the circle at the top and hang from it at the foot, as on the canvas. */
    lv_arclabel_set_text_vertical_align(a, dir == LV_ARCLABEL_DIR_CLOCKWISE ? LV_ARCLABEL_TEXT_ALIGN_TRAILING
                                                                             : LV_ARCLABEL_TEXT_ALIGN_LEADING);
    return a;
}

static lv_obj_t *pill(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h, lv_opa_t opa)
{
    lv_obj_t *o = box(parent, x, y, w, h);
    lv_obj_set_style_radius(o, h / 2, 0);
    lv_obj_set_style_bg_color(o, C_CREAM, 0);
    lv_obj_set_style_bg_opa(o, opa, 0);
    return o;
}

/** Prints in: up from 14 px below as it inks. */
static void print_in(lv_obj_t *o, uint32_t ms, uint32_t delay)
{
    motion_once(o, 0, 255, ms, delay, m_opa);
    motion_once(o, 14, 0, ms, delay, m_y);
}

static void begin_clicked(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_show(SCR_WALKS);
}

lv_obj_t *screen_cover(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);

    /* The sun rises behind the tower, then glows. */
    lv_obj_t *sun_box = box(scr, 171, 74, 124, 124);
    lv_obj_t *sun = disc(sun_box, 6, 6, 112, C_VERMILION);
    motion_loop(sun, KF({0, 112}, {500, 118}, {1000, 112}), 7000, 2400, m_size);
    motion_once(sun_box, 70, 0, 2200, 200, m_y);
    motion_once(sun_box, 0, 255, 2200, 200, m_opa);

    lv_obj_t *cloud_a = pill(scr, 92, 118, 74, 18, 217);
    motion_loop(cloud_a, KF({0, -26}, {500, 26}, {1000, -26}), 32000, 0, m_x);
    lv_obj_t *cloud_b = pill(scr, 296, 96, 56, 14, 178);
    /* Seven seconds into its swing already, as the canvas staggers it. */
    motion_loop(cloud_b, KF({0, -12}, {333, 26}, {833, -26}, {1000, -12}), 42000, 0, m_x);

    lv_obj_t *rim = box(scr, 9, 9, 448, 448);
    lv_obj_set_style_radius(rim, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(rim, 2, 0);
    lv_obj_set_style_border_color(rim, C_CREAM, 0);
    lv_obj_set_style_border_opa(rim, 62, 0);

    /* LVGL sets each letter by its line box, not its baseline: these radii put the
     * baselines on the canvas's circles, 176 and 200 px out (measured by snap.py). */
    ring_text(scr, &jost_medium_16, C_CREAM, 4, 179, LV_ARCLABEL_DIR_CLOCKWISE, "A FIELD GUIDE TO THE CITY");
    ring_text(scr, &jost_regular_16, C_BLUE_TINT, 4, 191, LV_ARCLABEL_DIR_COUNTER_CLOCKWISE, "BERKELEY \xC2\xB7 CALIFORNIA");

    lv_obj_t *tower = lv_image_create(scr);
    lv_image_set_src(tower, &art_cover_tower);
    lv_obj_set_pos(tower, 163, 66);
    motion_loop(tower, KF({0, 0}, {500, -4}, {1000, 0}), 6000, 1200, m_y);
    motion_once(tower, 16, 0, 1000, 100, m_y);
    motion_once(tower, 0, 255, 1000, 100, m_opa);

    /* Two lines on a 44 px measure, whatever the face's own line height. */
    int32_t lead = (44 - berkeley_post_46.line_height) / 2;
    const char *title[] = {"BERKELEY", "TOURS"};
    for (int i = 0; i < 2; i++) {
        lv_obj_t *l = line_centered(scr, &berkeley_post_46, C_CREAM, 238 + i * 44 + lead, title[i]);
        lv_obj_set_style_text_letter_space(l, 1, 0);
        print_in(l, 700, 700 + i * 200);
    }

    lv_obj_t *begin = box(scr, 149, 344, 168, 56);
    lv_obj_add_flag(begin, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_radius(begin, 28, 0);
    lv_obj_set_style_bg_color(begin, C_CREAM, 0);
    lv_obj_set_style_bg_opa(begin, LV_OPA_COVER, 0);
    lv_obj_set_style_outline_color(begin, C_CREAM, 0);
    lv_obj_t *label = lv_label_create(begin);
    lv_obj_set_style_text_font(label, &jost_semibold_16, 0);
    lv_obj_set_style_text_color(label, C_BLUE, 0);
    lv_obj_set_style_text_letter_space(label, 4, 0);
    lv_label_set_text_static(label, "BEGIN");
    lv_obj_center(label);
    motion_loop(begin, KF({0, 0}, {600, 1000}, {1000, 0}), 2800, 2000, m_outline);
    print_in(begin, 600, 1300);
    lv_obj_add_event_cb(begin, begin_clicked, LV_EVENT_CLICKED, NULL);

    ui_hints(scr, 0x0A2C8D, "WALKS", "MAP");
    return scr;
}
