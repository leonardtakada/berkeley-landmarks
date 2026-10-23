#include "data.h"
#include <stdio.h>
#include <string.h>

/* The walks themselves are in walks_gen.c. */

const char *architect_name(const char *key)
{
    for (int i = 0; key && i < architect_count; i++) {
        if (strcmp(architects[i].key, key) == 0) return architects[i].name;
    }
    return key;
}

/* The portraits baked so far (scripts/device/build-art.mjs, PORTRAITS), and their cameos. */
static const struct {
    const char *key;
    const art_portrait_t *art;
    const lv_image_dsc_t *cameo;
} baked[] = {
    {"ratcliff", &art_portrait_ratcliff, &art_cameo_ratcliff},
    {"plachek", &art_portrait_plachek, &art_cameo_plachek},
    {"maybeck", &art_portrait_maybeck, &art_cameo_maybeck},
    {"morgan", &art_portrait_morgan, &art_cameo_morgan},
};

static int baked_index(const char *key)
{
    for (unsigned i = 0; key && i < sizeof baked / sizeof baked[0]; i++) {
        if (strcmp(baked[i].key, key) == 0) return (int)i;
    }
    return -1;
}

const art_portrait_t *portrait_of(const char *key)
{
    int i = baked_index(key);
    return i < 0 ? NULL : baked[i].art;
}

const lv_image_dsc_t *cameo_of(const char *key)
{
    int i = baked_index(key);
    return i < 0 ? NULL : baked[i].cameo;
}

void walk_size_line(const walk_t *w, char *buf, size_t len)
{
    static const char *words[] = {"Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen"};
    int n = w->stop_count;
    char miles[16];
    /* "1.0 mi" → "about a mile"; "1.4 mi" → "1.4 miles". */
    if (strncmp(w->distance, "1.0 ", 4) == 0) snprintf(miles, sizeof miles, "about a mile");
    else snprintf(miles, sizeof miles, "%.*s miles", (int)strcspn(w->distance, " "), w->distance);
    if (n >= 6 && n <= 15) snprintf(buf, len, "%s stops, %s.", words[n - 6], miles);
    else snprintf(buf, len, "%d stops, %s.", n, miles);
}
