/**
 * The walk under way: whether it's still in its introduction, which stop
 * you're making for or standing at, where you are against it (walk_nav: from
 * the GNSS, or a pretend position at the desk), how much of its narration
 * you've heard, and the labels collected, each earned by standing at its stop.
 * `ui_walk` says which walk. The screens read it; the buttons move it on.
 */
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "data.h"
#include "landmarks.h"
#include "portrait.h"
#include "ui.h"

const walk_t *walk_now(void);

/** The stop you're making for or standing at (0-based), and the stop itself. */
int walk_at(void);
const stop_t *walk_stop(void);

/**
 * The order the walk goes in: from the stop it was begun at to its end, then
 * round to the stops before (begun at stop 4 of 10: 4 … 10, then 1, 2, 3).
 * The last is the one before the start; the first, the start.
 */
bool walk_at_last(void);
bool walk_at_first(void);
int walk_started_at(void);
int walk_next(void);
int walk_before(void);

/** The host's portrait, or NULL: then the walk's label scene stands in. */
const art_portrait_t *walk_host(void);

/** The colour behind a portrait, or the paper behind the walk's scene when there's none. */
uint32_t walk_ground(const art_portrait_t *art);

/** `art` filling the screen in `mood`, or with none, the walk's label scene. Returns the portrait, or NULL. */
lv_obj_t *walk_companion(lv_obj_t *scr, const art_portrait_t *art, mood_t mood);

/** The stop's narrator, if their portrait is baked; NULL for the guide or anyone not yet drawn. */
const art_portrait_t *walk_speaker(void);

/** True when the stop is the host's own. */
bool walk_host_speaks(void);

/** Sets out on `ui_walk` from stop `first`: its introduction first (if the card has it), then that stop; nothing collected. */
void walk_begin(int first);

/** True while the walk's introduction is the story; its part on the card ("w01i"). */
bool walk_in_intro(void);
void walk_intro_part(char *buf, size_t len);

/** Makes for stop `i` (Next stop, Last stop: walk_next(), walk_before()), the introduction over. */
void walk_to(int i);

/** The labels: earned by standing at a stop. */
bool walk_collected(int i);
int walk_collected_count(void);

/** True, once, when the stop's label is collected and its stamp not yet pressed on the story. */
bool walk_stamp_due(void);

/** True once you've reached the stop you're making for (and until you make for another). */
bool walk_here(void);

/** Where you are against the stop you're making for. */
typedef struct {
    bool located;       /* a fix, or a pretend position */
    bool sure;          /* sure enough to say you're at a stop (lib/arrival.ts: 50 m) */
    bool moving;        /* walking: the way can be given as a turn */
    bool on_route;      /* within reach of the way the walk goes */
    bool here;          /* at the stop (walk_here) */
    bool arrived_now;   /* and only just */
    int metres;         /* to it: along the route while on it, else as the crow flies */
    float way;          /* the bearing to head on, degrees from north */
    float turn;         /* that, against your course: −180 (back left) to 180, while moving */
    double aim_lat, aim_lon; /* the point the way heads for */
} walk_nav_t;

/** Where you are now; also collects the label of any stop you're standing at. Off a walk, not located. */
walk_nav_t walk_nav(void);

/** At the desk, a pretend position that walks itself ("here walk") takes `metres` along the way; else nothing. */
void walk_pretend_step(double metres);

/** The turn in words: "Straight on", "Bear left", "Turn right", "Turn around". */
const char *walk_turn_words(const walk_nav_t *n);

/** Metres from (lat, lon) to a walk's first stop. */
int walk_metres_from_start(const walk_t *w, double lat, double lon);

/** How much of the story has played, so it picks up where it was. */
uint32_t walk_heard_ms(void);
void walk_set_heard_ms(uint32_t ms);

/**
 * On your own (the free map): one landmark as if it were a walk of one stop,
 * so the story screen can tell it. Ended when the map comes back.
 */
void walk_free(const landmark_t *l);
void walk_end_free(void);
bool walk_is_free(void);
