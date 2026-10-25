#include "walk.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "audio/player.h"
#include "position.h"
#include "scene.h"

/* lib/arrival.ts: within this of a stop (or of where the walk passes it), on a fix this sure, you're at it. */
#define ARRIVAL_M 40
#define STOP_FIX_M 50
/* Further than this from the way between stops, you're off it: the way is given straight to the stop. */
#define OFF_ROUTE_M 50
/* On it, the way points this far ahead along it, so it bends with the streets. */
#define AHEAD_M 30
#define M_PER_DEG 111195.0 /* as position.c reckons the earth */

static int at;
static int start; /* the stop the walk was begun at: it goes on round to the stops before it */
static bool intro;
static bool arrived;       /* at the stop you're making for, on foot */
static uint32_t collected; /* bit i: stop i's label, earned on the spot */
static uint32_t stamped;   /* bit i: its stamp already pressed on the story */
static uint32_t heard_ms;

/* On your own: the landmark picked on the free map, as a walk of one stop with no host. */
static bool free_mode;
static stop_t free_stop;
static const walk_t free_walk = {"On your own", "", "", NULL, &free_stop, 1, NULL, 0};
static uint32_t free_heard_ms;

void walk_free(const landmark_t *l)
{
    free_stop = (stop_t){l->name, l->speaker, l->caption ? l->caption : "", l->lat_e6, l->lon_e6, -1, l->lm};
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
    return free_mode || (at + 1) % walk_now()->stop_count == start;
}

bool walk_at_first(void)
{
    return free_mode || at == start;
}

int walk_started_at(void)
{
    return free_mode ? 0 : start;
}

int walk_next(void)
{
    return (at + 1) % walk_now()->stop_count;
}

int walk_before(void)
{
    int n = walk_now()->stop_count;
    return (at - 1 + n) % n;
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
    intro = false;
    arrived = false;
    heard_ms = 0;
}

void walk_begin(int first)
{
    char part[8];
    walk_intro_part(part, sizeof part);
    collected = stamped = 0;
    walk_to(first);
    start = at;
    /* The walk opens with its introduction, if the card has it. */
    intro = player_part(part) != NULL;
}

bool walk_in_intro(void)
{
    return !free_mode && intro;
}

void walk_intro_part(char *buf, size_t len)
{
    snprintf(buf, len, "w%02di", ui_walk + 1);
}

bool walk_collected(int i)
{
    return collected & (1u << i);
}

int walk_collected_count(void)
{
    return __builtin_popcount(collected);
}

bool walk_stamp_due(void)
{
    if (free_mode || walk_in_intro() || !walk_collected(at) || (stamped & (1u << at))) return false;
    stamped |= 1u << at;
    return true;
}

bool walk_here(void)
{
    return !free_mode && arrived;
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

/* --- Where you are on the walk --------------------------------------------------------- */

/** (lat, lon) as metres east and north of (lat0, lon0): near enough flat for a walk. */
static void local(double lat0, double lon0, double lat, double lon, double *x, double *y)
{
    *x = (lon - lon0) * cos(lat0 * M_PI / 180.0) * M_PER_DEG;
    *y = (lat - lat0) * M_PER_DEG;
}

static double route_lat(const walk_t *w, int i)
{
    return w->route[i * 2] / 1e6;
}

static double route_lon(const walk_t *w, int i)
{
    return w->route[i * 2 + 1] / 1e6;
}

/** How far you are from a stop: from the building, or from where the walk passes it, whichever is nearer. */
static double to_stop(const walk_t *w, const stop_t *s, double lat, double lon)
{
    double d = position_metres(lat, lon, s->lat_e6 / 1e6, s->lon_e6 / 1e6);
    if (s->passing >= 0 && s->passing < w->route_len) {
        d = fmin(d, position_metres(lat, lon, route_lat(w, s->passing), route_lon(w, s->passing)));
    }
    return d;
}

typedef struct {
    int from, to;  /* the route's points between the stop before and this one */
    double off;    /* how far you are from the leg */
    double along;  /* how far along it you are, from its start */
    double length; /* its length */
} leg_t;

/** You, against the leg of the route that leads to the stop; false if the walk has no leg there. */
static bool on_leg(const walk_t *w, double lat, double lon, leg_t *leg)
{
    const stop_t *s = &w->stops[at];
    leg->from = at > 0 ? w->stops[at - 1].passing : 0;
    leg->to = s->passing;
    if (w->route_len < 2 || leg->from < 0 || leg->to <= leg->from || leg->to >= w->route_len) return false;
    leg->off = 1e9, leg->along = 0;
    double run = 0, ax, ay, bx, by;
    local(lat, lon, route_lat(w, leg->from), route_lon(w, leg->from), &ax, &ay);
    for (int i = leg->from; i < leg->to; i++) {
        local(lat, lon, route_lat(w, i + 1), route_lon(w, i + 1), &bx, &by);
        double dx = bx - ax, dy = by - ay, seg = hypot(dx, dy);
        double t = seg > 0 ? LV_CLAMP(0.0, -(ax * dx + ay * dy) / (seg * seg), 1.0) : 0;
        double d = hypot(ax + t * dx, ay + t * dy);
        if (d < leg->off) leg->off = d, leg->along = run + t * seg;
        run += seg;
        ax = bx, ay = by;
    }
    leg->length = run;
    return true;
}

/** The point `along` metres down the leg. */
static void leg_point(const walk_t *w, const leg_t *leg, double along, double *lat, double *lon)
{
    for (int i = leg->from; i < leg->to; i++) {
        double la = route_lat(w, i), lo = route_lon(w, i), lb = route_lat(w, i + 1), ob = route_lon(w, i + 1);
        double seg = position_metres(la, lo, lb, ob);
        if (along <= seg || i == leg->to - 1) {
            double t = seg > 0 ? LV_CLAMP(0.0, along / seg, 1.0) : 1;
            *lat = la + (lb - la) * t, *lon = lo + (ob - lo) * t;
            return;
        }
        along -= seg;
    }
    *lat = route_lat(w, leg->to), *lon = route_lon(w, leg->to);
}

walk_nav_t walk_nav(void)
{
    walk_nav_t n = {0};
    position_t p = position_now();
    if (free_mode || !p.known) return n;
    const walk_t *w = walk_now();
    const stop_t *s = &w->stops[at];
    n.located = true;
    n.moving = p.moving;
    n.sure = p.accuracy <= STOP_FIX_M;

    /* Labels: every stop you stand at, the one you're making for or not (as the app does). */
    if (n.sure) {
        for (int k = 0; k < w->stop_count; k++) {
            if (to_stop(w, &w->stops[k], p.lat, p.lon) <= ARRIVAL_M) collected |= 1u << k;
        }
    }
    double straight = to_stop(w, s, p.lat, p.lon);
    if (!arrived && n.sure && straight <= ARRIVAL_M) {
        arrived = true;
        n.arrived_now = true;
    }
    n.here = arrived; /* once there, there: a wandering fix doesn't take it back */

    /* The way: along the route while you're on it, bending with the streets; straight to the stop off it. */
    leg_t leg;
    double aim_lat = s->lat_e6 / 1e6, aim_lon = s->lon_e6 / 1e6;
    if (on_leg(w, p.lat, p.lon, &leg) && leg.off <= OFF_ROUTE_M) {
        n.on_route = true;
        n.metres = (int)lround(fmax(0, leg.length - leg.along));
        leg_point(w, &leg, fmin(leg.along + AHEAD_M, leg.length), &aim_lat, &aim_lon);
    } else {
        n.metres = (int)lround(straight);
    }
    n.aim_lat = aim_lat, n.aim_lon = aim_lon;
    n.way = (float)position_bearing(p.lat, p.lon, aim_lat, aim_lon);
    if (n.moving) {
        float t = fmodf(n.way - p.course + 540.0f, 360.0f) - 180.0f;
        n.turn = t;
    }
    return n;
}

const char *walk_turn_words(const walk_nav_t *n)
{
    float t = fabsf(n->turn);
    bool left = n->turn < 0;
    if (t < 25) return "Straight on";
    if (t < 70) return left ? "Bear left" : "Bear right";
    if (t < 140) return left ? "Turn left" : "Turn right";
    return "Turn around";
}

int walk_metres_from_start(const walk_t *w, double lat, double lon)
{
    return (int)lround(position_metres(lat, lon, w->stops[0].lat_e6 / 1e6, w->stops[0].lon_e6 / 1e6));
}

void walk_pretend_step(double metres)
{
    if (free_mode || arrived || !position_walks_itself()) return;
    walk_nav_t n = walk_nav();
    if (n.located) position_walk_toward(n.aim_lat, n.aim_lon, metres);
}
