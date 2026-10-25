/** The screens and moving between them. Call from the LVGL task, or with the display lock held. */
#pragma once
#include "lvgl.h"
#include <stdbool.h>
#include <stdint.h>

/* Choose (Walks) → Walk (Follow) → Story, stop by stop; the menu (Controls) and the map come over
 * whichever of those you're on and go back to exactly it. */
typedef enum {
    SCR_COVER,
    SCR_WALKS,
    SCR_FOLLOW,
    SCR_MAP,
    SCR_CONTROLS,
    SCR_STORY,
    SCR_WALKED,
    SCR_HARDWARE,
    SCR_ENDWALK,
    SCR_EXPLORE,
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

/** The volume on the controls, 0 (silent) to 10; the narration and the guide's sounds follow it. */
int ui_volume(void);

/** The walk being chosen or walked (0-based). */
extern int ui_walk;

/**
 * The two side buttons (nav.c). The upper does the screen's one main thing,
 * named on its tab: Walks, Start, Listen, Pause and Resume, Next stop, Go.
 * The lower is always the menu on a walk and Back anywhere else.
 */
typedef enum { BTN_UPPER, BTN_LOWER } button_t;
void ui_button(button_t b);

/**
 * What the side buttons do on this screen, on two tabs beside them; tapping a
 * tab presses its button, so each tab is the one button for its action and
 * nothing else on the screen repeats it. Either may be NULL. `ground` is the
 * screen's colour, for the tabs' inks.
 *
 * The tabs sit inside the rim level with the buttons, the upper at about two
 * o'clock, the lower at four, each in a band TAB_H tall about its centre.
 * What a screen puts at those heights keeps its right edge at TAB_CLEAR_X or
 * left of it (a tab of one short word starts about 12 px right of that; the
 * two-word ones, NEXT STOP and FIRST STOP, reach further in).
 */
#define TAB_H 40
#define UPPER_CY 123
#define LOWER_CY 343
#define TAB_CLEAR_X 286
lv_obj_t *ui_hints(lv_obj_t *scr, uint32_t ground, const char *upper, const char *lower); /* returns the upper tab */

/** Keeps the last touches of the screen, for the console's `touches`: where, on what, and whether it took. */
void ui_watch_touches(void);
void ui_print_touches(void);

/* Moving through a walk, for the screens' own buttons as well as the side ones. */
void ui_start_walk(int first); /* the walk chosen (ui_walk), from stop `first`: its introduction, then that stop */
void ui_listen(void);         /* the stop's story */
void ui_next_stop(void);      /* on to the next stop (the first, after the introduction), or the walk's end */
void ui_last_stop(void);      /* back to the stop before */
void ui_open_controls(void);  /* the menu comes down over this screen */
void ui_close_controls(void); /* and goes back up, to exactly where you were */
void ui_open_map(void);       /* the walk's map, over this screen (or over what the menu came down on) */
void ui_close_map(void);      /* and back to exactly where you were */
void ui_ask_end(void);        /* "End the walk?" */
void ui_keep_walking(void);   /* no: back where you were */

/* Each screen builds itself and returns its screen object. */
lv_obj_t *screen_cover(void);
lv_obj_t *screen_walks(void);
lv_obj_t *screen_follow(void);
lv_obj_t *screen_map(void);
lv_obj_t *screen_controls(void);
lv_obj_t *screen_story(void);
lv_obj_t *screen_walked(void);
lv_obj_t *screen_hardware(void);
lv_obj_t *screen_endwalk(void);
lv_obj_t *screen_explore(void);

/** The free map's upper button: go to the landmark picked, or stop going. */
void explore_go(void);

/** The story's upper button: pause, resume, or once it's told, go on. */
void story_upper(void);

/** The walks' upper button: sets out on the walk showing, from the stop chosen. */
void walks_start(void);
