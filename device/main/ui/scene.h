/**
 * A walk's label scene, full-bleed in the circle, alive: the sun or moon
 * crosses the sky (Piedmont's sinks into its vanishing point) and clouds
 * drift, each passing behind the scenery cut out in front of it.
 */
#pragma once
#include "lvgl.h"
#include "art.h"

lv_obj_t *scene_create(lv_obj_t *parent, const art_scene_t *scene);
