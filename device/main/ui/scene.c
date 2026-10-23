#include "scene.h"
#include "motion.h"
#include "theme.h"
#include "widgets.h"

/* How far the sky travels each way, in px. The front patches were cut to
 * ART_SCENE_REACH_UNITS of the drawing, at least 29 px on screen. */
#define SKY_REACH 22
#define CLOUD_REACH 18

static lv_obj_t *place(lv_obj_t *parent, const art_layer_t *l)
{
    lv_obj_t *img = lv_image_create(parent);
    lv_image_set_src(img, l->img);
    lv_obj_set_pos(img, l->x, l->y);
    return img;
}

lv_obj_t *scene_create(lv_obj_t *parent, const art_scene_t *s)
{
    lv_obj_t *root = box(parent, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_t *base = lv_image_create(root);
    lv_image_set_src(base, s->base);

    for (uint8_t i = 0; i < s->sky_n; i++) {
        lv_obj_t *part = place(root, &s->sky[i].part);
        if (s->sky_sinks) {
            motion_loop(part, KF({0, 0}, {500, SKY_REACH}, {1000, 0}), 18000, 0, m_y);
        } else {
            /* Rising on one side, setting on the other, and back. */
            motion_loop(part, KF({0, -SKY_REACH}, {500, SKY_REACH}, {1000, -SKY_REACH}), 28000, 0, m_x);
            motion_loop(part, KF({0, 16}, {250, -12}, {500, 16}, {750, -12}, {1000, 16}), 28000, 0, m_y);
        }
        if (s->sky[i].front.img) place(root, &s->sky[i].front);
    }
    for (uint8_t i = 0; i < s->cloud_n; i++) {
        lv_obj_t *part = place(root, &s->clouds[i].part);
        motion_loop(part, KF({0, -CLOUD_REACH}, {500, CLOUD_REACH}, {1000, -CLOUD_REACH}), 24000 + i * 3000, i * 2000, m_x);
        if (s->clouds[i].front.img) place(root, &s->clouds[i].front);
    }
    return root;
}
