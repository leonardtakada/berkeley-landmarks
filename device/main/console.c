#include "console.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "bsp/esp-bsp.h"
#include "driver/uart.h"
#include "driver/usb_serial_jtag.h"
#include "driver/usb_serial_jtag_vfs.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include <sys/stat.h>
#include "audio/player.h"
#include "audio/sound.h"
#include "board.h"
#include "buttons.h"
#include "gnss/gnss.h"
#include "heading/imu.h"
#include "hw.h"
#include "mbedtls/base64.h"
#include "power/pmu.h"
#include "storage/card.h"
#include "ui.h"
#include "walk.h"
#include "position.h"

#define LOCK_FOREVER ((uint32_t)-1)

/* 768 bytes of picture make a 1024-character line. */
#define SNAP_CHUNK 768

/* A swipe left starts on the right, and the other way about. */
#define SWIPE_FROM(dir) ((dir) < 0 ? 330 : 136)

static volatile uint32_t frames;

/* A second pointer, beside the touch panel, that the console moves. */
static struct {
    int32_t x, y;
    bool down;
} finger;

static void finger_read(lv_indev_t *indev, lv_indev_data_t *data)
{
    LV_UNUSED(indev);
    data->point.x = finger.x;
    data->point.y = finger.y;
    data->state = finger.down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

/** Moves the finger in `steps` from where it is to (x, y), over `ms`. */
static void finger_glide(int32_t x, int32_t y, int steps, uint32_t ms)
{
    int32_t x0 = finger.x, y0 = finger.y;
    for (int i = 1; i <= steps; i++) {
        finger.x = x0 + (x - x0) * i / steps;
        finger.y = y0 + (y - y0) * i / steps;
        vTaskDelay(pdMS_TO_TICKS(ms / steps));
    }
}

static void tap(int32_t x, int32_t y)
{
    finger.x = x, finger.y = y;
    finger.down = true;
    vTaskDelay(pdMS_TO_TICKS(120));
    finger.down = false;
    vTaskDelay(pdMS_TO_TICKS(120));
}

static void swipe(int dir, uint32_t ms)
{
    finger.x = SWIPE_FROM(dir), finger.y = 233;
    finger.down = true;
    vTaskDelay(pdMS_TO_TICKS(60));
    /* Steps finer than LVGL reads the panel (every 15 ms), as a real finger moves. */
    finger_glide(SWIPE_FROM(-dir), 233, ms / 10, ms);
    finger.down = false;
    vTaskDelay(pdMS_TO_TICKS(120));
}

static void frame_drawn(lv_event_t *e)
{
    LV_UNUSED(e);
    frames++;
}

/**
 * Straight to the USB driver, waiting for room. stdout drops what it can't
 * send within 50 ms, and a picture missing a line is no use.
 */
static void out(const void *data, size_t len)
{
    const uint8_t *p = data;
    while (len) {
        int n = usb_serial_jtag_write_bytes(p, len, portMAX_DELAY);
        if (n <= 0) continue;
        p += n;
        len -= n;
    }
}

static void out_line(const unsigned char *s, size_t len)
{
    out(s, len);
    out("\n", 1);
}

static void snap(void)
{
    bsp_display_lock(LOCK_FOREVER);
    lv_draw_buf_t *buf = lv_snapshot_take(lv_screen_active(), LV_COLOR_FORMAT_RGB565);
    bsp_display_unlock();
    if (!buf) {
        printf("SNAP-ERR no memory\n");
        return;
    }

    /* Quiet the logs so nothing lands in the middle of the picture. */
    esp_log_level_set("*", ESP_LOG_NONE);
    fflush(stdout);
    uint32_t w = buf->header.w, h = buf->header.h, stride = buf->header.stride;
    static unsigned char line[SNAP_CHUNK * 4 / 3 + 4];
    size_t out_len = snprintf((char *)line, sizeof line, "SNAP %u %u", (unsigned)w, (unsigned)h);
    out_line(line, out_len);
    static uint8_t chunk[SNAP_CHUNK];
    size_t filled = 0;
    for (uint32_t y = 0; y < h; y++) {
        const uint8_t *row = buf->data + y * stride;
        for (uint32_t x = 0; x < w * 2; x++) {
            chunk[filled++] = row[x];
            if (filled == SNAP_CHUNK) {
                mbedtls_base64_encode(line, sizeof line, &out_len, chunk, filled);
                out_line(line, out_len);
                filled = 0;
            }
        }
    }
    if (filled) {
        mbedtls_base64_encode(line, sizeof line, &out_len, chunk, filled);
        out_line(line, out_len);
    }
    out_line((const unsigned char *)"SNAP-END", 8);
    esp_log_level_set("*", ESP_LOG_INFO);
    lv_draw_buf_destroy(buf);
}

/** Times whole-screen redraws of whatever is showing, animations held still. */
static void bench(void)
{
    const int runs = 8;
    bsp_display_lock(LOCK_FOREVER);
    lv_obj_t *scr = lv_screen_active();
    int64_t t0 = esp_timer_get_time();
    for (int i = 0; i < runs; i++) {
        lv_obj_invalidate(scr);
        lv_refr_now(NULL);
    }
    int64_t us = (esp_timer_get_time() - t0) / runs;
    bsp_display_unlock();
    printf("BENCH full_redraw_ms=%.1f\n", us / 1000.0);
}

static const char *kind(const lv_obj_t *o)
{
    if (lv_obj_check_type(o, &lv_image_class)) return "image";
    if (lv_obj_check_type(o, &lv_label_class)) return "label";
    if (lv_obj_check_type(o, &lv_arclabel_class)) return "arclabel";
    return lv_obj_get_child_count(o) ? "box" : "obj";
}

/** The screen's top-level parts, numbered for `hide`. */
static void tree(void)
{
    bsp_display_lock(LOCK_FOREVER);
    lv_obj_t *scr = lv_screen_active();
    for (uint32_t i = 0; i < lv_obj_get_child_count(scr); i++) {
        lv_obj_t *c = lv_obj_get_child(scr, i);
        lv_area_t a;
        lv_obj_get_coords(c, &a);
        printf("  %2u %-8s %4d,%-4d %3dx%-3d %s\n", (unsigned)i, kind(c),
               (int)a.x1, (int)a.y1, (int)lv_area_get_width(&a), (int)lv_area_get_height(&a),
               lv_obj_has_flag(c, LV_OBJ_FLAG_HIDDEN) ? "hidden" : "");
    }
    bsp_display_unlock();
    printf("OK\n");
}

/* Phase 1, the hardware check. */

static const char *who(uint8_t a)
{
    switch (a) {
    case 0x18: return "codec";
    case 0x20: return "expander";
    case 0x34: return "power";
    case 0x40: return "mics";
    case 0x50: case 0x54: return "gnss";
    case 0x51: return "clock";
    case 0x5A: return "touch";
    case 0x6B: return "motion";
    default: return "?";
    }
}

static void i2c_scan(void)
{
    uint8_t found[32];
    board_bus_lock();
    int n = board_i2c_scan(found, 32);
    board_bus_unlock();
    printf("OK %d:", n);
    for (int i = 0; i < n; i++) printf(" 0x%02X=%s", found[i], who(found[i]));
    printf("\n");
}

/** Reads (or, given a value, writes) one register of a device on the bus: `reg 0x20 0x03 [0x7F]`. */
static void reg(const char *arg)
{
    unsigned addr = 0, r = 0, v = 0;
    int n = sscanf(arg, "%x %x %x", &addr, &r, &v);
    if (n < 2) {
        printf("ERR reg <addr> <reg> [value]\n");
        return;
    }
    i2c_master_dev_handle_t dev = board_i2c_device(addr, 100000);
    if (!dev) {
        printf("ERR no bus\n");
        return;
    }
    uint8_t b = 0;
    board_bus_lock();
    esp_err_t err = n == 3 ? board_reg_write(dev, r, v) : board_reg_read(dev, r, &b, 1);
    board_bus_unlock();
    i2c_master_bus_rm_device(dev);
    if (err != ESP_OK) printf("ERR %s\n", esp_err_to_name(err));
    else if (n == 3) printf("OK wrote 0x%02X\n", v);
    else printf("OK 0x%02X\n", b);
}

/** Raw bus traffic, in hex: `i2cw 50 08 00 51 AA` writes bytes; `i2cr 54 4` reads n. */
static void raw_i2c(bool write, const char *arg)
{
    unsigned addr = 0;
    int used = 0;
    if (sscanf(arg, "%x%n", &addr, &used) != 1) {
        printf("ERR i2cw <addr> <bytes…> | i2cr <addr> <n>\n");
        return;
    }
    i2c_master_dev_handle_t dev = board_i2c_device(addr, 100000);
    if (!dev) {
        printf("ERR no bus\n");
        return;
    }
    uint8_t buf[64];
    int n = 0;
    esp_err_t err;
    if (write) {
        const char *p = arg + used;
        unsigned v;
        int k;
        while (n < (int)sizeof buf && sscanf(p, "%x%n", &v, &k) == 1) {
            buf[n++] = v;
            p += k;
        }
        board_bus_lock();
        err = i2c_master_transmit(dev, buf, n, 200);
        board_bus_unlock();
    } else {
        n = LV_CLAMP(1, atoi(arg + used), (int)sizeof buf);
        board_bus_lock();
        err = i2c_master_receive(dev, buf, n, 200);
        board_bus_unlock();
    }
    i2c_master_bus_rm_device(dev);
    if (err != ESP_OK) {
        printf("ERR %s\n", esp_err_to_name(err));
        return;
    }
    printf("OK");
    if (!write) for (int i = 0; i < n; i++) printf(" %02X", buf[i]);
    printf("\n");
}

/** Listens on a pin as a UART for a few seconds and prints what comes: `uart 18 115200 3`. */
static void listen_uart(const char *arg)
{
    int rx = 18, baud = 115200, secs = 3;
    sscanf(arg, "%d %d %d", &rx, &baud, &secs);
    uart_config_t cfg = {.baud_rate = baud, .data_bits = UART_DATA_8_BITS, .parity = UART_PARITY_DISABLE,
                         .stop_bits = UART_STOP_BITS_1, .flow_ctrl = UART_HW_FLOWCTRL_DISABLE, .source_clk = UART_SCLK_DEFAULT};
    if (uart_driver_install(UART_NUM_1, 2048, 0, 0, NULL, 0) != ESP_OK) {
        printf("ERR uart busy\n");
        return;
    }
    uart_param_config(UART_NUM_1, &cfg);
    uart_set_pin(UART_NUM_1, UART_PIN_NO_CHANGE, rx, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    static uint8_t buf[512];
    int total = 0;
    int64_t until = esp_timer_get_time() + secs * 1000000LL;
    while (esp_timer_get_time() < until) {
        int n = uart_read_bytes(UART_NUM_1, buf, sizeof buf - 1, pdMS_TO_TICKS(100));
        if (n > 0) {
            total += n;
            for (int i = 0; i < n; i++) if (buf[i] != '\r' && (buf[i] < 0x20 || buf[i] > 0x7E) && buf[i] != '\n') buf[i] = '.';
            buf[n] = 0;
            printf("%s", (char *)buf);
        }
    }
    uart_driver_delete(UART_NUM_1);
    printf("\nOK %d bytes on GPIO%d at %d\n", total, rx, baud);
}

/**
 * Asks the module once how much it holds and times every try at the answer,
 * `every_ms` apart, for two seconds. `order` 1 reads four bytes from the
 * request address first; 2 reads them just after asking.
 */
static void gnss_probe(int every_ms, int order)
{
    i2c_master_dev_handle_t w = board_i2c_device_slow(0x50, 100000, 300000), r = board_i2c_device_slow(0x54, 100000, 300000);
    static const uint8_t ask[] = {0x08, 0x00, 0x51, 0xAA, 0x04, 0x00, 0x00, 0x00};
    board_bus_lock();
    uint8_t pre[4] = {0};
    if (order == 1) printf("  read 0x50 first: %s\n", esp_err_to_name(i2c_master_receive(w, pre, 4, 100)));
    esp_err_t err = i2c_master_transmit(w, ask, sizeof ask, 100);
    if (order == 2) printf("  read 0x50 after: %s %02X %02X %02X %02X\n", esp_err_to_name(i2c_master_receive(w, pre, 4, 100)), pre[0], pre[1], pre[2], pre[3]);
    int64_t t0 = esp_timer_get_time();
    printf("  ask: %s\n", esp_err_to_name(err));
    int tries = 0, got = 0;
    while (esp_timer_get_time() - t0 < 2000000) {
        uint8_t n[4];
        tries++;
        if (i2c_master_receive(r, n, 4, 500) == ESP_OK) {
            got++;
            printf("  %4lld ms: %02X %02X %02X %02X\n", (long long)(esp_timer_get_time() - t0) / 1000, n[0], n[1], n[2], n[3]);
        }
        vTaskDelay(pdMS_TO_TICKS(every_ms));
    }
    board_bus_unlock();
    i2c_master_bus_rm_device(w);
    i2c_master_bus_rm_device(r);
    printf("OK %d answers in %d tries\n", got, tries);
}

static void print_gnss(void)
{
    gnss_state_t g = gnss_state();
    int64_t now = esp_timer_get_time() / 1000;
    printf("OK gnss ok=%d fix=%d q=%d used=%d view=%d hdop=%.1f lat=%.6f lon=%.6f alt=%.0f utc=%s date=%s "
           "bytes=%u sentences=%u bad=%u first_fix_ms=%lld response_age_ms=%lld sentence_age_ms=%lld position_age_ms=%lld\n",
           g.ok, g.fix, g.quality, g.sats_used, g.sats_in_view, g.hdop, g.lat, g.lon, g.alt_m, g.utc, g.date,
           (unsigned)g.bytes, (unsigned)g.sentences, (unsigned)g.bad, (long long)g.first_fix_ms,
           (long long)(g.last_response_ms < 0 ? -1 : now - g.last_response_ms),
           (long long)(g.last_sentence_ms < 0 ? -1 : now - g.last_sentence_ms),
           (long long)(g.last_position_ms < 0 ? -1 : now - g.last_position_ms));
}

static void print_gnss_log(void)
{
    const char *which[] = {"first", "last"};
    for (int i = 0; i < 2; i++) {
        gnss_record_t r;
        if (gnss_record(which[i], &r))
            printf("  %s: %.6f, %.6f  hdop %.1f  %d of %d  %s %s  after %lld s\n", which[i], r.lat, r.lon, r.hdop,
                   r.sats_used, r.sats_in_view, r.date, r.utc, (long long)(r.after_ms / 1000));
        else
            printf("  %s: none\n", which[i]);
    }
    printf("OK\n");
}

static void print_imu(void)
{
    imu_state_t m = imu_state();
    printf("OK imu ok=%d a=%.2f,%.2f,%.2f g  gyro=%.1f,%.1f,%.1f dps  tilt=%.0f  temp=%.1f\n", m.ok, m.ax, m.ay, m.az,
           m.gx, m.gy, m.gz, imu_tilt(&m), m.temp_c);
}

static void print_pmu(void)
{
    pmu_state_t p = pmu_state();
    printf("OK pmu ok=%d usb=%d usb_mv=%u battery=%d battery_mv=%u percent=%d charging=%d system_mv=%u temp=%.1f\n",
           p.ok, p.usb, p.usb_mv, p.battery, p.battery_mv, p.percent, p.charging, p.system_mv, p.temp_c);
}

/* The card is checked on its own task (hw.c): the first look at a big card is slow. */
static void print_card(void)
{
    card_state_t c = card_state();
    printf("OK card mounted=%d rw=%d name=%s size_mb=%llu free_mb=%llu error=%s\n", c.mounted, c.read_write_ok, c.name,
           (unsigned long long)c.size_mb, (unsigned long long)c.free_mb, c.error[0] ? c.error : "-");
}

static void stats(void)
{
    uint32_t f0 = frames;
    vTaskDelay(pdMS_TO_TICKS(2000));
    uint32_t f1 = frames;
    bsp_display_lock(LOCK_FOREVER);
    uint32_t idle = lv_timer_get_idle();
    bsp_display_unlock();
    printf("STATS fps=%u idle=%u%% free_internal=%u free_psram=%u\n", (unsigned)((f1 - f0) / 2), (unsigned)idle,
           (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL), (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
}

/* --- Files onto the card: the narration (scripts/device/load-narration.py) ---- */

static uint32_t crc32(uint32_t crc, const uint8_t *p, size_t n)
{
    crc = ~crc;
    while (n--) {
        crc ^= *p++;
        for (int k = 0; k < 8; k++) crc = (crc >> 1) ^ (0xEDB88320u & -(crc & 1));
    }
    return ~crc;
}

/** A plain file name in the guide's folder: letters, digits and dots, nothing that climbs out. */
static bool guide_path(const char *name, char *path, size_t len)
{
    if (!name || !*name || strlen(name) > 16 || strspn(name, "abcdefghijklmnopqrstuvwxyz0123456789.") != strlen(name)) {
        printf("ERR bad name\n");
        return false;
    }
    if (!card_state().mounted) {
        printf("ERR no card\n");
        return false;
    }
    mkdir(PLAYER_DIR, 0777);
    snprintf(path, len, PLAYER_DIR "/%s", name);
    return true;
}

/** stat <name>: its size and CRC-32 (as zlib reckons it), or ERR none. */
static void stat_file(const char *name)
{
    char path[48];
    if (!guide_path(name, path, sizeof path)) return;
    FILE *f = fopen(path, "rb");
    if (!f) {
        printf("ERR none\n");
        return;
    }
    static uint8_t buf[4096];
    uint32_t crc = 0;
    size_t n, size = 0;
    while ((n = fread(buf, 1, sizeof buf, f)) > 0) crc = crc32(crc, buf, n), size += n;
    fclose(f);
    printf("OK %u %08lx\n", (unsigned)size, (unsigned long)crc);
}

/**
 * put <name> <size>: answers READY, then takes exactly <size> raw bytes in
 * chunks of PUT_CHUNK, answering "+" when each is on the card (the USB
 * receive buffer drops what it can't hold, so the sender waits for each "+");
 * at the end answers OK <size> <crc>. Gives up after five quiet seconds.
 */
#define PUT_CHUNK 8192

static void put_file(char *arg)
{
    char *sp = arg ? strchr(arg, ' ') : NULL;
    if (!sp) {
        printf("ERR put <name> <size>\n");
        return;
    }
    *sp = '\0';
    long size = atol(sp + 1);
    char path[48];
    if (size <= 0 || !guide_path(arg, path, sizeof path)) {
        if (size <= 0) printf("ERR bad size\n");
        return;
    }
    FILE *f = fopen(path, "wb");
    if (!f) {
        printf("ERR can't write %s\n", path);
        return;
    }
    printf("READY\n");
    fflush(stdout);
    static uint8_t buf[PUT_CHUNK];
    uint32_t crc = 0;
    long left = size;
    while (left > 0) {
        int want = left < PUT_CHUNK ? (int)left : PUT_CHUNK, have = 0;
        while (have < want) {
            int got = usb_serial_jtag_read_bytes(buf + have, want - have, pdMS_TO_TICKS(5000));
            if (got <= 0) break;
            have += got;
        }
        if (have < want) break;
        if (fwrite(buf, 1, want, f) != (size_t)want) {
            left = -1;
            break;
        }
        crc = crc32(crc, buf, want);
        left -= want;
        printf("+\n");
        fflush(stdout);
    }
    fclose(f);
    if (left != 0) {
        remove(path);
        printf(left < 0 ? "ERR write failed\n" : "ERR timed out with %ld to go\n", left);
        return;
    }
    if (strcmp(arg, "parts.txt") == 0) {
        bsp_display_lock(LOCK_FOREVER);
        player_forget_index();
        bsp_display_unlock();
    }
    printf("OK %ld %08lx\n", size, (unsigned long)crc);
}

static void run(char *cmd)
{
    char *arg = strchr(cmd, ' ');
    if (arg) *arg++ = '\0';

    if (strcmp(cmd, "snap") == 0) {
        snap();
    } else if (strcmp(cmd, "show") == 0 && arg) {
        bsp_display_lock(LOCK_FOREVER);
        bool ok = ui_show_named(arg);
        bsp_display_unlock();
        printf(ok ? "OK\n" : "ERR no screen %s\n", arg);
    } else if (strcmp(cmd, "walk") == 0 && arg) {
        int n = atoi(arg);
        if (n < 1 || n > 12) {
            printf("ERR walks are 1-12\n");
            return;
        }
        /* Sets out on walk n, as Start would. */
        bsp_display_lock(LOCK_FOREVER);
        ui_walk = n - 1;
        ui_start_walk(0);
        bsp_display_unlock();
        printf("OK\n");
    } else if (strcmp(cmd, "stats") == 0) {
        stats();
    } else if (strcmp(cmd, "bench") == 0) {
        bench();
    } else if (strcmp(cmd, "tree") == 0) {
        tree();
    } else if (strcmp(cmd, "i2c") == 0) {
        i2c_scan();
    } else if (strcmp(cmd, "reg") == 0 && arg) {
        reg(arg);
    } else if (strcmp(cmd, "uart") == 0) {
        listen_uart(arg ? arg : "");
    } else if ((strcmp(cmd, "i2cw") == 0 || strcmp(cmd, "i2cr") == 0) && arg) {
        raw_i2c(cmd[3] == 'w', arg);
    } else if (strcmp(cmd, "gps") == 0) {
        if (arg && strcmp(arg, "log") == 0) print_gnss_log();
        else if (arg && (strcmp(arg, "pause") == 0 || strcmp(arg, "resume") == 0)) {
            gnss_pause(arg[0] == 'p');
            printf("OK\n");
        } else if (arg && strncmp(arg, "manual", 6) == 0) {
            gnss_set_manual(strstr(arg, "on") != NULL);
            printf("OK\n");
        } else if (arg && strncmp(arg, "send ", 5) == 0) {
            printf(gnss_send(arg + 5) ? "OK\n" : "ERR refused\n");
        } else if (arg && strcmp(arg, "unstick") == 0) {
            gnss_unstick();
            printf("OK\n");
        } else if (arg && strcmp(arg, "read") == 0) {
            static char text[513];
            int n = gnss_read_once(text, sizeof text);
            if (n > 0) printf("%s\nOK read %d\n", text, n);
            else printf("OK read %d\n", n);
        } else if (arg && strncmp(arg, "probe", 5) == 0) {
            int every = 5, order = 0;
            sscanf(arg + 5, "%d %d", &every, &order);
            gnss_probe(LV_MAX(1, every), order);
        }
        else if (arg && strncmp(arg, "raw", 3) == 0) {
            gnss_echo(strstr(arg, "on") != NULL);
            printf("OK\n");
        } else print_gnss();
    } else if (strcmp(cmd, "imu") == 0) {
        print_imu();
    } else if (strcmp(cmd, "pmu") == 0) {
        print_pmu();
    } else if (strcmp(cmd, "sd") == 0) {
        if (arg && strcmp(arg, "check") == 0) {
            hw_check_card();
            printf("OK checking\n");
        } else {
            print_card();
        }
    } else if (strcmp(cmd, "here") == 0) {
        /* here <lat> <lon>: pretend you're there; here walk / here stand: it walks itself along the
         * walk's route (or to the free map's pick) at walking pace, or stands; here off: the sky. */
        double lat, lon;
        if (arg && strcmp(arg, "off") == 0) position_pretend_off();
        else if (arg && strcmp(arg, "walk") == 0) position_pretend_walking(true);
        else if (arg && strcmp(arg, "stand") == 0) position_pretend_walking(false);
        else if (arg && sscanf(arg, "%lf %lf", &lat, &lon) == 2) position_pretend(lat, lon);
        position_t p = position_now();
        printf("OK here known=%d pretend=%d walking=%d lat=%.6f lon=%.6f\n", p.known, p.pretend, position_walks_itself(),
               p.lat, p.lon);
    } else if (strcmp(cmd, "stat") == 0) {
        stat_file(arg);
    } else if (strcmp(cmd, "put") == 0) {
        put_file(arg);
    } else if (strcmp(cmd, "play") == 0 && arg) {
        /* play <part> [ms]: straight from the card, as a narration screen would. */
        char *ms = strchr(arg, ' ');
        if (ms) *ms++ = '\0';
        bsp_display_lock(LOCK_FOREVER);
        bool ok = player_play(arg, ms ? (uint32_t)atol(ms) : 0);
        bsp_display_unlock();
        printf(ok ? "OK\n" : "ERR no %s on the card\n", arg);
    } else if (strcmp(cmd, "player") == 0) {
        if (arg && strcmp(arg, "stop") == 0) player_stop();
        if (arg && strcmp(arg, "pause") == 0) player_pause(true);
        if (arg && strcmp(arg, "resume") == 0) player_pause(false);
        player_state_t p = player_state();
        printf("OK player active=%d playing=%d done=%d at_ms=%lu length_ms=%lu\n", p.active, p.playing, p.done,
               (unsigned long)p.at_ms, (unsigned long)p.length_ms);
    } else if (strcmp(cmd, "chime") == 0) {
        int vol = arg ? atoi(arg) : 70;
        printf(sound_chime_async(vol) ? "OK\n" : "ERR busy\n");
    } else if (strcmp(cmd, "tone") == 0 && arg) {
        int hz = 880, ms = 500;
        sscanf(arg, "%d %d", &hz, &ms);
        sound_tone(hz, ms, 70);
        printf("OK\n");
    } else if (strcmp(cmd, "hide") == 0 && arg) {
        bsp_display_lock(LOCK_FOREVER);
        lv_obj_t *c = lv_obj_get_child(lv_screen_active(), atoi(arg));
        if (c) {
            if (lv_obj_has_flag(c, LV_OBJ_FLAG_HIDDEN)) lv_obj_remove_flag(c, LV_OBJ_FLAG_HIDDEN);
            else lv_obj_add_flag(c, LV_OBJ_FLAG_HIDDEN);
        }
        bsp_display_unlock();
        printf(c ? "OK\n" : "ERR no part %s\n", arg);
    } else if (strcmp(cmd, "tap") == 0 && arg) {
        int x, y;
        if (sscanf(arg, "%d %d", &x, &y) != 2) {
            printf("ERR tap <x> <y>\n");
            return;
        }
        tap(x, y);
        printf("OK\n");
    } else if (strcmp(cmd, "swipe") == 0 && arg) {
        char dir[8];
        int ms = 300;
        if (sscanf(arg, "%7s %d", dir, &ms) < 1 || (strcmp(dir, "left") && strcmp(dir, "right")) || ms < 50) {
            printf("ERR swipe left|right [ms]\n");
            return;
        }
        swipe(strcmp(dir, "left") == 0 ? -1 : 1, ms);
        printf("OK\n");
    } else if (strcmp(cmd, "buttons") == 0) {
        buttons_print();
    } else if (strcmp(cmd, "touches") == 0) {
        bsp_display_lock(LOCK_FOREVER);
        ui_print_touches();
        bsp_display_unlock();
    } else if (strcmp(cmd, "button") == 0 && arg) {
        /* As if a side button were pressed: upper or lower. */
        if (strcmp(arg, "upper") != 0 && strcmp(arg, "lower") != 0) {
            printf("ERR button upper|lower\n");
            return;
        }
        button_t b = strcmp(arg, "upper") == 0 ? BTN_UPPER : BTN_LOWER;
        bsp_display_lock(LOCK_FOREVER);
        ui_button(b);
        bsp_display_unlock();
        printf("OK\n");
    } else if (strcmp(cmd, "stop") == 0 && arg) {
        bsp_display_lock(LOCK_FOREVER);
        walk_to(atoi(arg) - 1);
        ui_show(SCR_FOLLOW);
        bsp_display_unlock();
        printf("OK\n");
    } else if (strcmp(cmd, "where") == 0) {
        bsp_display_lock(LOCK_FOREVER);
        walk_nav_t n = walk_nav();
        printf("OK %s walk=%d stop=%d%s collected=%d here=%d located=%d sure=%d moving=%d route=%d left=%dm way=%.0f turn=%.0f\n",
               ui_current_name(), ui_walk + 1, walk_at() + 1, walk_in_intro() ? " (intro)" : "", walk_collected_count(),
               n.here, n.located, n.sure, n.moving, n.on_route, n.metres, n.way, n.turn);
        bsp_display_unlock();
    } else if (cmd[0]) {
        printf("ERR unknown: %s\n", cmd);
    }
}

static void console_task(void *arg)
{
    LV_UNUSED(arg);
    char line[64];
    size_t len = 0;
    for (;;) {
        char c;
        if (usb_serial_jtag_read_bytes(&c, 1, portMAX_DELAY) != 1) continue;
        if (c == '\r' || c == '\n') {
            line[len] = '\0';
            if (len) run(line);
            fflush(stdout);
            len = 0;
        } else if (len < sizeof line - 1) {
            line[len++] = c;
        }
    }
}

void console_start(void)
{
    usb_serial_jtag_driver_config_t cfg = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
    cfg.tx_buffer_size = 4096;
    cfg.rx_buffer_size = 16384; /* the narration comes in this way (put), a chunk at a time */
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&cfg));
    usb_serial_jtag_vfs_use_driver();

    bsp_display_lock(LOCK_FOREVER);
    lv_display_add_event_cb(lv_display_get_default(), frame_drawn, LV_EVENT_REFR_READY, NULL);
    lv_indev_t *pointer = lv_indev_create();
    lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(pointer, finger_read);
    bsp_display_unlock();

    xTaskCreate(console_task, "console", 6144, NULL, 3, NULL);
}
