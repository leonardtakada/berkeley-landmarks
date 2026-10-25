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

/* --- The drawing, and its tiles on the card ----------------------------------------- */

typedef struct {
    uint16_t z, x, y, pad;
    uint32_t off, len;
} tile_entry_t;

typedef struct {
    float scale; /* px to a metre of the drawing */
    uint16_t cols, rows;
} zoom_t;

/* lib/iso.ts and scripts/device/pack-iso.ts, as iso.idx gives them; these until it's read. */
static struct {
    double lat0, lon0, m_lat, m_lon; /* the origin, and metres to a degree */
    double x0, y0;                   /* the drawing's top-left, metres of the drawing */
    uint32_t zooms;
    zoom_t zoom[MAPVIEW_ZOOM_MAX + 1];
    float u0, v0, cell, level_m, shore; /* the terraces' grid (lib/iso-map.ts) */
    uint16_t cols, rows;
    int8_t *levels; /* NULL: all at sea level */
} d = {
    .lat0 = 37.87, .lon0 = -122.27, .m_lat = 110950, .m_lon = 87890.4,
    .zooms = 4, .zoom = {{0.1875f}, {0.375f}, {0.75f}, {1.5f}},
};

static tile_entry_t *entries;
static uint32_t entry_count;
static FILE *bin;
static bool looked; /* tried the card once it was mounted */

static bool read_index(FILE *f)
{
    char magic[4];
    double head[6];
    if (fread(magic, 1, 4, f) != 4 || memcmp(magic, "ISO1", 4) != 0 || fread(head, sizeof head, 1, f) != 1) return false;
    uint32_t zooms;
    if (fread(&zooms, 4, 1, f) != 1 || zooms != MAPVIEW_ZOOM_MAX + 1) return false;
    if (fread(d.zoom, sizeof(zoom_t), zooms, f) != zooms) return false;
    float terraces[5];
    uint16_t size[2];
    if (fread(terraces, sizeof terraces, 1, f) != 1 || fread(size, sizeof size, 1, f) != 1) return false;
    int8_t *levels = heap_caps_malloc((size_t)size[0] * size[1], MALLOC_CAP_SPIRAM);
    uint32_t n = 0;
    if (!levels || fread(levels, size[0], size[1], f) != size[1] || fread(&n, 4, 1, f) != 1) {
        heap_caps_free(levels);
        return false;
    }
    tile_entry_t *e = heap_caps_malloc(n * sizeof(tile_entry_t), MALLOC_CAP_SPIRAM);
    if (!e || fread(e, sizeof(tile_entry_t), n, f) != n) {
        heap_caps_free(levels);
        heap_caps_free(e);
        return false;
    }
    d.lat0 = head[0], d.lon0 = head[1], d.m_lat = head[2], d.m_lon = head[3], d.x0 = head[4], d.y0 = head[5];
    d.zooms = zooms;
    d.u0 = terraces[0], d.v0 = terraces[1], d.cell = terraces[2], d.level_m = terraces[3], d.shore = terraces[4];
    d.cols = size[0], d.rows = size[1];
    d.levels = levels;
    entries = e;
    entry_count = n;
    return true;
}

static bool open_tiles(void)
{
    if (entries) return true;
    if (looked || !card_state().mounted) return false;
    looked = true;
    FILE *f = fopen(PLAYER_DIR "/iso.idx", "rb");
    bool ok = f && read_index(f);
    if (f) fclose(f);
    if (!ok) {
        ESP_LOGW(TAG, "no map on the card");
        return false;
    }
    bin = fopen(PLAYER_DIR "/iso.bin", "rb");
    ESP_LOGI(TAG, "%lu tiles on the card", (unsigned long)entry_count);
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
    double cx, cy; /* the centre, in px of the zoom's tiles */
};

#define COS30 0.86602540378

/** How high the terrace under (u, v) stands, metres of the drawing; the Bay and the shore at 0. */
static double terrace(double u, double v)
{
    if (!d.levels) return 0;
    long c = lround((u - d.u0) / d.cell), r = lround((v - d.v0) / d.cell);
    if (c < 0 || r < 0 || c >= d.cols || r >= d.rows) return 0;
    int level = d.levels[r * d.cols + c];
    double z = level < 0 ? d.shore : level * d.level_m;
    return z > 0 ? z : 0;
}

/** (lat, lon), `above` metres over its terrace, in px of the zoom's tiles. */
static void on_drawing(double lat, double lon, double above, int zoom, double *px, double *py)
{
    double u = (lon - d.lon0) * d.m_lon, v = (lat - d.lat0) * d.m_lat;
    double x = (u - v) * COS30, y = (u + v) * 0.5 + terrace(u, v) + above;
    *px = (x - d.x0) * d.zoom[zoom].scale;
    *py = (d.y0 - y) * d.zoom[zoom].scale;
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

/** Brings in the tiles around the centre. */
static void lay_tiles(mapview_t *m)
{
    int tx0 = (int)floor((m->cx - SCREEN_W / 2.0) / TILE), ty0 = (int)floor((m->cy - SCREEN_H / 2.0) / TILE);
    int k = 0;
    for (int ty = ty0; ty <= ty0 + 2; ty++) {
        for (int tx = tx0; tx <= tx0 + 2; tx++) {
            int sx = (int)lround(tx * TILE - m->cx + SCREEN_W / 2.0), sy = (int)lround(ty * TILE - m->cy + SCREEN_H / 2.0);
            if (sx >= SCREEN_W || sy >= SCREEN_H || sx + TILE <= 0 || sy + TILE <= 0 || tx < 0 || ty < 0) continue;
            const lv_image_dsc_t *t = tile(m->zoom, tx, ty);
            if (!t || k >= SHOWN) continue;
            lv_image_set_src(m->images[k], t);
            lv_obj_set_pos(m->images[k], sx, sy);
            lv_obj_remove_flag(m->images[k], LV_OBJ_FLAG_HIDDEN);
            k++;
        }
    }
    for (; k < SHOWN; k++) lv_obj_add_flag(m->images[k], LV_OBJ_FLAG_HIDDEN);
}

void mapview_set(mapview_t *m, double lat, double lon, int zoom)
{
    open_tiles(); /* for the terraces */
    m->zoom = LV_CLAMP(0, zoom, (int)d.zooms - 1);
    on_drawing(lat, lon, 0, m->zoom, &m->cx, &m->cy);
    lay_tiles(m);
}

void mapview_fit(mapview_t *m, const int32_t *e6, int n, const lv_area_t *box, int max_zoom)
{
    open_tiles();
    int32_t w = lv_area_get_width(box), h = lv_area_get_height(box);
    for (int z = LV_MIN(max_zoom, (int)d.zooms - 1); z >= 0; z--) {
        double x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
        for (int i = 0; i < n; i++) {
            double px, py;
            on_drawing(e6[i * 2] / 1e6, e6[i * 2 + 1] / 1e6, 1, z, &px, &py);
            x0 = fmin(x0, px), y0 = fmin(y0, py), x1 = fmax(x1, px), y1 = fmax(y1, py);
        }
        if ((x1 - x0 <= w && y1 - y0 <= h) || z == 0) {
            /* The points' middle at the box's. */
            m->zoom = z;
            m->cx = (x0 + x1) / 2 - ((box->x1 + box->x2) / 2.0 - SCREEN_W / 2.0);
            m->cy = (y0 + y1) / 2 - ((box->y1 + box->y2) / 2.0 - SCREEN_H / 2.0);
            lay_tiles(m);
            return;
        }
    }
}

void mapview_project(const mapview_t *m, double lat, double lon, float *x, float *y)
{
    double px, py;
    on_drawing(lat, lon, 1, m->zoom, &px, &py);
    *x = (float)(px - m->cx + SCREEN_W / 2.0);
    *y = (float)(py - m->cy + SCREEN_H / 2.0);
}

void mapview_direction(float bearing, float *dx, float *dy)
{
    double b = bearing * M_PI / 180.0, u = sin(b), v = cos(b);
    double x = (u - v) * COS30, y = (u + v) * 0.5, n = hypot(x, y);
    *dx = (float)(x / n);
    *dy = (float)(-y / n);
}
