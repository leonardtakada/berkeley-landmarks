#include "gnss.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "board.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"
#include "nvs.h"

/*
 * The module takes requests on 0x50 and answers on 0x54, at 100 kHz. What
 * keeps it talking, from Quectel's forum (an LC76GABMD on an ESP32-S3, like
 * this board): a separate I2C frame for every step, 10 ms before each, room
 * for it to hold the clock (it stretches up to ~200 ms, and the S3 gives up
 * after 2 ms by default: an aborted answer jams it), nothing else on the bus
 * mid-exchange, and its 4 KB buffer drained in 512-byte pieces every cycle.
 * Left unread, its transmitter stops, and only a long power-off restarts it.
 *
 * Ways it stops, all seen here. After any command written to it, and
 * sometimes after the ESP32 restarts mid-exchange, it is left stuck: it
 * answers "nothing waiting" or refuses, until it has settled (up to tens of
 * seconds) and a byte is read at 0x54 and 0x58 with two exchanges straight
 * after. So the reader sends no commands in normal running (the quieter
 * output below is saved in the module), and when it hears nothing for three
 * seconds it tries that recovery every eight until the module speaks.
 *
 * And at its default output the buffer (about 9 KB) fills some
 * four seconds after power-up, and then its transmitter sleeps (it refuses
 * the length request and sends nothing; a write, reset or recovery read
 * doesn't wake it). So the reader starts before the display (main.c), and if
 * it hears the full output (a factory-fresh module) it cuts it to what the
 * guide uses (below) and saves that in the module, after which the buffer
 * holds over a minute unread.
 */
#define ADDR_W 0x50
#define ADDR_R 0x54
#define ADDR_R2 0x58 /* reading a byte here and at 0x54 ends a stuck answer */
#define BUS_HZ 100000
#define STRETCH_US 300000
#define POLL_MS 200
#define STEP_MS 10
#define ANSWER_MS 500
#define RETRIES 3
#define CHUNK 512
#define MAX_PER_CYCLE 8192
#define KEEP_EVERY_MS 30000
#define BACK_OFF_MS 1000  /* after a refusal, before asking again */
#define BOOT_MS 10000     /* in the first seconds, while its buffer fills, ask more often: */
#define BOOT_BACK_OFF_MS 200
#define SILENT_MS 3000    /* it speaks every second; this long without a word, it's stuck: */
#define RECOVER_EVERY_MS 8000
#define WAKE_AFTER_MS 30000
#define WAKE_EVERY_MS 60000

/*
 * The module's output, cut to what the guide reads ($PAIR062,<type>,<every>
 * fixes): RMC each second, GGA every other (satellites used, HDOP), GSV every
 * thirtieth (satellites in view), GLL, GSA and VTG off. About 110 bytes a
 * second, so its buffer holds some 80 seconds unread: twice a flash.
 * Version 2; version 1 sent GGA each second and GSV every tenth.
 */
#define QUIETER_VERSION 2
static const char *const quieter[] = {"PAIR062,1,0", "PAIR062,2,0", "PAIR062,5,0", "PAIR062,3,30", "PAIR062,0,2"};

static i2c_master_dev_handle_t dev_w, dev_r, dev_r2;
static gnss_state_t state = {
    .first_fix_ms = -1,
    .last_sentence_ms = -1,
    .last_position_ms = -1,
    .last_response_ms = -1,
};
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static volatile bool echo, paused, quiet;
static bool noisy; /* heard a sentence the quieter output turns off */

/* Satellites in view, per constellation (the talker: GP, GL, GA, GB, BD, GQ). */
static struct {
    char talker[3];
    int n;
} in_view[8];

static char line[128];
static size_t line_len;
static int64_t kept_at = -KEEP_EVERY_MS;

/** Publishes a new state for readers on other tasks. Only the GNSS task writes it. */
static void publish(const gnss_state_t *s)
{
    portENTER_CRITICAL(&lock);
    state = *s;
    portEXIT_CRITICAL(&lock);
}

static void answered(void)
{
    gnss_state_t next = state;
    next.ok = true;
    next.last_response_ms = esp_timer_get_time() / 1000;
    publish(&next);
}

void gnss_pause(bool on)
{
    paused = on;
}

void gnss_echo(bool on)
{
    echo = on;
}

/** Reads an answer, asking again a few times if the module refuses. */
static esp_err_t answer(uint8_t *buf, size_t len)
{
    esp_err_t err = ESP_FAIL;
    for (int i = 0; i < RETRIES; i++) {
        vTaskDelay(pdMS_TO_TICKS(STEP_MS));
        err = i2c_master_receive(dev_r, buf, len, ANSWER_MS);
        if (err != ESP_ERR_INVALID_RESPONSE) break;
    }
    return err;
}

static esp_err_t request(const uint8_t *cmd, size_t len)
{
    vTaskDelay(pdMS_TO_TICKS(STEP_MS));
    return i2c_master_transmit(dev_w, cmd, len, ANSWER_MS);
}

/** Ends whatever answer the module might be stuck in. */
static void unstick(void)
{
    uint8_t b;
    vTaskDelay(pdMS_TO_TICKS(STEP_MS));
    i2c_master_receive(dev_r, &b, 1, ANSWER_MS);
    vTaskDelay(pdMS_TO_TICKS(STEP_MS));
    i2c_master_receive(dev_r2, &b, 1, ANSWER_MS);
}

static void complain(const char *step, esp_err_t err)
{
    static int64_t said;
    int64_t now = esp_timer_get_time();
    if (now - said > 10000000) {
        said = now;
        ESP_LOGW("gnss", "no answer %s: %s", step, esp_err_to_name(err));
    }
}

/** How many bytes are waiting, or −1 if the module didn't answer. */
static int32_t waiting(void)
{
    static const uint8_t ask[] = {0x08, 0x00, 0x51, 0xAA, 0x04, 0x00, 0x00, 0x00};
    uint8_t n[4] = {0};
    esp_err_t err = request(ask, sizeof ask);
    if (err != ESP_OK) {
        complain("asking", err);
        return -1;
    }
    err = answer(n, sizeof n);
    if (err != ESP_OK) {
        complain("reading the length", err);
        return -1;
    }
    answered();
    return (int32_t)(n[0] | n[1] << 8 | n[2] << 16 | (uint32_t)n[3] << 24);
}

/**
 * Sends a sentence to the module: asks how much room it has, announces the
 * length (0xAA531000), then writes "$<body>*<checksum>\r\n" to 0x58.
 * The caller holds the bus.
 */
static bool send_locked(const char *body)
{
    char out[96];
    uint8_t sum = 0;
    for (const char *p = body; *p; p++) sum ^= (uint8_t)*p;
    int len = snprintf(out, sizeof out, "$%s*%02X\r\n", body, sum);
    if (len <= 0 || len >= (int)sizeof out) return false;

    static const uint8_t room_ask[] = {0x04, 0x00, 0x51, 0xAA, 0x04, 0x00, 0x00, 0x00};
    for (size_t sent = 0; sent < (size_t)len;) {
        uint8_t room[4] = {0};
        if (request(room_ask, sizeof room_ask) != ESP_OK || answer(room, sizeof room) != ESP_OK) {
            complain("asking for room", ESP_FAIL);
            return false;
        }
        answered();
        uint32_t available = room[0] | room[1] << 8 | room[2] << 16 | (uint32_t)room[3] << 24;
        if (available == 0 || available == UINT32_MAX) return false;
        /* The reported room is the remainder of a circular buffer window.
         * Fill it before sending the rest, otherwise short tails can prevent
         * every later command from fitting. Each piece has its own exchange. */
        size_t part = (size_t)len - sent;
        if (part > available) part = available;
        uint8_t announce[8] = {0x00, 0x10, 0x53, 0xAA, (uint8_t)part, 0x00, 0x00, 0x00};
        if (request(announce, sizeof announce) != ESP_OK) return false;
        vTaskDelay(pdMS_TO_TICKS(STEP_MS));
        esp_err_t err = i2c_master_transmit(dev_r2, (const uint8_t *)out + sent, part, ANSWER_MS);
        if (err != ESP_OK) {
            complain("sending", err);
            return false;
        }
        sent += part;
    }
    return true;
}

bool gnss_send(const char *body)
{
    board_bus_lock();
    bool ok = send_locked(body);
    board_bus_unlock();
    return ok;
}

static bool fetch(uint8_t *buf, uint32_t len)
{
    uint8_t ask[8] = {0x00, 0x20, 0x51, 0xAA, len & 0xFF, len >> 8 & 0xFF, len >> 16 & 0xFF, len >> 24};
    if (request(ask, sizeof ask) != ESP_OK) return false;
    esp_err_t err = answer(buf, len);
    if (err != ESP_OK) complain("reading data", err);
    return err == ESP_OK;
}

/** Splits a sentence at its commas, keeping empty fields. */
static int fields(char *s, char **f, int max)
{
    int n = 0;
    f[n++] = s;
    for (; *s && n < max; s++) {
        if (*s == ',') {
            *s = '\0';
            f[n++] = s + 1;
        }
    }
    return n;
}

/** ddmm.mmmm (or dddmm.mmmm) and a hemisphere, as signed degrees. */
static double degrees(const char *v, const char *hemi)
{
    if (!*v || !*hemi || hemi[1] != '\0') return NAN;
    bool latitude = *hemi == 'N' || *hemi == 'S';
    if (!latitude && *hemi != 'E' && *hemi != 'W') return NAN;
    const char *p = v;
    while (*p >= '0' && *p <= '9') p++;
    if (p - v != (latitude ? 4 : 5)) return NAN;
    if (*p == '.') {
        p++;
        if (*p < '0' || *p > '9') return NAN;
        while (*p >= '0' && *p <= '9') p++;
    }
    if (*p != '\0') return NAN;
    double x = strtod(v, NULL);
    if (!isfinite(x)) return NAN;
    int deg = (int)(x / 100);
    double minutes = x - deg * 100;
    double d = deg + minutes / 60.0;
    if (minutes >= 60 || d > (latitude ? 90 : 180)) return NAN;
    return (*hemi == 'S' || *hemi == 'W') ? -d : d;
}

static bool checksum_ok(const char *s)
{
    const char *star = strrchr(s, '*');
    if (!star || s[0] != '$' || strlen(star + 1) != 2 || strspn(star + 1, "0123456789ABCDEFabcdef") != 2) return false;
    uint8_t c = 0;
    for (const char *p = s + 1; p < star; p++) c ^= (uint8_t)*p;
    char *end;
    long expected = strtol(star + 1, &end, 16);
    return end == star + 3 && expected == c;
}

/** Which version of the quieter output the module has acknowledged saving ($PAIR001,513,0); 0 for none. */
static uint8_t saved_in_module(void)
{
    nvs_handle_t h;
    uint8_t v = 0;
    if (nvs_open("gnss", NVS_READONLY, &h) != ESP_OK) return 0;
    nvs_get_u8(h, "saved", &v);
    nvs_close(h);
    return v;
}

static void mark_saved(void)
{
    nvs_handle_t h;
    if (nvs_open("gnss", NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_u8(h, "saved", QUIETER_VERSION);
    nvs_commit(h);
    nvs_close(h);
    ESP_LOGI("gnss", "the module saved the quieter output (version %d)", QUIETER_VERSION);
}

static volatile bool quieten_sent; /* this boot; only then does an acknowledged save count */

static void keep(const char *which, const gnss_state_t *s, int64_t now_ms)
{
    gnss_record_t r = {.after_ms = now_ms, .lat = s->lat, .lon = s->lon, .hdop = s->hdop,
                       .sats_used = s->sats_used, .sats_in_view = s->sats_in_view};
    memcpy(r.utc, s->utc, sizeof r.utc);
    memcpy(r.date, s->date, sizeof r.date);
    nvs_handle_t h;
    if (nvs_open("gnss", NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_blob(h, which, &r, sizeof r);
    nvs_commit(h);
    nvs_close(h);
}

bool gnss_record(const char *which, gnss_record_t *out)
{
    nvs_handle_t h;
    size_t len = sizeof *out;
    if (nvs_open("gnss", NVS_READONLY, &h) != ESP_OK) return false;
    bool ok = nvs_get_blob(h, which, out, &len) == ESP_OK && len == sizeof *out;
    nvs_close(h);
    return ok;
}

static void sentence(char *s)
{
    if (echo) printf("%s\n", s);
    gnss_state_t next = state;
    gnss_state_t *st = &next;
    if (!checksum_ok(s)) {
        st->bad++;
        publish(st);
        return;
    }
    *strrchr(s, '*') = '\0';
    char *f[24];
    int n = fields(s, f, 24);
    int64_t now = esp_timer_get_time() / 1000;
    st->last_sentence_ms = now;
    if (strcmp(f[0], "$PAIR001") == 0) {
        /* An acknowledgement: command, then 0 for done. */
        if (n >= 3 && strcmp(f[1], "513") == 0 && f[2][0] == '0' && quieten_sent && saved_in_module() != QUIETER_VERSION) mark_saved();
        publish(st);
        return;
    }
    if (strlen(f[0]) < 6) {
        st->bad++;
        publish(st);
        return;
    }
    const char *type = f[0] + 3; /* after "$GN", "$GP" … */

    st->sentences++;
    if (strcmp(type, "GLL") == 0 || strcmp(type, "GSA") == 0 || strcmp(type, "VTG") == 0) noisy = true;
    if (strcmp(type, "RMC") == 0) {
        st->fix = false;
        if (n < 10) {
            publish(st);
            return;
        }
        if (strlen(f[1]) >= 6) snprintf(st->utc, sizeof st->utc, "%.2s:%.2s:%.2s", f[1], f[1] + 2, f[1] + 4);
        if (strlen(f[9]) == 6)
            snprintf(st->date, sizeof st->date, "%s%.2s-%.2s-%.2s", f[9][4] >= '8' ? "19" : "20", f[9] + 4, f[9] + 2, f[9]);
        double lat = degrees(f[3], f[4]), lon = degrees(f[5], f[6]);
        st->fix = strcmp(f[2], "A") == 0 && isfinite(lat) && isfinite(lon);
        if (st->fix) {
            st->lat = lat;
            st->lon = lon;
            st->last_position_ms = now;
            st->speed_kmh = atof(f[7]) * 1.852f;
            st->course = atof(f[8]);
        }
    } else if (strcmp(type, "GGA") == 0 && n >= 10) {
        st->quality = atoi(f[6]);
        st->sats_used = atoi(f[7]);
        st->hdop = atof(f[8]);
        st->alt_m = atof(f[9]);
    } else if (strcmp(type, "GSV") == 0 && n >= 4) {
        char talker[3] = {f[0][1], f[0][2], 0};
        int slot = -1, total = 0;
        for (int i = 0; i < 8; i++) {
            if (in_view[i].talker[0] == 0 && slot < 0) slot = i;
            if (strcmp(in_view[i].talker, talker) == 0) {
                slot = i;
                break;
            }
        }
        if (slot >= 0) {
            memcpy(in_view[slot].talker, talker, 3);
            in_view[slot].n = atoi(f[3]);
        }
        for (int i = 0; i < 8; i++) total += in_view[i].n;
        st->sats_in_view = total;
    }
    bool first = st->fix && st->first_fix_ms < 0;
    if (first) st->first_fix_ms = now;
    publish(st);

    if (first) keep("first", st, now);
    if (st->fix && now - kept_at >= KEEP_EVERY_MS && strcmp(type, "GGA") == 0) {
        kept_at = now;
        keep("last", st, now);
    }
}

static void take(const uint8_t *buf, uint32_t len)
{
    for (uint32_t i = 0; i < len; i++) {
        char c = (char)buf[i];
        if (c == '\n' || c == '\r') {
            if (line_len) {
                line[line_len] = '\0';
                sentence(line);
            }
            line_len = 0;
        } else if (c == '$') {
            line[0] = c;
            line_len = 1;
        } else if (line_len && line_len < sizeof line - 1) {
            line[line_len++] = c;
        }
    }
}

/** One cycle: drains what the module holds, a piece at a time, with the bus to itself. Bytes read, or −1 if refused. */
static int32_t drain(uint8_t *buf)
{
    int32_t got = 0;
    bool ok = true;
    board_bus_lock();
    for (;;) {
        int32_t n = waiting();
        if (n < 0) {
            ok = false;
            break;
        }
        if (n == 0 || got >= MAX_PER_CYCLE) break;
        uint32_t take_n = n > CHUNK ? CHUNK : (uint32_t)n;
        if (!fetch(buf, take_n)) {
            ok = false;
            break;
        }
        got += (int32_t)take_n;
        gnss_state_t next = state;
        next.bytes += take_n;
        publish(&next);
        take(buf, take_n);
    }
    board_bus_unlock();
    return ok || got > 0 ? got : -1;
}


/** Sends the quieter output, and asks the module to save it until it says it has ($PAIR513). */
static void quieten(void)
{
    board_bus_lock();
    bool ok = true;
    for (unsigned i = 0; i < sizeof quieter / sizeof quieter[0]; i++) ok &= send_locked(quieter[i]);
    if (ok) quieten_sent = send_locked("PAIR513");
    board_bus_unlock();
    ESP_LOGI("gnss", "output cut to RMC, GGA and GSV%s", ok ? "" : " (refused)");
}

/**
 * Brings a stuck module back: a byte read at 0x54 and 0x58, then two
 * exchanges straight after (the first is refused, the second answers).
 * After a command it only works once the module has settled, so the reader
 * repeats it every few seconds until data flows.
 */
static int32_t recover(uint8_t *buf)
{
    board_bus_lock();
    unstick();
    int32_t got = 0;
    for (int i = 0; i < 2; i++) {
        got = drain(buf);
        if (got > 0) break;
    }
    board_bus_unlock();
    return got;
}

/** A sleeping transmitter needs a complete write exchange to wake it.
 * A version query leaves navigation settings alone; only try this after a
 * prolonged absence of data, never just because there is no satellite fix. */
static int32_t wake_receiver(uint8_t *buf)
{
    board_bus_lock();
    bool sent = send_locked("PQTMVERNO");
    board_bus_unlock();
    if (!sent) return -1;
    ESP_LOGI("gnss", "sent a version query to wake the silent receiver");
    return recover(buf);
}

static void task(void *arg)
{
    (void)arg;
    uint8_t *buf = malloc(CHUNK);
    if (!buf) {
        ESP_LOGE("gnss", "cannot allocate receive buffer");
        vTaskDelete(NULL);
        return;
    }
    int64_t last_data = 0, last_recovery = 0;
    int64_t last_wake = -WAKE_EVERY_MS;
    bool quieted = false;
    /* The last restart may have cut an exchange off. */
    if (!paused && recover(buf) > 0) last_data = esp_timer_get_time() / 1000;
    for (;;) {
        int64_t now = esp_timer_get_time() / 1000;
        int32_t got = paused ? 0 : drain(buf);
        if (!paused && got <= 0 && now - last_data > SILENT_MS && now - last_recovery > RECOVER_EVERY_MS) {
            got = recover(buf);
            last_recovery = esp_timer_get_time() / 1000;
            if (got <= 0 && now - last_data >= WAKE_AFTER_MS && now - last_wake >= WAKE_EVERY_MS) {
                got = wake_receiver(buf);
                last_wake = esp_timer_get_time() / 1000;
            }
        }
        if (got > 0) {
            last_data = esp_timer_get_time() / 1000;
            /* A factory-fresh module (or one saved with older settings) talks too much: cut it down, once. */
            if ((noisy || saved_in_module() != QUIETER_VERSION) && !quieted) {
                quieten();
                quieted = true;
            }
            quiet = true;
        }
        bool booting = now < BOOT_MS;
        vTaskDelay(pdMS_TO_TICKS(got >= 0 ? POLL_MS : booting ? BOOT_BACK_OFF_MS : BACK_OFF_MS));
    }
}

void gnss_unstick(void)
{
    board_bus_lock();
    unstick();
    board_bus_unlock();
}

int gnss_read_once(char *out, size_t len)
{
    board_bus_lock();
    int32_t n = waiting();
    int got = n;
    if (n > 0) {
        uint32_t take_n = (uint32_t)LV_MIN(n, (int32_t)len - 1);
        got = fetch((uint8_t *)out, take_n) ? (int)take_n : -2;
        if (got > 0) out[got] = '\0';
    }
    board_bus_unlock();
    return got;
}

/* Manual mode: the reader stays paused from boot, for stepping through by hand. */
void gnss_set_manual(bool on)
{
    nvs_handle_t h;
    if (nvs_open("gnss", NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_u8(h, "manual", on);
    nvs_commit(h);
    nvs_close(h);
}

static bool manual(void)
{
    nvs_handle_t h;
    uint8_t on = 0;
    if (nvs_open("gnss", NVS_READONLY, &h) != ESP_OK) return false;
    nvs_get_u8(h, "manual", &on);
    nvs_close(h);
    return on;
}

bool gnss_start(void)
{
    dev_w = board_i2c_device_slow(ADDR_W, BUS_HZ, STRETCH_US);
    dev_r = board_i2c_device_slow(ADDR_R, BUS_HZ, STRETCH_US);
    dev_r2 = board_i2c_device_slow(ADDR_R2, BUS_HZ, STRETCH_US);
    if (!dev_w || !dev_r || !dev_r2) return false;
    paused = manual();
    return xTaskCreate(task, "gnss", 4096, NULL, 4, NULL) == pdPASS;
}

bool gnss_wait_quiet(uint32_t timeout_ms)
{
    for (uint32_t t = 0; !quiet && t < timeout_ms; t += 50) vTaskDelay(pdMS_TO_TICKS(50));
    return quiet;
}

gnss_state_t gnss_state(void)
{
    portENTER_CRITICAL(&lock);
    gnss_state_t s = state;
    portEXIT_CRITICAL(&lock);
    int64_t now = esp_timer_get_time() / 1000;
    if (s.last_response_ms < 0 || now - s.last_response_ms >= GNSS_STALE_MS) s.ok = false;
    if (!s.ok || s.last_position_ms < 0 || now - s.last_position_ms >= GNSS_STALE_MS) s.fix = false;
    return s;
}
