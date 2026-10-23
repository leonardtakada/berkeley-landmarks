#include "mapview.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "audio/player.h"
#include "esp_heap_caps.h"
#include "esp_jpeg_dec.h"
#include "esp_log.h"
#include "src/misc/cache/instance/lv_image_cache.h"
#include "storage/card.h"
#include "theme.h"
#include "widgets.h"

#define TAG "mapview"
#define TILE 256
#define CACHE 12 /* decoded tiles kept, 128 KB each in PSRAM */
#define SHOWN 9  /* at most 3 × 3 tiles cover the 466 px screen */

/* --- The tiles on the card ------------------------------------------------------ */

typedef struct {
    uint16_t z, x, y, pad;
    uint32_t off, len;
} tile_entry_t;

static tile_entry_t *entries;
static uint32_t entry_count;
static FILE *bin;
static bool looked; /* tried the card once it was mounted */

static bool open_tiles(void)
{
    if (entries) return true;
    if (looked || !card_state().mounted) return false;
    looked = true;
    FILE *f = fopen(PLAYER_DIR "/tiles.idx", "rb");
    char magic[4];
    uint32_t n = 0;
    if (!f || fread(magic, 1, 4, f) != 4 || memcmp(magic, "TIDX", 4) != 0 || fread(&n, 4, 1, f) != 1) {
        if (f) fclose(f);
        ESP_LOGW(TAG, "no tiles on the card");
        return false;
    }
    entries = heap_caps_malloc(n * sizeof(tile_entry_t), MALLOC_CAP_SPIRAM);
    if (!entries || fread(entries, sizeof(tile_entry_t), n, f) != n) {
        heap_caps_free(entries);
        entries = NULL;
        fclose(f);
        return false;
    }
    fclose(f);
    entry_count = n;
    bin = fopen(PLAYER_DIR "/tiles.bin", "rb");
    ESP_LOGI(TAG, "%lu tiles on the card", (unsigned long)n);
    return bin != NULL;
}

bool mapview_has_tiles(void)
{
    return open_tiles();
}

static int compare(uint16_t z, uint16_t x, uint16_t y, const tile_entry_t *e)
{
    if (z != e->z) return z < e->z ? -1 : 1;
    if (x != e->x) return x < e->x ? -1 : 1;
    if (y != e->y) return y < e->y ? -1 : 1;
    return 0;
}

static const tile_entry_t *find(int z, int x, int y)
{
    uint32_t lo = 0, hi = entry_count;
    while (lo < hi) {
        uint32_t mid = (lo + hi) / 2;
        int c = compare(z, x, y, &entries[mid]);
        if (c == 0) return &entries[mid];
        if (c < 0) hi = mid;
        else lo = mid + 1;
    }
    return NULL;
}

/* --- Decoded tiles, the last dozen kept ------------------------------------------ */

typedef struct {
    int z, x, y; /* z −1: empty */
    uint32_t used;
    lv_image_dsc_t dsc;
    uint8_t *pixels;
} slot_t;

static slot_t cache[CACHE];
static uint32_t clock_;

static bool decode(const tile_entry_t *e, slot_t *s)
{
    static uint8_t *jpeg;
    static size_t jpeg_cap;
    if (e->len > jpeg_cap) {
        heap_caps_free(jpeg);
        jpeg_cap = e->len + 4096;
        jpeg = heap_caps_malloc(jpeg_cap, MALLOC_CAP_SPIRAM);
        if (!jpeg) {
            jpeg_cap = 0;
            return false;
        }
    }
    if (fseek(bin, (long)e->off, SEEK_SET) != 0 || fread(jpeg, 1, e->len, bin) != e->len) return false;
    if (!s->pixels) s->pixels = jpeg_calloc_align(TILE * TILE * 2, 16);
    if (!s->pixels) return false;

    jpeg_dec_config_t config = {.output_type = JPEG_PIXEL_FORMAT_RGB565_LE, .rotate = JPEG_ROTATE_0D};
    jpeg_dec_handle_t dec = NULL;
    if (jpeg_dec_open(&config, &dec) != JPEG_ERR_OK) return false;
    jpeg_dec_io_t io = {.inbuf = jpeg, .inbuf_len = (int)e->len};
    jpeg_dec_header_info_t info;
    bool ok = jpeg_dec_parse_header(dec, &io, &info) == JPEG_ERR_OK && info.width == TILE && info.height == TILE;
    if (ok) {
        io.outbuf = s->pixels;
        ok = jpeg_dec_process(dec, &io) == JPEG_ERR_OK;
    }
    jpeg_dec_close(dec);
    if (!ok) return false;
    s->dsc = (lv_image_dsc_t){
        .header = {.magic = LV_IMAGE_HEADER_MAGIC, .cf = LV_COLOR_FORMAT_RGB565, .w = TILE, .h = TILE, .stride = TILE * 2},
        .data_size = TILE * TILE * 2,
        .data = s->pixels,
    };
    lv_image_cache_drop(&s->dsc); /* the slot may have held another tile */
    return true;
}

/** The tile decoded, from the cache or the card; NULL if the card hasn't it. */
static const lv_image_dsc_t *tile(int z, int x, int y)
{
    static bool first = true;
    if (first) {
        for (int i = 0; i < CACHE; i++) cache[i].z = -1;
        first = false;
    }
    slot_t *lru = &cache[0];
    for (int i = 0; i < CACHE; i++) {
        slot_t *s = &cache[i];
        if (s->z == z && s->x == x && s->y == y) {
            s->used = ++clock_;
            return &s->dsc;
        }
        if (s->used < lru->used) lru = s;
    }
    const tile_entry_t *e = open_tiles() ? find(z, x, y) : NULL;
    if (!e) return NULL;
    lru->z = -1;
    if (!decode(e, lru)) return NULL;
    lru->z = z, lru->x = x, lru->y = y;
    lru->used = ++clock_;
    return &lru->dsc;
}

/* --- The view ---------------------------------------------------------------------- */

struct mapview {
    lv_obj_t *layer;
    lv_obj_t *images[SHOWN];
    int zoom;
    double cx, cy; /* the centre, in world px at the zoom */
};

static double world_x(double lon, int z)
{
    return (lon + 180.0) / 360.0 * TILE * (double)(1 << z);
}

static double world_y(double lat, int z)
{
    double r = lat * M_PI / 180.0;
    return (1.0 - log(tan(r) + 1.0 / cos(r)) / M_PI) / 2.0 * TILE * (double)(1 << z);
}

static void freed(lv_event_t *e)
{
    lv_free(lv_event_get_user_data(e));
}

mapview_t *mapview_create(lv_obj_t *parent)
{
    mapview_t *m = lv_malloc(sizeof(mapview_t));
    lv_memzero(m, sizeof(*m));
    m->layer = box(parent, 0, 0, SCREEN_W, SCREEN_H);
    lv_obj_set_style_bg_color(m->layer, C_PAPER, 0);
    lv_obj_set_style_bg_opa(m->layer, LV_OPA_COVER, 0);
    for (int i = 0; i < SHOWN; i++) {
        m->images[i] = lv_image_create(m->layer);
        lv_obj_add_flag(m->images[i], LV_OBJ_FLAG_HIDDEN);
    }
    lv_obj_add_event_cb(m->layer, freed, LV_EVENT_DELETE, m);
    return m;
}

void mapview_set(mapview_t *m, double lat, double lon, int zoom)
{
    m->zoom = zoom;
    m->cx = world_x(lon, zoom), m->cy = world_y(lat, zoom);
    int tx0 = (int)floor((m->cx - SCREEN_W / 2.0) / TILE), ty0 = (int)floor((m->cy - SCREEN_H / 2.0) / TILE);
    int k = 0;
    for (int ty = ty0; ty <= ty0 + 2; ty++) {
        for (int tx = tx0; tx <= tx0 + 2; tx++) {
            int sx = (int)lround(tx * TILE - m->cx + SCREEN_W / 2.0), sy = (int)lround(ty * TILE - m->cy + SCREEN_H / 2.0);
            if (sx >= SCREEN_W || sy >= SCREEN_H || sx + TILE <= 0 || sy + TILE <= 0) continue;
            const lv_image_dsc_t *d = tile(zoom, tx, ty);
            if (!d || k >= SHOWN) continue;
            lv_image_set_src(m->images[k], d);
            lv_obj_set_pos(m->images[k], sx, sy);
            lv_obj_remove_flag(m->images[k], LV_OBJ_FLAG_HIDDEN);
            k++;
        }
    }
    for (; k < SHOWN; k++) lv_obj_add_flag(m->images[k], LV_OBJ_FLAG_HIDDEN);
}

void mapview_project(const mapview_t *m, double lat, double lon, float *x, float *y)
{
    *x = (float)(world_x(lon, m->zoom) - m->cx + SCREEN_W / 2.0);
    *y = (float)(world_y(lat, m->zoom) - m->cy + SCREEN_H / 2.0);
}

float mapview_metres_per_px(const mapview_t *m)
{
    double lat = atan(sinh(M_PI * (1.0 - 2.0 * m->cy / (TILE * (double)(1 << m->zoom)))));
    return (float)(156543.03392 * cos(lat) / (double)(1 << m->zoom));
}
