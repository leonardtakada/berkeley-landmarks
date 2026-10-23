/**
 * The press sheet, after constants/book.ts: cream stock, the blue board, two
 * flat inks (blue and vermilion) and their tints, charcoal and sepia for text.
 */
#pragma once
#include "lvgl.h"
#include "fonts.h"

#define SCREEN_W 466
#define SCREEN_H 466

#define C_PAPER      lv_color_hex(0xFAF6EC) /* interior leaves */
#define C_SLIP       lv_color_hex(0xFDFAF2) /* a loose slip laid on the page */
#define C_CREAM      lv_color_hex(0xF2F0E6) /* cover stock, lettering on the board */
#define C_BOARD      lv_color_hex(0x0A2C8D) /* the cover board */
#define C_BLUE       lv_color_hex(0x0B2E8C)
#define C_BLUE_TINT  lv_color_hex(0xC9D0E4)
#define C_VERMILION  lv_color_hex(0xE4592B)
#define C_VERM_TINT  lv_color_hex(0xF4CDB9)
#define C_CHARCOAL   lv_color_hex(0x2E2A27)
#define C_SEPIA      lv_color_hex(0x7A6E62)

/**
 * The marks laid over a portrait's ground. On the dark grounds (blue,
 * charcoal) they go cream, as lettering does on the cover board; on vermilion
 * the accent goes cream so the stop now still shows.
 */
typedef struct {
    lv_color_t ground;
    bool dark;         /* lettering on it goes cream */
    lv_color_t kick;   /* tracked capitals */
    lv_color_t mark;   /* stops walked, the map glyph */
    lv_color_t ahead;  /* stops to come, the handle */
    lv_opa_t ahead_opa;
    lv_color_t accent; /* the stop now, the pointer, the finding rings */
    lv_color_t shadow; /* under the pointer */
    lv_color_t chip;   /* the map button */
    lv_opa_t chip_opa;
} palette_t;

static inline palette_t palette_for(uint32_t ground)
{
    int32_t lum = (299 * (int32_t)(ground >> 16) + 587 * (int32_t)((ground >> 8) & 0xFF) + 114 * (int32_t)(ground & 0xFF)) / 1000;
    bool dark = lum < 115;
    palette_t p = {.ground = lv_color_hex(ground), .dark = dark};
    p.kick = p.mark = dark ? C_CREAM : C_BLUE;
    p.accent = ground == 0xE4592B ? C_CREAM : C_VERMILION;
    if (dark) {
        p.ahead = C_CREAM, p.ahead_opa = 72;
        p.shadow = lv_color_mix(lv_color_black(), p.ground, 100);
        p.chip = C_CREAM, p.chip_opa = 40;
    } else {
        /* On the palest grounds a paper-white rim would vanish. */
        p.ahead = lum > 235 ? C_BLUE_TINT : C_SLIP, p.ahead_opa = 190;
        p.shadow = lv_color_mix(C_BLUE, p.ground, 64);
        p.chip = C_SLIP, p.chip_opa = 230;
    }
    return p;
}
