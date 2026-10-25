/** Small pieces the screens share: plain boxes, type, slips, dots and drawn marks. */
#pragma once
#include "lvgl.h"
#include "theme.h"

/** A plain, transparent box: no theme, no scrolling, not clickable. */
lv_obj_t *box(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h);

/** A filled circle. */
lv_obj_t *disc(lv_obj_t *parent, int32_t x, int32_t y, int32_t d, lv_color_t color);

/** A line of type, centred across the screen with its top at `y`. */
lv_obj_t *line_centered(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, int32_t y, const char *s);

/** A label with no position of its own, for a flex row or column. */
lv_obj_t *text_in(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, const char *s);

/** A label at a position (no centring). */
lv_obj_t *text_at(lv_obj_t *parent, const lv_font_t *font, lv_color_t color, int32_t x, int32_t y, const char *s);

/** Tracked capitals above a title ("STOP 5 OF 10"). */
lv_obj_t *kicker(lv_obj_t *parent, lv_color_t color, int32_t y, const char *s);

/** A paper slip: a blue rule along its top, a soft shadow. */
lv_obj_t *slip(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h);

/**
 * What the companion says: a small slip that comes and goes on a 10 s cycle.
 * `second` shows it in the other half of the cycle, so two can alternate.
 */
lv_obj_t *say(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, const char *s, bool second);

/** The same slip, shown once after `delay_ms` and kept. */
lv_obj_t *say_once(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, const char *s, uint32_t delay_ms);

/**
 * Stop `i` (0-based) of `n` as a segment of the rim, clockwise from the top,
 * like the walk's progress ring on the canvas. Only its own corner of the
 * screen redraws when its arc colour or opacity changes (m_arc_opa).
 */
lv_obj_t *rim_segment(lv_obj_t *parent, int i, int n, lv_color_t color);

/** A length of the rim that can move: rim_arc_set gives where it starts and how long it runs. */
lv_obj_t *rim_arc(lv_obj_t *parent, lv_color_t color);

/** From `from10` tenths of a degree clockwise from straight up, for `len10`. */
void rim_arc_set(lv_obj_t *arc, int32_t from10, int32_t len10);

/** Progress round the rim from straight up; only the stretch that changes redraws. */
lv_obj_t *rim_progress(lv_obj_t *parent, lv_color_t color);

/** Sets how far round it reaches, in tenths of a degree (0 … 3600). */
void rim_progress_set(lv_obj_t *bar, int32_t len10);

/**
 * A label stamp, as the app presses them: a paper disc `d` across centred on
 * (cx, cy), vermilion rings, `middle` across the centre and lettering round
 * the top and foot. `inner` adds the ring round a stop's number. Tilted by
 * `tilt10` (0.1 degree); returns the stamp, to press in and turn.
 */
lv_obj_t *stamp(lv_obj_t *parent, int32_t cx, int32_t cy, int32_t d, const char *top, const char *middle,
                const lv_font_t *middle_font, const char *bottom, bool inner, int32_t tilt10);

/** Presses stamp `s` (`d` across, centred at (cx, cy)) in after `delay`: down from half as big again and a turn, an ink ring spreading, then rocking slowly. */
void stamp_press(lv_obj_t *parent, lv_obj_t *s, int32_t cx, int32_t cy, int32_t d, int32_t tilt10, uint32_t delay);

/**
 * The way to the next stop: an arrowhead riding just inside the rim, pointing
 * out along the bearing, with a cut-paper shadow under it.
 */
lv_obj_t *rim_pointer(lv_obj_t *parent, lv_color_t color, lv_color_t shadow);

/** Turns the pointer to `deg10` tenths of a degree, clockwise from straight up. */
void rim_pointer_set(lv_obj_t *pointer, int32_t deg10);

/** A stop's number in a blue dot, as the app's walk card draws it. */
lv_obj_t *stop_dot(lv_obj_t *parent, int32_t d, int n, lv_color_t bg, lv_color_t fg);

/** A chevron for previous/next, drawn in `color`. */
lv_obj_t *chevron(lv_obj_t *parent, bool right, lv_color_t color);

/** The guide's arrow, pointing right, for "Set out on foot". */
lv_obj_t *arrow_right(lv_obj_t *parent, lv_color_t color);

/** The folded-map mark. */
lv_obj_t *map_mark(lv_obj_t *parent, lv_color_t color);

/**
 * A labelled button: a pill `w` × `h` at (x, y) with its word, filled in `fill`
 * with lettering in `ink`, or (not `filled`) ringed in `ink` on a slip. Taken
 * a fingertip beyond what's drawn. Its word is its only child, so a glyph
 * added to it and moved to index 0 goes before the word.
 */
lv_obj_t *pill(lv_obj_t *parent, int32_t x, int32_t y, int32_t w, int32_t h, bool filled, lv_color_t fill, lv_color_t ink,
               const char *s, lv_event_cb_t clicked);

/** A map's + (dir 1) or − (−1), on the left at `y`; `clicked` gets dir as its user data. */
lv_obj_t *zoom_button(lv_obj_t *scr, int32_t y, int dir, lv_event_cb_t clicked);
