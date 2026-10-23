#include "portrait.h"
#include "motion.h"
#include "widgets.h"

typedef struct {
    const art_portrait_t *art;
    lv_obj_t *body, *head, *face, *eye, *brow, *mouth, *smile;
} portrait_t;

/** A layer placed on screen, inside a parent whose own top-left is at (ox, oy). */
static lv_obj_t *layer(lv_obj_t *parent, const art_layer_t *l, int32_t ox, int32_t oy)
{
    if (!l->img) return NULL;
    lv_obj_t *img = lv_image_create(parent);
    lv_image_set_src(img, l->img);
    lv_obj_set_pos(img, l->x - ox, l->y - oy);
    return img;
}

static void freed(lv_event_t *e)
{
    lv_free(lv_event_get_user_data(e));
}

/** The drawing's units (200 × 240) in pixels at this portrait's size, ×10 for precision. */
static int32_t u(const portrait_t *p, int32_t tenths)
{
    return tenths * p->art->unit / 2000;
}

static void reset(portrait_t *p)
{
    lv_obj_t *all[] = {p->body, p->head, p->eye, p->brow, p->mouth, p->smile};
    for (unsigned i = 0; i < sizeof(all) / sizeof(all[0]); i++) {
        if (!all[i]) continue;
        motion_stop(all[i]);
        lv_obj_set_style_translate_x(all[i], 0, 0);
        lv_obj_set_style_translate_y(all[i], 0, 0);
        lv_obj_set_style_opa(all[i], LV_OPA_COVER, 0);
        if (all[i] != p->head) {
            lv_image_set_scale_x(all[i], 256);
            lv_image_set_scale_y(all[i], 256);
        }
    }
    if (p->smile) lv_obj_set_style_opa(p->smile, LV_OPA_TRANSP, 0);
}

static void smiling(portrait_t *p, bool on)
{
    if (!p->smile) return;
    if (p->mouth) lv_obj_set_style_opa(p->mouth, on ? LV_OPA_TRANSP : LV_OPA_COVER, 0);
    lv_obj_set_style_opa(p->smile, on ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
}

/** A grin now and then: the mouth swaps for its smile and back. */
static void grins(portrait_t *p, uint32_t period)
{
    if (!p->smile) return;
    if (p->mouth) motion_loop(p->mouth, KF({0, 255}, {550, 255}, {600, 0}, {730, 0}, {780, 255}, {1000, 255}), period, 0, m_opa);
    motion_loop(p->smile, KF({0, 0}, {550, 0}, {600, 255}, {730, 255}, {780, 0}, {1000, 0}), period, 0, m_opa);
}

static void blinks(portrait_t *p, bool twice)
{
    if (!p->eye) return;
    if (twice)
        motion_loop(p->eye, KF({0, 256}, {700, 256}, {720, 26}, {740, 256}, {780, 256}, {800, 26}, {820, 256}, {1000, 256}), 3400, 0, m_scale_y);
    else
        motion_loop(p->eye, KF({0, 256}, {920, 256}, {940, 26}, {960, 256}, {1000, 256}), 5600, 0, m_scale_y);
}

static void looks_about(portrait_t *p, uint32_t period)
{
    if (!p->eye) return;
    int32_t a = u(p, 34);
    motion_loop(p->eye, KF({0, 0}, {240, 0}, {300, (int16_t)a}, {460, (int16_t)a}, {520, 0}, {780, 0}, {840, (int16_t)-a}, {940, (int16_t)-a}, {1000, 0}), period, 0, m_x);
}

void portrait_set_mood(lv_obj_t *root, mood_t mood)
{
    portrait_t *p = lv_obj_get_user_data(root);
    reset(p);

    /* Everyone breathes: the shoulders rise and settle (their foot is off the screen). */
    if (p->body) motion_loop(p->body, KF({0, 0}, {500, (int16_t)-u(p, 10)}, {1000, 0}), mood == MOOD_SLEEP ? 6000 : 4400, 0, m_y);

    switch (mood) {
    case MOOD_IDLE:
        blinks(p, false);
        looks_about(p, 10000);
        grins(p, 9000);
        break;
    case MOOD_WALK:
        /* The eyes are left to portrait_gaze, on the way ahead. */
        blinks(p, false);
        grins(p, 9000);
        motion_loop(p->head, KF({0, 0}, {250, (int16_t)-u(p, 40)}, {500, 0}, {750, (int16_t)-u(p, 40)}, {1000, 0}), 1200, 0, m_y);
        break;
    case MOOD_SEARCH:
        blinks(p, false);
        if (p->eye) motion_loop(p->eye, KF({0, (int16_t)-u(p, 34)}, {400, (int16_t)u(p, 34)}, {550, (int16_t)u(p, 34)}, {1000, (int16_t)-u(p, 34)}), 3200, 0, m_x);
        motion_loop(p->head, KF({0, (int16_t)-u(p, 40)}, {500, (int16_t)u(p, 40)}, {1000, (int16_t)-u(p, 40)}), 6400, 0, m_x);
        break;
    case MOOD_GLAD:
        smiling(p, true);
        blinks(p, true);
        motion_loop(p->head, KF({0, 0}, {180, (int16_t)-u(p, 70)}, {360, 0}, {540, (int16_t)-u(p, 50)}, {720, 0}, {1000, 0}), 2600, 900, m_y);
        break;
    case MOOD_TALK:
        blinks(p, false);
        if (p->mouth)
            motion_loop(p->mouth, KF({0, 90}, {60, 294}, {120, 128}, {180, 333}, {240, 102}, {310, 243}, {370, 77}, {450, 77}, {510, 307}, {570, 141}, {630, 269}, {690, 90}, {750, 320}, {820, 128}, {880, 77}, {1000, 77}), 2700, 0, m_scale_y);
        motion_loop(p->head, KF({0, 0}, {250, (int16_t)u(p, 10)}, {500, (int16_t)-u(p, 10)}, {750, (int16_t)u(p, 15)}, {1000, 0}), 5400, 0, m_y);
        if (p->eye) motion_loop(p->eye, KF({0, 0}, {700, 0}, {760, (int16_t)u(p, 24)}, {840, (int16_t)u(p, 24)}, {900, 0}, {1000, 0}), 12000, 0, m_x);
        break;
    case MOOD_LISTEN:
        blinks(p, false);
        grins(p, 12000);
        if (p->eye) {
            lv_obj_set_style_translate_y(p->eye, -u(p, 16), 0);
            motion_loop(p->eye, KF({0, 0}, {600, 0}, {680, (int16_t)u(p, 24)}, {840, (int16_t)u(p, 24)}, {900, 0}, {1000, 0}), 9000, 0, m_x);
        }
        motion_loop(p->head, KF({0, 0}, {400, 0}, {480, (int16_t)u(p, 15)}, {560, 0}, {640, (int16_t)u(p, 10)}, {720, 0}, {1000, 0}), 4800, 0, m_y);
        break;
    case MOOD_SLEEP:
        if (p->eye) lv_image_set_scale_y(p->eye, 60);
        if (p->mouth) motion_loop(p->mouth, KF({0, 108}, {500, 159}, {1000, 108}), 6000, 0, m_scale);
        motion_loop(p->head, KF({0, 0}, {500, (int16_t)u(p, 20)}, {1000, 0}), 6000, 0, m_y);
        break;
    case MOOD_ASIDE:
        smiling(p, true);
        blinks(p, false);
        if (p->eye) lv_obj_set_style_translate_x(p->eye, u(p, 34), 0);
        break;
    case MOOD_HELLO:
        smiling(p, true);
        blinks(p, false);
        if (p->brow) motion_loop(p->brow, KF({0, 0}, {100, (int16_t)-u(p, 50)}, {220, (int16_t)-u(p, 50)}, {300, 0}, {1000, 0}), 4200, 1800, m_y);
        break;
    }
}

lv_obj_t *portrait_create(lv_obj_t *parent, const art_portrait_t *art, mood_t mood)
{
    portrait_t *p = lv_malloc(sizeof(portrait_t));
    lv_memzero(p, sizeof(*p));
    p->art = art;

    lv_obj_t *root = box(parent, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_set_user_data(root, p);
    lv_obj_add_event_cb(root, freed, LV_EVENT_DELETE, p);

    p->body = layer(root, &art->body, 0, 0);

    /* The head's box is just big enough for its parts, so a nod redraws the head, not the screen. */
    const art_layer_t *parts[] = {&art->head, &art->eye, &art->brow, &art->mouth, &art->smile};
    int32_t x1 = SCREEN_W, y1 = SCREEN_H, x2 = 0, y2 = 0;
    for (unsigned i = 0; i < sizeof(parts) / sizeof(parts[0]); i++) {
        const art_layer_t *l = parts[i];
        if (!l->img) continue;
        x1 = LV_MIN(x1, l->x), y1 = LV_MIN(y1, l->y);
        x2 = LV_MAX(x2, l->x + (int32_t)l->img->header.w), y2 = LV_MAX(y2, l->y + (int32_t)l->img->header.h);
    }
    p->head = box(root, x1, y1, x2 - x1, y2 - y1);
    p->face = layer(p->head, &art->head, x1, y1);
    p->eye = layer(p->head, &art->eye, x1, y1);
    p->brow = layer(p->head, &art->brow, x1, y1);
    p->mouth = layer(p->head, &art->mouth, x1, y1);
    p->smile = layer(p->head, &art->smile, x1, y1);

    /* The mouth opens downward from its top. */
    if (p->mouth) lv_image_set_pivot(p->mouth, art->mouth.img->header.w / 2, 0);

    portrait_set_mood(root, mood);
    return root;
}

void portrait_dim(lv_obj_t *root, lv_color_t color, lv_opa_t opa)
{
    portrait_t *p = lv_obj_get_user_data(root);
    lv_obj_t *all[] = {p->body, p->face, p->eye, p->brow, p->mouth, p->smile};
    for (unsigned i = 0; i < sizeof(all) / sizeof(all[0]); i++) {
        if (!all[i]) continue;
        lv_obj_set_style_image_recolor(all[i], color, 0);
        lv_obj_set_style_image_recolor_opa(all[i], opa, 0);
    }
}

void portrait_gaze(lv_obj_t *root, int32_t tenths)
{
    portrait_t *p = lv_obj_get_user_data(root);
    if (p->eye) m_x(p->eye, u(p, tenths));
}

void portrait_rise(lv_obj_t *root, int32_t from_px, uint32_t delay_ms)
{
    motion_once(root, from_px, 0, 800, delay_ms, m_y);
}
