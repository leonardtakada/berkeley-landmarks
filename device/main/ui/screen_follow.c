/**
 * The walk: where you're going and how to get there, as large as the circle
 * allows. The next stop's name, the distance (along the route while you're on
 * it), and the way in words, with a pointer inside the rim turned to it, all
 * from where the GNSS puts you; the host rides along small at the top. The
 * way can only be given as a turn while you're walking (the guide has no
 * compass), so standing, it asks you to set off. At the stop (lib/arrival.ts:
 * within 40 m, on a fix good to 50 m) the guide chimes, collects the label
 * and says you're here; nothing moves on by itself.
 *
 * Listen (the upper button, or its tab) plays the stop's story, there or not;
 * Map shows the walk's map; the lower button is the menu. Everything is
 * centred, kept out of the two bands at the tabs' heights: which stop above,
 * then the stop, the distance and the way between the tabs, and Map below.
 */
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include "audio/player.h"
#include "audio/sound.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

/* About 80 m a minute on foot, as the app reckons it. */
#define METRES_PER_MIN 80
#define CENTRE_X (SCREEN_W / 2)
#define TICK_MS 1000
#define WALK_MPS 1.4 /* how fast a pretend position walks itself ("here walk") */
#define CAMEO_PX 64

typedef struct {
    lv_obj_t *kick, *metres, *words, *pointer, *listen; /* listen: the upper button's tab */
    palette_t pal;
    bool here;
    lv_timer_t *timer;
} follow_t;

/* Between the tabs' bands: the stop's name, the distance and the way. */
#define MID_Y (UPPER_CY + TAB_H / 2 + 4)
#define MID_H (LOWER_CY - TAB_H / 2 - MID_Y - 2)

/** At the stop, the Listen tab goes vermilion (not on a vermilion ground, where it would vanish). */
static void mark_listen(follow_t *f)
{
    if (lv_color_eq(f->pal.accent, C_VERMILION)) {
        lv_obj_set_style_bg_color(f->listen, C_VERMILION, 0);
        lv_obj_set_style_text_color(lv_obj_get_child(f->listen, 0), C_CREAM, 0);
    }
}

static void show(follow_t *f)
{
    const walk_t *w = walk_now();
    walk_nav_t n = walk_nav();
    char buf[64];

    if (n.here) {
        lv_label_set_text(f->kick, "YOU'RE HERE");
        lv_obj_set_style_text_font(f->metres, &jost_light_32, 0);
        lv_label_set_text(f->metres, "At the door");
        if (walk_collected(walk_at())) snprintf(buf, sizeof buf, "Label collected \xC2\xB7 %d of %d", walk_collected_count(), w->stop_count);
        else snprintf(buf, sizeof buf, "Listen when you're ready");
        lv_label_set_text(f->words, buf);
    } else if (!n.located) {
        lv_label_set_text_fmt(f->kick, "STOP %d OF %d", walk_at() + 1, w->stop_count);
        lv_obj_set_style_text_font(f->metres, &jost_light_32, 0);
        lv_label_set_text(f->metres, "Finding you");
        lv_label_set_text(f->words, "Hold it face up, under open sky");
    } else {
        lv_label_set_text_fmt(f->kick, "STOP %d OF %d", walk_at() + 1, w->stop_count);
        lv_obj_set_style_text_font(f->metres, &jost_light_58, 0);
        if (n.metres < 1000) lv_label_set_text_fmt(f->metres, "%d m", n.metres);
        else lv_label_set_text_fmt(f->metres, "%d.%d km", n.metres / 1000, n.metres % 1000 / 100);
        int min = LV_MAX(1, (n.metres + METRES_PER_MIN / 2) / METRES_PER_MIN);
        if (n.moving) snprintf(buf, sizeof buf, "%s \xC2\xB7 %d min", walk_turn_words(&n), min);
        else snprintf(buf, sizeof buf, "%d min \xC2\xB7 walk on to see the way", min);
        lv_label_set_text(f->words, buf);
    }

    /* The pointer, only while there's a way to point: walking, and not yet there. */
    if (n.located && n.moving && !n.here) {
        rim_pointer_set(f->pointer, (int32_t)lroundf(n.turn * 10));
        lv_obj_remove_flag(f->pointer, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(f->pointer, LV_OBJ_FLAG_HIDDEN);
    }

    /* Arriving: the chime, and Listen goes vermilion. */
    if (n.here && !f->here) {
        if (ui_volume() > 0) sound_chime_async(player_codec_volume(ui_volume()));
        mark_listen(f);
    }
    f->here = n.here;
}

static void tick(lv_timer_t *t)
{
    follow_t *f = lv_timer_get_user_data(t);
    /* At the desk, a pretend position can walk the route itself ("here walk"). */
    walk_pretend_step(WALK_MPS * TICK_MS / 1000.0);
    show(f);
}

static void open_map(lv_event_t *e)
{
    LV_UNUSED(e);
    ui_open_map();
}

static void gone(lv_event_t *e)
{
    follow_t *f = lv_event_get_user_data(e);
    lv_timer_delete(f->timer);
    lv_free(f);
}

lv_obj_t *screen_follow(void)
{
    const walk_t *walk = walk_now();
    int at = walk_at(), n = walk->stop_count;
    follow_t *f = lv_malloc(sizeof(follow_t));
    lv_memzero(f, sizeof(*f));
    f->pal = palette_for(walk_ground(walk_host()));
    palette_t pal = f->pal;
    lv_obj_t *scr = ui_screen(pal.ground);

    /* The rim: a segment a stop, collected, now, to come. */
    for (int i = 0; i < n; i++) {
        bool got = walk_collected(i);
        lv_obj_t *seg = rim_segment(scr, i, n, i == at ? pal.accent : got ? pal.mark : pal.ahead);
        if (i != at && !got) lv_obj_set_style_arc_opa(seg, pal.ahead_opa, 0);
    }

    /* Which stop, above the tabs (the pointer rides above it when the way is straight on). */
    lv_color_t ink = pal.dark ? C_CREAM : C_CHARCOAL, soft = pal.dark ? C_BLUE_TINT : C_SEPIA;
    f->kick = line_centered(scr, &jost_medium_16, pal.kick, 82, "");
    lv_obj_set_style_text_letter_space(f->kick, 3, 0);

    /* Where to, how far, which way: between the tabs, where the circle is widest. */
    lv_obj_t *col = box(scr, 43, MID_Y, 380, MID_H);
    lv_obj_set_flex_flow(col, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(col, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(col, 2, 0);
    lv_obj_t *name = text_in(col, &jost_light_28, ink, walk_stop()->name);
    lv_obj_set_width(name, 350);
    lv_obj_set_style_text_align(name, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_max_height(name, 2 * jost_light_28.line_height, 0);
    lv_label_set_long_mode(name, LV_LABEL_LONG_MODE_DOTS);
    /* The distance, with the host riding along small beside it. */
    lv_obj_t *row = box(col, 0, 0, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 14, 0);
    const lv_image_dsc_t *face = walk->host ? cameo_of(walk->host) : NULL;
    if (face) {
        lv_obj_t *cameo = box(row, 0, 0, CAMEO_PX, CAMEO_PX);
        lv_obj_set_style_radius(cameo, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_clip_corner(cameo, true, 0);
        lv_obj_set_style_outline_width(cameo, 3, 0);
        lv_obj_set_style_outline_color(cameo, C_CREAM, 0);
        lv_obj_set_style_outline_opa(cameo, LV_OPA_COVER, 0);
        lv_obj_t *img = lv_image_create(cameo);
        lv_image_set_src(img, face);
        lv_image_set_scale(img, CAMEO_PX * 256 / ART_CAMEO_PX);
        lv_obj_center(img);
    }
    f->metres = text_in(row, &jost_light_58, ink, "");
    lv_obj_set_style_text_letter_space(f->metres, -1, 0);
    f->words = text_in(col, &jost_regular_20, soft, "");

    f->pointer = rim_pointer(scr, pal.accent, pal.shadow);
    lv_obj_add_flag(f->pointer, LV_OBJ_FLAG_HIDDEN);

    /* The map, below the tabs: the one thing here the side buttons don't do. */
    lv_obj_t *map = pill(scr, CENTRE_X - 70, LOWER_CY + TAB_H / 2 + 8, 140, 48, false, C_BLUE, C_BLUE, "Map", open_map);
    lv_obj_move_to_index(map_mark(map, C_BLUE), 0);

    f->listen = ui_hints(scr, walk_ground(walk_host()), "LISTEN", "MENU");
    /* Back here from the menu or the map, already at the stop: no second chime. */
    f->here = walk_here();
    if (f->here) mark_listen(f);
    show(f);
    f->timer = lv_timer_create(tick, TICK_MS, f);
    lv_obj_add_event_cb(scr, gone, LV_EVENT_DELETE, f);
    return scr;
}
