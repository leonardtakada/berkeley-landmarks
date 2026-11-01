#include "prints.h"
#include <stdio.h>
#include "esp_heap_caps.h"
#include "esp_jpeg_dec.h"
#include "audio/player.h"
#include "src/misc/cache/instance/lv_image_cache.h"
#include "storage/card.h"
#include "theme.h"
#include "widgets.h"

#define SLOTS 2       /* this stop's and the last: the screen going out may still show it */
#define FILE_MAX 32768 /* a print is about 12 KB */
#define OFFSET 7      /* how far out of register the vermilion plate sits */

typedef struct {
    int lm; /* 0: empty */
    uint32_t used;
    lv_image_dsc_t dsc;
    uint8_t *pixels;
} slot_t;

static slot_t slots[SLOTS];
static uint32_t clock_;

static bool decode(int lm, slot_t *s)
{
    static uint8_t *jpeg;
    if (!jpeg) jpeg = heap_caps_malloc(FILE_MAX, MALLOC_CAP_SPIRAM);
    if (!jpeg || !card_state().mounted) return false;
    char path[48];
    snprintf(path, sizeof path, PLAYER_DIR "/pr%d.jpg", lm);
    FILE *f = fopen(path, "rb");
    if (!f) return false;
    size_t len = fread(jpeg, 1, FILE_MAX, f);
    fclose(f);
    if (len == 0 || len == FILE_MAX) return false;
    if (!s->pixels) s->pixels = jpeg_calloc_align(PRINT_PX * PRINT_PX * 2, 16);
    if (!s->pixels) return false;

    jpeg_dec_config_t config = {.output_type = JPEG_PIXEL_FORMAT_RGB565_LE, .rotate = JPEG_ROTATE_0D};
    jpeg_dec_handle_t dec = NULL;
    if (jpeg_dec_open(&config, &dec) != JPEG_ERR_OK) return false;
    jpeg_dec_io_t io = {.inbuf = jpeg, .inbuf_len = (int)len};
    jpeg_dec_header_info_t info;
    bool ok = jpeg_dec_parse_header(dec, &io, &info) == JPEG_ERR_OK && info.width == PRINT_PX && info.height == PRINT_PX;
    if (ok) {
        io.outbuf = s->pixels;
        ok = jpeg_dec_process(dec, &io) == JPEG_ERR_OK;
    }
    jpeg_dec_close(dec);
    if (!ok) return false;
    s->dsc = (lv_image_dsc_t){
        .header = {.magic = LV_IMAGE_HEADER_MAGIC, .cf = LV_COLOR_FORMAT_RGB565, .w = PRINT_PX, .h = PRINT_PX, .stride = PRINT_PX * 2},
        .data_size = PRINT_PX * PRINT_PX * 2,
        .data = s->pixels,
    };
    lv_image_cache_drop(&s->dsc); /* the slot may have held another print */
    return true;
}

const lv_image_dsc_t *print_of(int lm)
{
    if (lm <= 0) return NULL;
    slot_t *lru = &slots[0];
    for (int i = 0; i < SLOTS; i++) {
        if (slots[i].lm == lm) {
            slots[i].used = ++clock_;
            return &slots[i].dsc;
        }
        if (slots[i].used < lru->used) lru = &slots[i];
    }
    lru->lm = 0;
    if (!decode(lm, lru)) return NULL;
    lru->lm = lm;
    lru->used = ++clock_;
    return &lru->dsc;
}

lv_obj_t *print_show(lv_obj_t *parent, int lm, int32_t cx, int32_t cy, lv_color_t ring, lv_color_t plate)
{
    const lv_image_dsc_t *dsc = print_of(lm);
    if (!dsc) return NULL;
    int32_t x = cx - PRINT_PX / 2, y = cy - PRINT_PX / 2;
    disc(parent, x + OFFSET, y + OFFSET, PRINT_PX, plate);
    lv_obj_t *p = box(parent, x, y, PRINT_PX, PRINT_PX);
    lv_obj_set_style_radius(p, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_clip_corner(p, true, 0);
    lv_obj_set_style_border_width(p, 3, 0);
    lv_obj_set_style_border_color(p, ring, 0);
    lv_obj_set_style_border_post(p, true, 0);
    lv_obj_t *img = lv_image_create(p);
    lv_image_set_src(img, dsc);
    lv_obj_center(img);
    return p;
}
