#include "ui.h"
#include "audio/player.h"
#include <string.h>
#include "theme.h"

int ui_walk = 0;
static screen_id_t current = SCR_COVER;
static lv_obj_t *current_scr;

static const struct {
    const char *name;
    lv_obj_t *(*build)(void);
} screens[SCR_COUNT] = {
    [SCR_COVER] = {"cover", screen_cover},
    [SCR_WALKS] = {"walks", screen_walks},
    [SCR_FINDING] = {"finding", screen_finding},
    [SCR_FOLLOW] = {"follow", screen_follow},
    [SCR_MAP] = {"map", screen_map},
    [SCR_CONTROLS] = {"controls", screen_controls},
    [SCR_ARRIVED] = {"arrived", screen_arrived},
    [SCR_LISTENING] = {"listening", screen_listening},
    [SCR_GUIDESTOP] = {"guide", screen_guidestop},
    [SCR_HANDOVER] = {"handover", screen_handover},
    [SCR_RESTING] = {"resting", screen_resting},
    [SCR_WALKED] = {"walked", screen_walked},
    [SCR_HARDWARE] = {"hw", screen_hardware},
    [SCR_ENDWALK] = {"end", screen_endwalk},
    [SCR_EXPLORE] = {"explore", screen_explore},
};

lv_obj_t *ui_screen(lv_color_t bg)
{
    lv_obj_t *scr = lv_obj_create(NULL);
    lv_obj_remove_style_all(scr);
    lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(scr, bg, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    return scr;
}

void ui_show_anim(screen_id_t id, lv_screen_load_anim_t anim, uint32_t ms)
{
    if (id >= SCR_COUNT) return;
    current = id;
    /* The narration plays on under the controls (and what opens from them); shown anything else, it stops. */
    if (id != SCR_LISTENING && id != SCR_GUIDESTOP && id != SCR_CONTROLS && id != SCR_HARDWARE && id != SCR_ENDWALK) {
        player_stop();
    }
    lv_obj_t *scr = screens[id].build();
    current_scr = scr;
    /* The old screen and its motions are deleted once the new one is in. */
    lv_screen_load_anim(scr, anim, ms, 0, true);
}

void ui_show(screen_id_t id)
{
    ui_show_anim(id, LV_SCREEN_LOAD_ANIM_FADE_IN, 280);
}

void ui_go(lv_event_t *e)
{
    ui_show((screen_id_t)(intptr_t)lv_event_get_user_data(e));
}

bool ui_show_named(const char *name)
{
    for (int i = 0; i < SCR_COUNT; i++) {
        if (screens[i].name && strcmp(screens[i].name, name) == 0) {
            ui_show(i);
            return true;
        }
    }
    return false;
}

bool ui_is_current(lv_obj_t *scr)
{
    return scr == current_scr;
}

typedef struct {
    lv_obj_t *scr;
    lv_timer_t *timer;
    void (*then)(void);
} after_t;

static void after_due(lv_timer_t *t)
{
    after_t *a = lv_timer_get_user_data(t);
    lv_timer_pause(t);
    /* Not if another screen has already been asked for while this one goes. */
    if (ui_is_current(a->scr)) a->then();
}

static void after_gone(lv_event_t *e)
{
    after_t *a = lv_event_get_user_data(e);
    lv_timer_delete(a->timer);
    lv_free(a);
}

void ui_after(lv_obj_t *scr, uint32_t ms, void (*then)(void))
{
    after_t *a = lv_malloc(sizeof(after_t));
    a->scr = scr;
    a->then = then;
    a->timer = lv_timer_create(after_due, ms, a);
    lv_obj_add_event_cb(scr, after_gone, LV_EVENT_DELETE, a);
}

screen_id_t ui_current(void)
{
    return current;
}

const char *ui_current_name(void)
{
    return screens[current].name;
}

void ui_init(void)
{
    lv_obj_t *scr = screen_cover();
    current_scr = scr;
    lv_screen_load(scr);
}
