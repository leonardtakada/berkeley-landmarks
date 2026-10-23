#include "walk.h"
#include <string.h>
#include "scene.h"

/* Where the guide starts counting from at the first stop, which has no stop before it. */
#define FIRST_STOP_METRES 60

static int at;
static uint32_t collected; /* bit i: stop i's label */
static int metres_left = FIRST_STOP_METRES;
static uint32_t heard_ms;

const walk_t *walk_now(void)
{
    return &walks[ui_walk];
}

int walk_at(void)
{
    return at;
}

const stop_t *walk_stop(void)
{
    return &walk_now()->stops[at];
}

bool walk_at_last(void)
{
    return at == walk_now()->stop_count - 1;
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
    scene_create(scr, &art_scenes[ui_walk]);
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
    return heard_ms;
}

void walk_set_heard_ms(uint32_t ms)
{
    heard_ms = ms;
}

screen_id_t walk_narration_screen(void)
{
    if (!walk_speaker()) return SCR_GUIDESTOP;
    return walk_host_speaks() ? SCR_LISTENING : SCR_HANDOVER;
}
