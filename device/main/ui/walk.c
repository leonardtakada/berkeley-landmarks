#include "walk.h"
#include <string.h>
#include "scene.h"

/* Where the guide starts counting from at the first stop, which has no stop before it. */
#define FIRST_STOP_METRES 60

static int at;
static uint32_t collected; /* bit i: stop i's label */
static int metres_left = FIRST_STOP_METRES;
static uint32_t heard_ms;

/* On your own: the landmark picked on the free map, as a walk of one stop with no host. */
static bool free_mode;
static stop_t free_stop;
static const walk_t free_walk = {"On your own", "", "", NULL, &free_stop, 1};
static uint32_t free_heard_ms;

void walk_free(const landmark_t *l)
{
    free_stop = (stop_t){l->name, l->speaker, l->caption ? l->caption : "", 0, 0, l->lm};
    free_mode = true;
    free_heard_ms = 0;
}

void walk_end_free(void)
{
    free_mode = false;
}

bool walk_is_free(void)
{
    return free_mode;
}

const walk_t *walk_now(void)
{
    return free_mode ? &free_walk : &walks[ui_walk];
}

int walk_at(void)
{
    return free_mode ? 0 : at;
}

const stop_t *walk_stop(void)
{
    return &walk_now()->stops[walk_at()];
}

bool walk_at_last(void)
{
    return walk_at() == walk_now()->stop_count - 1;
}

const art_portrait_t *walk_host(void)
{
    return portrait_of(walk_now()->host);
}

uint32_t walk_ground(const art_portrait_t *art)
{
    return art ? art->ground : 0xFAF6EC;
}

lv_obj_t *walk_companion(lv_obj_t *scr, const art_portrait_t *art, mood_t mood)
{
    if (art) return portrait_create(scr, art, mood);
    if (!free_mode) scene_create(scr, &art_scenes[ui_walk]); /* on your own there's no walk's scene: just paper */
    return NULL;
}

const art_portrait_t *walk_speaker(void)
{
    return portrait_of(walk_stop()->speaker);
}

bool walk_host_speaks(void)
{
    const char *host = walk_now()->host, *speaker = walk_stop()->speaker;
    return host && speaker && strcmp(host, speaker) == 0;
}

void walk_to(int i)
{
    at = LV_CLAMP(0, i, walk_now()->stop_count - 1);
    metres_left = walk_stop()->metres ? walk_stop()->metres : FIRST_STOP_METRES;
    heard_ms = 0;
}

void walk_begin(void)
{
    collected = 0;
    walk_to(0);
}

void walk_collect(void)
{
    collected |= 1u << at;
}

bool walk_collected(int i)
{
    return collected & (1u << i);
}

int walk_collected_count(void)
{
    return __builtin_popcount(collected);
}

int walk_metres_left(void)
{
    return metres_left;
}

bool walk_step(int metres)
{
    metres_left = LV_MAX(0, metres_left - metres);
    return metres_left == 0;
}

uint32_t walk_heard_ms(void)
{
    return free_mode ? free_heard_ms : heard_ms;
}

void walk_set_heard_ms(uint32_t ms)
{
    if (free_mode) free_heard_ms = ms;
    else heard_ms = ms;
}

screen_id_t walk_narration_screen(void)
{
    if (!walk_speaker()) return SCR_GUIDESTOP;
    if (free_mode) return SCR_LISTENING; /* no host to hand over from */
    return walk_host_speaks() ? SCR_LISTENING : SCR_HANDOVER;
}
