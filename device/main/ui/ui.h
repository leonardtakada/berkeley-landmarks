/** The screens and moving between them. Call from the LVGL task, or with the display lock held. */
#pragma once
#include "lvgl.h"
#include <stdbool.h>
#include <stdint.h>

typedef enum {
    SCR_COVER,
    SCR_WALKS,
    SCR_FINDING,
    SCR_FOLLOW,
    SCR_MAP,
    SCR_CONTROLS,
    SCR_ARRIVED,
    SCR_LISTENING,
    SCR_GUIDESTOP,
    SCR_HANDOVER,
    SCR_RESTING,
    SCR_WALKED,
    SCR_HARDWARE,
    SCR_ENDWALK,
    SCR_COUNT,
} screen_id_t;

void ui_init(void);
void ui_show(screen_id_t id);

/** Shows a screen with its own way in (the controls drop like a shade). */
void ui_show_anim(screen_id_t id, lv_screen_load_anim_t anim, uint32_t ms);

/** An event callback that shows the screen whose id is the event's user data. */
void ui_go(lv_event_t *e);
#define UI_GO(id) ((void *)(intptr_t)(id))

/** By name, for the console ("cover", "walks", …). False if there's no such screen. */
bool ui_show_named(const char *name);

/** True while `scr` is the screen last shown (not one on its way out). */
bool ui_is_current(lv_obj_t *scr);

/** Calls `then` after `ms`, if `scr` is still the screen shown by then. */
void ui_after(lv_obj_t *scr, uint32_t ms, void (*then)(void));

/** The screen last shown, and its name. */
screen_id_t ui_current(void);
const char *ui_current_name(void);

/** A new, empty screen on `bg`, not yet shown. */
lv_obj_t *ui_screen(lv_color_t bg);

/** The walk being chosen or walked (0-based). */
extern int ui_walk;

/**
 * The two side buttons (nav.c). Through a walk the upper goes on (I'm here,
 * listen, next stop) and the lower opens the controls; held, the lower ends
 * the walk, asking first. Off a walk the upper goes forward and the lower back
 * (on the walks, it turns to the next).
 */
typedef enum { BTN_UPPER, BTN_LOWER, BTN_LOWER_HELD } button_t;
void ui_button(button_t b);

/**
 * What the side buttons do on this screen, on two small tabs beside them;
 * tapping a tab presses its button. Either may be NULL. `ground` is the
 * screen's colour, for the tabs' inks.
 */
void ui_hints(lv_obj_t *scr, uint32_t ground, const char *upper, const char *lower);

/* Moving through a walk, for the screens' own taps as well as the buttons. */
void ui_arrive(void);         /* at the stop: its label, then its narration */
void ui_listen(void);         /* the stop's narration */
void ui_next_stop(void);      /* on to the next stop, or the walk's end after the last */
void ui_last_stop(void);      /* back to the stop before */
void ui_open_controls(void);  /* the shade comes down over this screen */
void ui_close_controls(void); /* and goes back up */
void ui_ask_end(void);        /* "End the walk?" */
void ui_keep_walking(void);   /* no: back where you were */

/* Each screen builds itself and returns its screen object. */
lv_obj_t *screen_cover(void);
lv_obj_t *screen_walks(void);
void screen_walks_turn(int dir); /* the next walk (1) or the one before (-1) */
lv_obj_t *screen_finding(void);
lv_obj_t *screen_follow(void);
lv_obj_t *screen_map(void);
lv_obj_t *screen_controls(void);
lv_obj_t *screen_arrived(void);
lv_obj_t *screen_listening(void);
lv_obj_t *screen_guidestop(void);
lv_obj_t *screen_handover(void);
lv_obj_t *screen_resting(void);
lv_obj_t *screen_walked(void);
lv_obj_t *screen_hardware(void);
lv_obj_t *screen_endwalk(void);
