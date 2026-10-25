/**
 * A story: a stop's, the walk's introduction, or a landmark's on your own.
 * It starts at once. Its architect fills the screen, talking, when they're
 * drawn; otherwise the host listens while the guide (or an architect not yet
 * drawn) reads it. The stop's name and the caption sit on a slip, the caption
 * lighting word by word for noisy streets; progress runs round the rim; back
 * 15 seconds on the left. A stop whose label you earned
 * standing at it has its stamp pressed on as the story opens (the arrival and
 * the handover that used to come first are folded in here).
 *
 * The upper button is Pause and Resume, its tab saying which (tapping the tab
 * is the same). When the story is told nothing moves on by itself: the tab
 * says what's next, Next stop, First stop, Finish, or Done on your own, and
 * back 15 seconds plays its end again. The lower is the menu (Back on your
 * own).
 *
 * The voice comes from the SD card (audio/player.c) when the card has the
 * stop's narration: the clock and ring follow it, and where the speaker
 * changes (the guide's coda after an architect) the credit changes and the
 * architect stops talking and listens. It plays on under the controls. A card
 * without the stop falls back to a simulation: a running clock, the ring
 * filling. Either way the opening lines loop as the caption, and it picks up
 * where it was if the screen is left and come back to.
 */
#include "ui.h"
#include <stdio.h>
#include <string.h>
#include "audio/player.h"
#include "data.h"
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
    const char *who; /* whose portrait is on screen (an architect's key), or NULL */
    char caption_buf[48]; /* the introduction's caption, which isn't a stop's */
    char part[8];    /* the stop's narration on the card ("lm17") */
    const player_part_t *real; /* its length and speakers, if the card has it; NULL: simulated */
} narration_t;

/* The slip, centred left of the tabs, clear of the lower one, its foot near the rim. */
#define CARD_X 62
#define CARD_W 236
#define CARD_BOTTOM 424

/* Without the card's narration, a stop runs about as long as a short narration would. */
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
    narration_t n_; /* the story's, built for this screen */
    const narration_t *n;
    lv_obj_t *scr, *host, *caption, *clock, *ring, *credit, *tab;
    uint32_t ms; /* played so far */
    int shown_s; /* the second the clock shows */
    const char *speaking_now; /* the section's speaker, from the card's parts.txt */
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
    st->shown_s = at;
    lv_label_set_text_fmt(st->clock, "%d:%02d / %d:%02d", (int)(at / 60), (int)(at % 60), (int)(st->n->total_s / 60),
                          (int)(st->n->total_s % 60));
}

/** Who's speaking at `ms`, by the card's sections ("guide", an architect's key). */
static const char *speaker_at(const narration_t *n, uint32_t ms)
{
    const char *who = NULL;
    for (int i = 0; n->real && i < n->real->sections; i++) {
        if (n->real->section[i].from_ms <= ms) who = n->real->section[i].speaker;
    }
    return who;
}

/** The portrait talks while its own architect's voice plays, and listens to anyone else's. */
static mood_t mood_now(narration_state_t *st)
{
    if (!st->playing) return st->n->waiting;
    if (!st->n->real) return st->n->speaking;
    return st->n->who && st->speaking_now && strcmp(st->n->who, st->speaking_now) == 0 ? MOOD_TALK : MOOD_LISTEN;
}

/** Where the speaker changes, the credit and the portrait's mood follow. */
static void follow_speaker(narration_state_t *st)
{
    const char *who = speaker_at(st->n, st->ms);
    if (!who || (st->speaking_now && strcmp(who, st->speaking_now) == 0)) return;
    st->speaking_now = who;
    if (strcmp(who, "guide") == 0) lv_label_set_text(st->credit, "read by the guide");
    else lv_label_set_text_fmt(st->credit, "in the voice of %s", architect_name(who));
    if (st->host) portrait_set_mood(st->host, mood_now(st));
}

static void show_controls(narration_state_t *st);

static void tick(lv_timer_t *t)
{
    narration_state_t *st = lv_timer_get_user_data(t);
    if (!st->playing) return;
    player_state_t ps = {0};
    if (st->n->real) {
        ps = player_state();
        st->ms = ps.at_ms;
        follow_speaker(st);
    } else {
        st->ms += TICK_MS;
    }

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
    if ((int32_t)st->ms / 1000 != st->shown_s) show_clock(st);

    /* Told: it stays, and says what's next. */
    bool told = st->n->real ? ps.done : at == total;
    if (told && !st->finished) {
        rim_progress_set(st->ring, 3600);
        st->ms = (uint32_t)st->n->total_s * 1000;
        show_clock(st);
        st->finished = true;
        st->playing = false;
        if (st->host) portrait_set_mood(st->host, st->n->waiting);
        show_controls(st);
    }
}

/** What's next once it's told: the upper button's word, for the tab and the slip's button. */
static const char *next_word(bool caps)
{
    if (walk_is_free()) return caps ? "DONE" : "Done";
    if (walk_in_intro()) return caps ? "FIRST STOP" : "First stop";
    if (walk_at_last()) return caps ? "FINISH" : "Finish";
    return caps ? "NEXT STOP" : "Next stop";
}

/** The upper button's tab, as things stand. */
static void show_controls(narration_state_t *st)
{
    if (st->tab) lv_label_set_text(lv_obj_get_child(st->tab, 0), st->finished ? next_word(true) : st->playing ? "PAUSE" : "RESUME");
}

/** Pause, resume, or once told, from the top again. */
static void toggle_state(narration_state_t *st)
{
    if (st->finished) {
        st->finished = false;
        st->ms = 0;
        st->lit = -1;
        st->speaking_now = NULL;
        if (st->n->real) player_play(st->n->part, 0);
        st->playing = true;
    } else {
        st->playing = !st->playing;
        if (st->n->real) player_pause(!st->playing);
    }
    if (st->host) portrait_set_mood(st->host, mood_now(st));
    show_controls(st);
}

/* The one story showing, for the upper button. */
static narration_state_t *showing;

void story_upper(void)
{
    if (!showing) return;
    if (showing->finished) ui_next_stop();
    else toggle_state(showing);
}



/** Back fifteen seconds, to catch a sentence missed in traffic (or once told, to hear its end again). */
static void back15(lv_event_t *e)
{
    narration_state_t *st = lv_event_get_user_data(e);
    if (st->finished) {
        st->finished = false;
        st->playing = true;
        if (st->n->real) player_play(st->n->part, st->ms);
        if (st->host) portrait_set_mood(st->host, mood_now(st));
        show_controls(st);
    }
    st->ms = st->ms > 15000 ? st->ms - 15000 : 0;
    st->ms -= st->ms % TICK_MS;
    st->lit = -1;
    if (st->n->real) player_seek(st->ms);
    rim_progress_set(st->ring, (int32_t)((int64_t)st->ms * 3600 / ((int64_t)st->n->total_s * 1000)));
    show_clock(st);
}

static void done(lv_event_t *e)
{
    narration_state_t *st = lv_event_get_user_data(e);
    lv_timer_delete(st->timer);
    /* Told stays told: come back to it and it's at its end, saying what's next. */
    walk_set_heard_ms(st->finished ? (uint32_t)st->n->total_s * 1000 : st->ms);
    if (showing == st) showing = NULL;
    lv_free(st);
}

/** On the left, across from the tabs: "15" with a back chevron. */
static lv_obj_t *back_button(lv_obj_t *scr, narration_state_t *st, bool dark)
{
    lv_obj_t *b = disc(scr, 34, 150, 64, dark ? C_CREAM : C_BLUE);
    lv_obj_add_flag(b, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_ext_click_area(b, 12);
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
    showing = st;
    st->playing = true;
    bool told = walk_heard_ms() >= (uint32_t)n->total_s * 1000;
    st->ms = LV_MIN(walk_heard_ms(), (uint32_t)n->total_s * 1000 - 1000);
    st->ms -= st->ms % TICK_MS;
    st->shown_s = -1;
    time_words(st);
    if (n->real) {
        /* Back from the menu or the map, the voice has played on: take it up where it is. */
        if (player_is(n->part)) {
            player_state_t ps = player_state();
            st->ms = ps.at_ms;
            /* Paused before stays paused; told while away is told (tick sees it done). */
            st->playing = ps.playing || ps.done;
        } else if (!told) {
            player_play(n->part, st->ms);
        }
    }
    if (told && !(n->real && player_is(n->part))) {
        st->ms = (uint32_t)n->total_s * 1000;
        st->finished = true;
        st->playing = false;
    }

    st->host = walk_companion(scr, n->host, n->speaking);

    lv_obj_t *track = rim_arc(scr, pal.ahead);
    lv_obj_set_style_arc_opa(track, pal.ahead_opa, 0);
    rim_arc_set(track, 0, 3599);
    st->ring = rim_progress(scr, pal.accent);
    rim_progress_set(st->ring, (int32_t)((int64_t)st->ms * 3600 / (n->total_s * 1000)));

    kicker(scr, pal.kick, 40, n->kicker);
    back_button(scr, st, pal.dark);

    lv_obj_t *card = slip(scr, 0, 0, CARD_W, LV_SIZE_CONTENT);
    lv_obj_align(card, LV_ALIGN_BOTTOM_LEFT, CARD_X, CARD_BOTTOM - SCREEN_H);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_ver(card, 13, 0);
    lv_obj_set_style_pad_row(card, 6, 0);
    /* The title on one line and the caption on three at most, so the slip stays clear of "15". */
    if (n->title) {
        lv_obj_t *t = text_in(card, &jost_light_25, C_CHARCOAL, n->title);
        lv_obj_set_size(t, CARD_W - 28, jost_light_25.line_height);
        lv_label_set_long_mode(t, LV_LABEL_LONG_MODE_DOTS);
        lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);
    }
    st->caption = text_in(card, &jost_regular_20, lv_color_mix(C_CHARCOAL, C_SLIP, 140), "");
    lv_label_set_recolor(st->caption, true);
    lv_obj_set_width(st->caption, CARD_W - 28);
    lv_obj_set_height(st->caption, 3 * 26); /* wrapped, and cut at the third line */
    lv_obj_set_style_text_align(st->caption, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_line_space(st->caption, 26 - jost_regular_20.line_height, 0);
    show_caption(st);

    /* The credit and the clock, the clock going under when a long name needs the room. */
    lv_obj_t *row = box(card, 0, 0, CARD_W - 24, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW_WRAP);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 12, 0);
    lv_obj_set_style_pad_row(row, 2, 0);
    st->credit = text_in(row, &jost_light_italic_18, C_SEPIA, n->credit);
    st->clock = text_in(row, &jost_regular_16, C_SEPIA, "");
    show_clock(st);
    follow_speaker(st);

    /* The stop's label, if you earned it standing there: pressed on now if it's new. */
    if (!walk_is_free() && !walk_in_intro() && walk_collected(walk_at())) {
        char top[12], mid[4];
        snprintf(top, sizeof top, "WALK %02d", ui_walk + 1);
        snprintf(mid, sizeof mid, "%02d", walk_at() + 1);
        lv_obj_t *s = stamp(scr, 386, 236, 104, top, mid, &jost_light_54, NULL, true, -80);
        if (walk_stamp_due()) stamp_press(scr, s, 386, 236, 104, -80, 300);
    }

    st->timer = lv_timer_create(tick, TICK_MS, st);
    lv_obj_add_event_cb(scr, done, LV_EVENT_DELETE, st);

    st->tab = ui_hints(scr, ground, "PAUSE", walk_is_free() ? "BACK" : "MENU");
    show_controls(st);
    return scr;
}

/** The story, set up for whoever's on screen. */
static narration_state_t *story(const art_portrait_t *host, mood_t speaking)
{
    narration_state_t *st = lv_malloc(sizeof(narration_state_t));
    lv_memzero(st, sizeof(*st));
    narration_t *n = &st->n_;
    n->host = host;
    n->speaking = speaking;
    n->waiting = MOOD_IDLE;
    const walk_t *w = walk_now();
    if (walk_in_intro()) {
        /* The walk's introduction, read by the guide, the host listening. */
        snprintf(n->kicker, sizeof n->kicker, "WALK %02d", ui_walk + 1);
        n->title = w->name;
        walk_size_line(w, n->caption_buf, sizeof n->caption_buf);
        n->caption = n->caption_buf;
        snprintf(n->credit, sizeof n->credit, "read by the guide");
        walk_intro_part(n->part, sizeof n->part);
    } else {
        const stop_t *s = walk_stop();
        if (walk_is_free()) snprintf(n->kicker, sizeof n->kicker, "ON YOUR OWN");
        else snprintf(n->kicker, sizeof n->kicker, "STOP %d OF %d", walk_at() + 1, w->stop_count);
        n->title = s->name;
        n->caption = s->caption;
        if (s->speaker) snprintf(n->credit, sizeof n->credit, "in the voice of %s", architect_name(s->speaker));
        else snprintf(n->credit, sizeof n->credit, "read by the guide");
        snprintf(n->part, sizeof n->part, "lm%d", s->lm);
    }
    n->real = player_part(n->part);
    n->total_s = n->real ? (int32_t)((n->real->length_ms + 999) / 1000) : simulated_s(n->caption);
    st->n = n;
    return st;
}

lv_obj_t *screen_story(void)
{
    /* The stop's own architect, telling it, when they're drawn; otherwise the host listening to whoever reads it. */
    const art_portrait_t *speaker = walk_in_intro() ? NULL : walk_speaker();
    narration_state_t *st = speaker ? story(speaker, MOOD_TALK) : story(walk_host(), MOOD_LISTEN);
    st->n_.who = speaker ? walk_stop()->speaker : walk_now()->host;
    return narration_screen(st);
}
