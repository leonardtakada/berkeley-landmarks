/**
 * On your own: the paper map with you in the middle of it and every landmark
 * in the guide round about. Tap one and the slip at the top names it with how
 * far it is; the upper button goes there, drawing your way, and at its door
 * the guide tells it (the ringed ones have a story on the card) or gives its
 * architect and year. North up, following you as you walk; + and − to see
 * more or less of town. Without a fix it says so and shows downtown. The
 * lower button goes back.
 */
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include "audio/player.h"
#include "audio/sound.h"
#include "landmarks.h"
#include "mapview.h"
#include "motion.h"
#include "position.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

#define AT_THE_DOOR_M 25
#define WALK_MPS 1.4 /* how fast a pretend position walks */
#define METRES_PER_MIN 80
#define TICK_MS 1000
#define DOOR_MS 3000 /* the door holds this long before the story */
#define CENTRE (SCREEN_W / 2)
/* Berkeley City Hall: where the map opens without a fix. */
#define DOWNTOWN_LAT 37.869220
#define DOWNTOWN_LON -122.273306

/* Kept between visits: how close in, and the landmark picked (−1 none). */
static int zoom = MAPVIEW_ZOOM_MAX;
static int picked = -1;
static bool going, at_door;

typedef struct {
    lv_obj_t *scr;
    mapview_t *map;
    lv_obj_t *dots; /* the landmarks, laid out afresh when the map moves */
    lv_obj_t *you, *wedge, *leg, *go;
    lv_obj_t *kick, *name, *meta, *note, *scale, *scale_label;
    lv_timer_t *timer;
    double lat, lon; /* the map's centre */
    int laid_zoom;
    lv_point_precise_t leg_pts[2];
} explore_t;

static explore_t *ex; /* the one showing */

static const landmark_t *picked_landmark(void)
{
    return picked >= 0 ? &landmarks[picked] : NULL;
}

static double lat_of(const landmark_t *l)
{
    return l->lat_e6 / 1e6;
}

static double lon_of(const landmark_t *l)
{
    return l->lon_e6 / 1e6;
}

/* --- The slip at the top --------------------------------------------------------- */

static void show_slip(const position_t *p)
{
    const landmark_t *l = picked_landmark();
    if (!l) {
        lv_label_set_text(ex->kick, "ON YOUR OWN");
        lv_label_set_text(ex->name, "Tap a landmark");
        lv_label_set_text(ex->meta, "The ringed ones have a story");
        return;
    }
    lv_label_set_text(ex->kick, at_door ? "AT THE DOOR" : going ? "ON THE WAY" : l->caption ? "A STORY HERE" : "A LANDMARK");
    lv_label_set_text(ex->name, l->name);
    if (p->known && !at_door) {
        double m = position_metres(p->lat, p->lon, lat_of(l), lon_of(l));
        int min = LV_MAX(1, (int)((m + METRES_PER_MIN / 2) / METRES_PER_MIN));
        if (m < 1000) lv_label_set_text_fmt(ex->meta, "%d m \xC2\xB7 %d min", (int)(m + 0.5), min);
        else lv_label_set_text_fmt(ex->meta, "%.1f km \xC2\xB7 %d min", m / 1000, min);
    } else if (l->year && l->architect[0]) {
        lv_label_set_text_fmt(ex->meta, "%s \xC2\xB7 %d", l->architect, l->year);
    } else if (l->architect[0]) {
        lv_label_set_text(ex->meta, l->architect);
    } else if (l->year) {
        lv_label_set_text_fmt(ex->meta, "Built %d", l->year);
    } else {
        lv_label_set_text(ex->meta, "");
    }
}

/* --- The landmarks on the map ------------------------------------------------------- */

static void refresh(bool relay);

static void dot_tapped(lv_event_t *e)
{
    int i = (int)(intptr_t)lv_event_get_user_data(e);
    if (i == picked) return;
    picked = i;
    going = at_door = false;
    refresh(true);
}

static void lay_dots(void)
{
    lv_obj_clean(ex->dots);
    for (int i = 0; i < landmark_count; i++) {
        const landmark_t *l = &landmarks[i];
        float x, y;
        mapview_project(ex->map, lat_of(l), lon_of(l), &x, &y);
        float dx = x - CENTRE, dy = y - CENTRE;
        if (dx * dx + dy * dy > 236.0f * 236.0f) continue;
        bool story = l->caption != NULL, chosen = i == picked;
        /* A story: a dot ringed in its own blue with paper between. The one picked: vermilion. */
        int d = chosen ? 22 : story ? 12 : 11;
        lv_obj_t *dot = disc(ex->dots, (int32_t)x - d / 2, (int32_t)y - d / 2, d, chosen ? C_VERMILION : C_BLUE);
        if (story || chosen) {
            lv_obj_set_style_outline_width(dot, chosen ? 3 : 2, 0);
            lv_obj_set_style_outline_pad(dot, chosen ? 3 : 2, 0);
            lv_obj_set_style_outline_color(dot, chosen ? C_VERMILION : C_BLUE, 0);
            lv_obj_set_style_outline_opa(dot, LV_OPA_COVER, 0);
        } else {
            lv_obj_set_style_bg_opa(dot, 170, 0);
        }
        lv_obj_add_flag(dot, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_ext_click_area(dot, chosen ? 6 : 10);
        lv_obj_add_event_cb(dot, dot_tapped, LV_EVENT_CLICKED, (void *)(intptr_t)i);
    }
}

/* --- You ------------------------------------------------------------------------------ */

/* The way you're heading: a wedge from the mark, turned to your course. */
static void wedge_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    int32_t deg = (int32_t)(intptr_t)lv_obj_get_user_data(o);
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    float cx = (a.x1 + a.x2 + 1) / 2.0f, cy = (a.y1 + a.y2 + 1) / 2.0f;
    float r = (float)deg * 3.14159265f / 180.0f, c = cosf(r), s = sinf(r);
    static const float pts[3][2] = {{-15, -40}, {15, -40}, {0, -8}};
    lv_draw_triangle_dsc_t t;
    lv_draw_triangle_dsc_init(&t);
    t.color = C_VERMILION;
    t.opa = LV_OPA_60;
    for (int i = 0; i < 3; i++) {
        t.p[i].x = cx + pts[i][0] * c - pts[i][1] * s;
        t.p[i].y = cy + pts[i][0] * s + pts[i][1] * c;
    }
    lv_draw_triangle(lv_event_get_layer(e), &t);
}

static lv_obj_t *you_mark(lv_obj_t *scr)
{
    lv_obj_t *you = box(scr, CENTRE - 55, CENTRE - 55, 110, 110);
    lv_obj_t *pulse = disc(you, 40, 40, 30, C_VERMILION);
    motion_loop(pulse, KF({0, 30}, {300, 72}, {600, 96}, {1000, 108}), 2200, 0, m_size);
    motion_loop(pulse, KF({0, 128}, {300, 64}, {600, 24}, {1000, 0}), 2200, 0, m_bg_opa);
    ex->wedge = box(you, 0, 0, 110, 110);
    lv_obj_add_event_cb(ex->wedge, wedge_draw, LV_EVENT_DRAW_MAIN, NULL);
    lv_obj_t *ring = disc(you, 43, 43, 24, C_PAPER);
    lv_obj_set_style_border_width(ring, 4, 0);
    lv_obj_set_style_border_color(ring, C_VERMILION, 0);
    disc(you, 50, 50, 10, C_VERMILION);
    return you;
}

/* --- The scale ---------------------------------------------------------------------------- */

static void show_scale(void)
{
    static const int steps[] = {50, 100, 200, 500, 1000, 2000};
    float mpp = mapview_metres_per_px(ex->map);
    int metres = steps[0];
    for (unsigned i = 0; i < sizeof steps / sizeof steps[0]; i++) {
        if (steps[i] / mpp <= 110) metres = steps[i];
    }
    int px = (int)(metres / mpp);
    lv_obj_set_width(ex->scale, px);
    lv_obj_set_x(ex->scale, CENTRE - px / 2);
    if (metres < 1000) lv_label_set_text_fmt(ex->scale_label, "%d m", metres);
    else lv_label_set_text_fmt(ex->scale_label, "%d km", metres / 1000);
}

/* --- Going, and getting there ---------------------------------------------------------------- */

static void tell(void)
{
    const landmark_t *l = picked_landmark();
    if (!l) return;
    walk_free(l);
    picked = -1; /* told: back on the map, the next one is yours to pick */
    ui_show(walk_narration_screen());
}

static void arrive(void)
{
    const landmark_t *l = picked_landmark();
    going = false;
    at_door = true;
    if (ui_volume() > 0) sound_chime_async(player_codec_volume(ui_volume()));
    char part[8];
    snprintf(part, sizeof part, "lm%d", l->lm);
    if (l->caption && player_part(part)) ui_after(ex->scr, DOOR_MS, tell);
}

void explore_go(void)
{
    if (!ex || !picked_landmark()) return;
    going = !going;
    at_door = false;
    refresh(true);
}

static void show_go(void)
{
    if (!ex->go) return;
    if (!picked_landmark() || at_door) {
        lv_obj_add_flag(ex->go, LV_OBJ_FLAG_HIDDEN);
        return;
    }
    lv_obj_remove_flag(ex->go, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_text(lv_obj_get_child(ex->go, 0), going ? "STOP" : "GO");
}

/** Brings everything up to date with where you are: the map, the dots, your way, the slip. */
static void refresh(bool relay)
{
    position_t p = position_now();
    double lat = p.known ? p.lat : DOWNTOWN_LAT, lon = p.known ? p.lon : DOWNTOWN_LON;
    float x, y;
    mapview_project(ex->map, lat, lon, &x, &y);
    if (relay || ex->laid_zoom != zoom || fabsf(x - CENTRE) >= 1 || fabsf(y - CENTRE) >= 1) {
        mapview_set(ex->map, lat, lon, zoom);
        ex->lat = lat, ex->lon = lon;
        ex->laid_zoom = zoom;
        lay_dots();
        show_scale();
    }

    if (p.known) lv_obj_remove_flag(ex->you, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(ex->you, LV_OBJ_FLAG_HIDDEN);
    int32_t course = p.moving ? (int32_t)lroundf(p.course) : -1;
    if ((int32_t)(intptr_t)lv_obj_get_user_data(ex->wedge) != course) {
        lv_obj_set_user_data(ex->wedge, (void *)(intptr_t)course);
        if (course < 0) lv_obj_add_flag(ex->wedge, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_remove_flag(ex->wedge, LV_OBJ_FLAG_HIDDEN);
        lv_obj_invalidate(ex->wedge);
    }

    const landmark_t *l = picked_landmark();
    if (going && l && p.known) {
        float tx, ty;
        mapview_project(ex->map, lat_of(l), lon_of(l), &tx, &ty);
        ex->leg_pts[0] = (lv_point_precise_t){CENTRE, CENTRE};
        ex->leg_pts[1] = (lv_point_precise_t){tx, ty};
        lv_line_set_points_mutable(ex->leg, ex->leg_pts, 2);
        lv_obj_remove_flag(ex->leg, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(ex->leg, LV_OBJ_FLAG_HIDDEN);
    }

    if (p.known) lv_obj_add_flag(ex->note, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_remove_flag(ex->note, LV_OBJ_FLAG_HIDDEN);
    show_slip(&p);
    show_go();

    if (going && l && p.known && position_metres(p.lat, p.lon, lat_of(l), lon_of(l)) <= AT_THE_DOOR_M) {
        arrive();
        show_slip(&p);
        show_go();
    }
}

static void tick(lv_timer_t *t)
{
    (void)t;
    const landmark_t *l = picked_landmark();
    /* At the desk, a pretend position walks there; outdoors, your feet do. */
    if (going && l) position_walk_toward(lat_of(l), lon_of(l), WALK_MPS * TICK_MS / 1000.0);
    refresh(false);
}

static void zoom_by(lv_event_t *e)
{
    int z = LV_CLAMP(MAPVIEW_ZOOM_MIN, zoom + (int)(intptr_t)lv_event_get_user_data(e), MAPVIEW_ZOOM_MAX);
    if (z == zoom) return;
    zoom = z;
    refresh(true);
}

static lv_obj_t *zoom_button(lv_obj_t *scr, int32_t y, int dir)
{
    lv_obj_t *b = disc(scr, 22, y, 52, C_SLIP);
    lv_obj_set_style_border_width(b, 2, 0);
    lv_obj_set_style_border_color(b, C_BLUE, 0);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(b, 6);
    lv_obj_t *bar = box(b, 0, 0, 18, 3);
    lv_obj_set_style_bg_color(bar, C_BLUE, 0);
    lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
    lv_obj_center(bar);
    if (dir > 0) {
        lv_obj_t *up = box(b, 0, 0, 3, 18);
        lv_obj_set_style_bg_color(up, C_BLUE, 0);
        lv_obj_set_style_bg_opa(up, LV_OPA_COVER, 0);
        lv_obj_center(up);
    }
    lv_obj_add_event_cb(b, zoom_by, LV_EVENT_CLICKED, (void *)(intptr_t)dir);
    return b;
}

static void gone(lv_event_t *e)
{
    explore_t *x = lv_event_get_user_data(e);
    lv_timer_delete(x->timer);
    if (ex == x) ex = NULL;
    lv_free(x);
}

lv_obj_t *screen_explore(void)
{
    walk_end_free(); /* back from a landmark's story, if that's where we were */
    at_door = false;
    explore_t *x = lv_malloc(sizeof(explore_t));
    lv_memzero(x, sizeof(*x));
    ex = x;
    lv_obj_t *scr = ui_screen(C_PAPER);
    x->scr = scr;
    x->map = mapview_create(scr);
    x->laid_zoom = -1;

    x->leg = lv_line_create(scr);
    lv_obj_set_style_line_width(x->leg, 4, 0);
    lv_obj_set_style_line_color(x->leg, C_VERMILION, 0);
    lv_obj_set_style_line_rounded(x->leg, true, 0);
    lv_obj_set_style_line_dash_width(x->leg, 10, 0);
    lv_obj_set_style_line_dash_gap(x->leg, 7, 0);
    lv_obj_add_flag(x->leg, LV_OBJ_FLAG_HIDDEN);

    x->dots = box(scr, 0, 0, SCREEN_W, SCREEN_H);
    x->you = you_mark(scr);

    /* The slip at the top: what's picked, and how far. */
    lv_obj_t *s = slip(scr, 103, 36, 260, LV_SIZE_CONTENT);
    lv_obj_set_style_pad_ver(s, 7, 0);
    lv_obj_set_style_pad_row(s, 1, 0);
    lv_obj_set_flex_flow(s, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    x->kick = text_in(s, &jost_medium_14, C_BLUE, "");
    lv_obj_set_style_text_letter_space(x->kick, 3, 0);
    x->name = text_in(s, &jost_regular_18, C_CHARCOAL, "");
    lv_obj_set_width(x->name, 236);
    lv_obj_set_style_text_align(x->name, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(x->name, LV_LABEL_LONG_MODE_DOTS);
    x->meta = text_in(s, &jost_regular_15, C_SEPIA, "");
    lv_obj_set_width(x->meta, 236);
    lv_obj_set_style_text_align(x->meta, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(x->meta, LV_LABEL_LONG_MODE_DOTS);

    zoom_button(scr, 178, 1);
    zoom_button(scr, 244, -1);

    /* The scale, and a note while there's no fix. */
    x->scale = box(scr, CENTRE, 404, 100, 3);
    lv_obj_set_style_bg_color(x->scale, C_BLUE, 0);
    lv_obj_set_style_bg_opa(x->scale, LV_OPA_COVER, 0);
    x->scale_label = line_centered(scr, &jost_medium_14, C_BLUE, 380, "");
    /* Paper behind the figure, so the street names under it don't run into it. */
    lv_obj_set_style_bg_color(x->scale_label, C_PAPER, 0);
    lv_obj_set_style_bg_opa(x->scale_label, LV_OPA_80, 0);
    lv_obj_set_style_pad_hor(x->scale_label, 6, 0);
    lv_obj_set_style_radius(x->scale_label, 4, 0);
    x->note = slip(scr, 133, 296, 200, LV_SIZE_CONTENT);
    lv_obj_set_style_pad_ver(x->note, 6, 0);
    lv_obj_t *n = text_in(x->note, &jost_regular_15, C_CHARCOAL, "Finding you. This is downtown.");
    lv_obj_set_width(n, 184);
    lv_label_set_long_mode(n, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_align(n, LV_TEXT_ALIGN_CENTER, 0);

    x->go = ui_hints(scr, 0xFAF6EC, "GO", "BACK");

    refresh(true);
    x->timer = lv_timer_create(tick, TICK_MS, NULL);
    lv_obj_add_event_cb(scr, gone, LV_EVENT_DELETE, x);
    return scr;
}
