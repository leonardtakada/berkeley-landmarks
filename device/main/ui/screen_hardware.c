/**
 * The hardware check (Phase 1), for testing away from the Mac: tap the
 * status line on the controls shade. The GPS as it finds the sky, how the
 * guide is tipped and turning, the power, the card, and a button for the
 * chime. Reads four times a second.
 */
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "audio/sound.h"
#include "esp_timer.h"
#include "gnss/gnss.h"
#include "heading/imu.h"
#include "hw.h"
#include "motion.h"
#include "power/pmu.h"
#include "storage/card.h"
#include "theme.h"
#include "widgets.h"

#define LABEL_RIGHT 150 /* the labels end here; the readings start just after */
#define VALUE_X 162
#define VALUE_W 250
#define CHIME_VOLUME 70

typedef struct {
    lv_obj_t *gps[3], *motion, *power, *card, *uptime;
    lv_timer_t *timer;
} hardware_t;

static lv_obj_t *row(lv_obj_t *scr, int32_t y, const char *label, int lines, lv_obj_t **values)
{
    if (label) {
        lv_obj_t *l = text_in(scr, &jost_medium_16, C_BLUE_TINT, label);
        lv_obj_set_style_text_letter_space(l, 2, 0);
        lv_obj_set_width(l, LABEL_RIGHT - 40);
        lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_RIGHT, 0);
        lv_obj_set_pos(l, 40, y + 2);
    }
    for (int i = 0; i < lines; i++) {
        values[i] = text_at(scr, &jost_regular_16, C_CREAM, VALUE_X, y + i * 22, "");
        lv_obj_set_width(values[i], VALUE_W);
        lv_label_set_long_mode(values[i], LV_LABEL_LONG_MODE_CLIP);
    }
    return values[0];
}

static void mm_ss(char *buf, size_t len, int64_t ms)
{
    int s = (int)(ms / 1000);
    snprintf(buf, len, "%d:%02d", s / 60, s % 60);
}

static void refresh(lv_timer_t *t)
{
    hardware_t *h = lv_timer_get_user_data(t);
    hw_started_t on = hw_started();
    int64_t now = esp_timer_get_time() / 1000;
    char a[48], b[48];

    gnss_state_t g = gnss_state();
    bool silent = g.last_sentence_ms < 0 ? now > GNSS_STALE_MS :
                                         now - g.last_sentence_ms > GNSS_STALE_MS;
    if (!g.ok) {
        lv_label_set_text(h->gps[0], "GPS reconnecting");
        lv_label_set_text(h->gps[1], "Retrying the connection");
        lv_label_set_text(h->gps[2], "");
    } else if (silent) {
        lv_label_set_text(h->gps[0], "GPS data paused");
        lv_label_set_text(h->gps[1], "Trying to reconnect");
        lv_label_set_text(h->gps[2], "");
    } else if (!g.fix) {
        lv_label_set_text_fmt(h->gps[0], "Searching \xC2\xB7 %d in view", g.sats_in_view);
        lv_label_set_text(h->gps[1], "Take outside, face up");
        lv_label_set_text(h->gps[2], "Check GPS antenna");
    } else {
        lv_label_set_text_fmt(h->gps[0], "Fix \xC2\xB7 %d of %d \xC2\xB7 HDOP %.1f", g.sats_used, g.sats_in_view, g.hdop);
        lv_label_set_text_fmt(h->gps[1], "%.5f, %.5f", g.lat, g.lon);
        mm_ss(a, sizeof a, g.first_fix_ms);
        lv_label_set_text_fmt(h->gps[2], "first fix after %s", a);
    }

    imu_state_t m = imu_state();
    if (!on.imu || !m.ok) {
        lv_label_set_text(h->motion, "No answer");
    } else {
        float turning = sqrtf(m.gx * m.gx + m.gy * m.gy + m.gz * m.gz);
        lv_label_set_text_fmt(h->motion, "tipped %.0f\xC2\xB0 \xC2\xB7 turning %.0f\xC2\xB0/s", imu_tilt(&m), turning);
    }

    pmu_state_t p = pmu_state();
    if (!on.pmu || !p.ok) {
        lv_label_set_text(h->power, "No answer");
    } else {
        if (p.battery) snprintf(a, sizeof a, "Battery %.2f V \xC2\xB7 %d%%%s", p.battery_mv / 1000.0f, p.percent, p.charging ? " \xC2\xB7 charging" : "");
        else snprintf(a, sizeof a, "No battery");
        if (p.usb && !p.battery) snprintf(b, sizeof b, " \xC2\xB7 USB %.1f V", p.usb_mv / 1000.0f);
        else b[0] = '\0';
        lv_label_set_text_fmt(h->power, "%s%s", a, b);
    }

    card_state_t c = card_state();
    if (!c.checked) lv_label_set_text(h->card, "Checking\xE2\x80\xA6");
    else if (!c.mounted && strcmp(c.error, "no card") == 0) lv_label_set_text(h->card, "No card");
    else if (!c.mounted) lv_label_set_text_fmt(h->card, "No card (%s)", c.error);
    else lv_label_set_text_fmt(h->card, "%.1f GB, %.1f free \xC2\xB7 %s", c.size_mb / 1024.0, c.free_mb / 1024.0,
                               c.read_write_ok ? "ok" : "write failed");

    mm_ss(a, sizeof a, now);
    lv_label_set_text_fmt(h->uptime, "on for %s", a);
}

static void chime(lv_event_t *e)
{
    LV_UNUSED(e);
    sound_chime_async(CHIME_VOLUME);
}

static void recheck(lv_event_t *e)
{
    LV_UNUSED(e);
    hw_check_card();
}

static void done(lv_event_t *e)
{
    hardware_t *h = lv_event_get_user_data(e);
    lv_timer_delete(h->timer);
    lv_free(h);
}

lv_obj_t *screen_hardware(void)
{
    lv_obj_t *scr = ui_screen(C_BOARD);
    hardware_t *h = lv_malloc(sizeof(hardware_t));
    lv_memzero(h, sizeof(*h));

    lv_obj_t *k = kicker(scr, C_BLUE_TINT, 44, "HARDWARE CHECK");
    lv_obj_set_style_text_letter_space(k, 4, 0);

    row(scr, 80, "GPS", 3, h->gps);
    row(scr, 160, "MOTION", 1, &h->motion);
    row(scr, 194, "POWER", 1, &h->power);
    row(scr, 228, "CARD", 1, &h->card);
    lv_obj_add_flag(h->card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(h->card, recheck, LV_EVENT_CLICKED, NULL);

    lv_obj_t *play = box(scr, 123, 276, 220, 52);
    lv_obj_add_flag(play, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_radius(play, 26, 0);
    lv_obj_set_style_border_width(play, 2, 0);
    lv_obj_set_style_border_color(play, C_CREAM, 0);
    lv_obj_set_style_border_opa(play, 128, 0);
    lv_obj_center(text_in(play, &jost_regular_16, C_CREAM, "Play the chime"));
    lv_obj_add_event_cb(play, chime, LV_EVENT_CLICKED, NULL);

    h->uptime = line_centered(scr, &jost_regular_16, C_BLUE_TINT, 344, "");

    lv_obj_t *back = box(scr, 183, 376, 100, 52);
    lv_obj_add_flag(back, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(back, ui_go, LV_EVENT_CLICKED, UI_GO(SCR_CONTROLS));
    lv_obj_t *grip = box(back, 30, 6, 40, 5);
    lv_obj_set_style_radius(grip, 3, 0);
    lv_obj_set_style_bg_color(grip, C_CREAM, 0);
    lv_obj_set_style_bg_opa(grip, 102, 0);
    lv_obj_t *d = text_in(back, &jost_regular_18, C_BLUE_TINT, "Done");
    lv_obj_align(d, LV_ALIGN_BOTTOM_MID, 0, -6);

    h->timer = lv_timer_create(refresh, 250, h);
    refresh(h->timer);
    lv_obj_add_event_cb(scr, done, LV_EVENT_DELETE, h);
    ui_hints(scr, 0x0A2C8D, NULL, "BACK");
    return scr;
}
