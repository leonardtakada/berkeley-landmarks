/**
 * The walk under way: which stop you're making for or standing at, how far
 * off it is, how much of its narration you've heard, and the labels
 * collected. `ui_walk` says which walk. The screens read it; the side
 * buttons, taps and (Phase 4) arrival move it on.
 *
 * Until the GNSS drives it, the distance is simulated: it starts at the
 * crow-flies metres from the stop before and closes at walking pace.
 */
#pragma once
#include <stdbool.h>
#include "data.h"
#include "landmarks.h"
#include "portrait.h"
#include "ui.h"

const walk_t *walk_now(void);

/** The stop you're making for or standing at (0-based), and the stop itself. */
int walk_at(void);
const stop_t *walk_stop(void);
bool walk_at_last(void);

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

/** Sets out on `ui_walk`: the first stop, nothing collected. */
void walk_begin(void);

/** Makes for stop `i` instead (Last stop, Next stop). */
void walk_to(int i);

/** Collects the label at the stop you're at. */
void walk_collect(void);
bool walk_collected(int i);
int walk_collected_count(void);

/** Metres still to go to the stop (simulated), and a step along the way; true once there. */
int walk_metres_left(void);
bool walk_step(int metres);

/** How much of the stop's narration has played, so it picks up where it was. */
uint32_t walk_heard_ms(void);
void walk_set_heard_ms(uint32_t ms);

/**
 * On your own (the free map): one landmark as if it were a walk of one stop,
 * so the narration screens can tell it. Ended when the map comes back.
 */
void walk_free(const landmark_t *l);
void walk_end_free(void);
bool walk_is_free(void);

/** Where the stop's narration plays: the speaker's own screen, a handover to them first, or the guide's. */
screen_id_t walk_narration_screen(void);
