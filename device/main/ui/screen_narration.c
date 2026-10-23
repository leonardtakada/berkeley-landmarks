/**
 * A stop being narrated. Its architect fills the screen, talking, when
 * they're drawn; otherwise the host listens while the guide (or an architect
 * not yet drawn) reads it. The caption sits on a slip and lights word by
 * word, for noisy streets; progress runs round the rim; play/pause on the
 * left. When it's told, the walk goes on to the next stop by itself; the
 * upper button goes on sooner.
 *
 * Until audio arrives (Phase 5) the narration is simulated: a running clock,
 * the opening lines looping as the caption, the ring filling. It picks up
 * where it was if the controls come down over it.
 */
#include "ui.h"
#include <stdio.h>
#include <string.h>
#include "motion.h"
#include "portrait.h"
#include "theme.h"
#include "walk.h"
#include "widgets.h"

typedef struct {
    const art_portrait_t *host; /* who's on screen (NULL: the walk's scene) */
    mood_t speaking, waiting;   /* their mood while it plays, and paused */
    char kicker[24];
    const char *title; /* or NULL */
    const char *caption;
    char credit[48];
    int32_t total_s; /* how long the stop runs */
} narration_t;

/* The slip, clear of the lower button's tab, its foot near the rim. */
#define CARD_X 58
#define CARD_W 272
#define CARD_BOTTOM 424

/* Until audio (Phase 5), a stop runs about as long as a short narration would. */
static int32_t simulated_s(const char *caption)
{
    return 40 + (int32_t)strlen(caption) / 4;
}

/* The caption goes round in this many ms: each word lights in turn, all stay
 * lit until LIT_UNTIL of the way, then the line clears for the next. */
#define CAPTION_MS 8000
#define LIT_UNTIL 860 /* per mille */
#define TICK_MS 100
#define MAX_WORDS 32

typedef struct {
    narration_t n_; /* the stop's, built for this screen */
    const narration_t *n;
    lv_obj_t *scr, *host, *caption, *clock, *ring, *pause, *play;
    uint32_t ms; /* played so far */
    bool playing, finished;
    int lit;
    int words;
    uint32_t lights_at[MAX_WORDS]; /* when each word lights, in the caption's cycle */
    lv_timer_t *timer;
} narration_state_t;

/** Each word lights after the last, longer words taking a little longer to say. */
static void time_words(narration_state_t *st)
{
    const char *s = st->n->caption;
    uint32_t t = 0;
    st->words = 0;
    while (*s && st->words < MAX_WORDS) {
        size_t len = strcspn(s, " ");
        st->lights_at[st->words++] = t;
        t += 180 + 35 * (uint32_t)len;
        s += len;
        while (*s == ' ') s++;
    }
}

/** The caption with its first `lit` words inked, the rest faint (LVGL recolour). */
static void show_caption(narration_state_t *st)
{
    char buf[400];
    const char *s = st->n->caption;
    size_t pos = 0;
    if (st->lit > 0) pos += snprintf(buf, sizeof buf, "#2E2A27 ");
    for (int i = 0; i < st->words && pos < sizeof buf - 2; i++) {
        size_t len = strcspn(s, " ");
        pos += snprintf(buf + pos, sizeof buf - pos, "%s%.*s%s", i ? " " : "", (int)len, s, i == st->lit - 1 ? "#" : "");
        s += len;
        while (*s == ' ') s++;
    }
    lv_label_set_text(st->caption, buf);
}

static void show_clock(narration_state_t *st)
{
    int32_t at = LV_MIN((int32_t)st->ms / 1000, st->n->total_s);
    lv_label_set_text_fmt(st->clock, "%d:%02d / %d:%02d", (int)(at / 60), (int)(at % 60), (int)(st->n->total_s / 60),
                          (int)(st->n->total_s % 60));
}

static void tick(lv_timer_t *t)
{
    narration_state_t *st = lv_timer_get_user_data(t);
    if (!st->playing) return;
    st->ms += TICK_MS;

    uint32_t in_cycle = st->ms % CAPTION_MS;
    int lit = 0;
    if (in_cycle < CAPTION_MS * LIT_UNTIL / 1000) {
        while (lit < st->words && st->lights_at[lit] <= in_cycle) lit++;
    }
    if (lit != st->lit) {
        st->lit = lit;
        show_caption(st);
    }

    int32_t total = st->n->total_s * 1000;
    int32_t at = LV_MIN((int32_t)st->ms, total);
    rim_progress_set(st->ring, (int32_t)((int64_t)at * 3600 / total));
    if (st->ms % 1000 == 0) show_clock(st);

    /* Told: a moment's pause, then on to the next stop. */
    if (at == total && !st->finished) {
        st->finished = true;
        st->playing = false;
        if (st->host) portrait_set_mood(st->host, st->n->waiting);
        ui_after(st->scr, 1500, ui_next_stop);
    }
}

static void toggle(lv_event_t *e)
{
    narration_state_t *st = lv_event_get_user_data(e);
    if (st->finished) return;
    st->playing = !st->playing;
    if (st->host) portrait_set_mood(st->host, st->playing ? st->n->speaking : st->n->waiting);
    if (st->playing) {
        lv_obj_remove_flag(st->pause, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(st->play, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(st->pause, LV_OBJ_FLAG_HIDDEN);
        lv_obj_remove_flag(st->play, LV_OBJ_FLAG_HIDDEN);
    }
}

/** Back fifteen seconds, to catch a sentence missed in traffic. */
static void back15(lv_event_t *e)
{
    narration_state_t *st = lv_event_get_user_data(e);
    if (st->finished) return;
    st->ms = st->ms > 15000 ? st->ms - 15000 : 0;
    st->ms -= st->ms % TICK_MS;
    st->lit = -1;
    rim_progress_set(st->ring, (int32_t)((int64_t)st->ms * 3600 / ((int64_t)st->n->total_s * 1000)));
    show_clock(st);
}

static void done(lv_event_t *e)
{
    narration_state_t *st = lv_event_get_user_data(e);
    lv_timer_delete(st->timer);
    walk_set_heard_ms(st->finished ? 0 : st->ms);
    lv_free(st);
}

static void play_draw(lv_event_t *e)
{
    lv_obj_t *o = lv_event_get_current_target_obj(e);
    lv_area_t a;
    lv_obj_get_coords(o, &a);
    lv_draw_triangle_dsc_t d;
    lv_draw_triangle_dsc_init(&d);
    /* Its ink is kept in its own (unpainted) fill colour. */
    d.color = lv_obj_get_style_bg_color(o, 0);
    d.p[0].x = a.x1, d.p[0].y = a.y1;
    d.p[1].x = a.x2, d.p[1].y = (a.y1 + a.y2) / 2.0f;
    d.p[2].x = a.x1, d.p[2].y = a.y2;
    lv_draw_triangle(lv_event_get_layer(e), &d);
}

/** The play/pause button: a blue disc with two bars, or a triangle; cream on the dark grounds. */
static lv_obj_t *play_button(lv_obj_t *scr, narration_state_t *st, bool dark)
{
    lv_color_t ink = dark ? C_BLUE : C_CREAM;
    lv_obj_t *b = disc(scr, 28, 168, 64, dark ? C_CREAM : C_BLUE);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_shadow_width(b, 10, 0);
    lv_obj_set_style_shadow_offset_y(b, 4, 0);
    lv_obj_set_style_shadow_color(b, lv_color_hex(0x1E1810), 0);
    lv_obj_set_style_shadow_opa(b, 46, 0);
    lv_obj_add_event_cb(b, toggle, LV_EVENT_CLICKED, st);

    st->pause = box(b, 0, 0, 16, 20);
    lv_obj_center(st->pause);
    for (int i = 0; i < 2; i++) {
        lv_obj_t *bar = box(st->pause, i * 10, 0, 6, 20);
        lv_obj_set_style_bg_color(bar, ink, 0);
        lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, 0);
    }
    st->play = box(b, 0, 0, 17, 20);
    lv_obj_align(st->play, LV_ALIGN_CENTER, 2, 0);
    lv_obj_set_style_bg_color(st->play, ink, 0);
    lv_obj_add_event_cb(st->play, play_draw, LV_EVENT_DRAW_MAIN, NULL);
    lv_obj_add_flag(st->play, LV_OBJ_FLAG_HIDDEN);
    return b;
}

/** Beside the play button, above it: "15" with a back chevron, same ink. */
static lv_obj_t *back_button(lv_obj_t *scr, narration_state_t *st, bool dark)
{
    lv_obj_t *b = disc(scr, 44, 104, 56, dark ? C_CREAM : C_BLUE);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(b, 4);
    lv_obj_t *c = chevron(b, false, dark ? C_BLUE : C_CREAM);
    lv_obj_align(c, LV_ALIGN_CENTER, -13, 0);
    lv_obj_t *l = text_in(b, &jost_medium_18, dark ? C_BLUE : C_CREAM, "15");
    lv_obj_align(l, LV_ALIGN_CENTER, 8, 0);
    lv_obj_add_event_cb(b, back15, LV_EVENT_CLICKED, st);
    return b;
}

static lv_obj_t *narration_screen(narration_state_t *st)
{
    const narration_t *n = st->n;
    uint32_t ground = walk_ground(n->host);
    palette_t pal = palette_for(ground);
    lv_obj_t *scr = ui_screen(pal.ground);

    st->scr = scr;
    st->playing = true;
    st->ms = LV_MIN(walk_heard_ms(), (uint32_t)n->total_s * 1000 - 1000);
    st->ms -= st->ms % TICK_MS;
    time_words(st);

    st->host = walk_companion(scr, n->host, n->speaking);

    lv_obj_t *track = rim_arc(scr, pal.ahead);
    lv_obj_set_style_arc_opa(track, pal.ahead_opa, 0);
    rim_arc_set(track, 0, 3599);
    st->ring = rim_progress(scr, pal.accent);
    rim_progress_set(st->ring, (int32_t)((int64_t)st->ms * 3600 / (n->total_s * 1000)));

    kicker(scr, pal.kick, 40, n->kicker);
    play_button(scr, st, pal.dark);
    back_button(scr, st, pal.dark);

    lv_obj_t *card = slip(scr, 0, 0, CARD_W, LV_SIZE_CONTENT);
    lv_obj_align(card, LV_ALIGN_BOTTOM_LEFT, CARD_X, CARD_BOTTOM - SCREEN_H);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_ver(card, 13, 0);
    lv_obj_set_style_pad_row(card, 6, 0);
    if (n->title) {
        lv_obj_t *t = text_in(card, &jost_light_25, C_CHARCOAL, n->title);
        lv_obj_set_width(t, CARD_W - 32);
        lv_label_set_long_mode(t, LV_LABEL_LONG_MODE_WRAP);
        lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);
    }
    st->caption = text_in(card, &jost_regular_20, lv_color_mix(C_CHARCOAL, C_SLIP, 140), "");
    lv_label_set_recolor(st->caption, true);
    lv_obj_set_width(st->caption, CARD_W - 32);
    lv_obj_set_style_text_align(st->caption, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_line_space(st->caption, 26 - jost_regular_20.line_height, 0);
    show_caption(st);

    /* The credit and the clock, the clock going under when a long name needs the room. */
    lv_obj_t *row = box(card, 0, 0, CARD_W - 24, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW_WRAP);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 12, 0);
    lv_obj_set_style_pad_row(row, 2, 0);
    text_in(row, &jost_light_italic_15, C_SEPIA, n->credit);
    st->clock = text_in(row, &jost_regular_16, C_SEPIA, "");
    show_clock(st);

    st->timer = lv_timer_create(tick, TICK_MS, st);
    lv_obj_add_event_cb(scr, done, LV_EVENT_DELETE, st);

    ui_hints(scr, ground, walk_at_last() ? "FINISH" : "NEXT STOP", "MENU");
    return scr;
}

/** The stop's narration, set up for whoever's on screen. */
static narration_state_t *stop_narration(const art_portrait_t *host, mood_t speaking, bool titled)
{
    narration_state_t *st = lv_malloc(sizeof(narration_state_t));
    lv_memzero(st, sizeof(*st));
    narration_t *n = &st->n_;
    const stop_t *s = walk_stop();
    n->host = host;
    n->speaking = speaking;
    n->waiting = MOOD_IDLE;
    snprintf(n->kicker, sizeof n->kicker, "STOP %d OF %d", walk_at() + 1, walk_now()->stop_count);
    n->title = titled ? s->name : NULL;
    n->caption = s->caption;
    if (s->speaker) snprintf(n->credit, sizeof n->credit, "in the voice of %s", architect_name(s->speaker));
    else snprintf(n->credit, sizeof n->credit, "read by the guide");
    n->total_s = simulated_s(s->caption);
    st->n = n;
    return st;
}

/* The stop's own architect, telling it. */
lv_obj_t *screen_listening(void)
{
    const art_portrait_t *speaker = walk_speaker();
    if (!speaker) return screen_guidestop();
    return narration_screen(stop_narration(speaker, MOOD_TALK, false));
}

/* The guide (or an architect not yet drawn) telling it, the host listening. */
lv_obj_t *screen_guidestop(void)
{
    return narration_screen(stop_narration(walk_host(), MOOD_LISTEN, true));
}
