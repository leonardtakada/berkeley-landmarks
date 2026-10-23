/* Compile the actual driver so these regressions cover its parser and state API. */
#include <assert.h>
#include <math.h>
#include <setjmp.h>
#include <stdio.h>
#include <string.h>
#include "test_platform.h"
#include "../main/gnss/gnss.c"

static int64_t clock_ms;
static esp_err_t receive_result;
static unsigned reads, writes;
static bool manual_saved, stop_at_poll;
static void (*reader_entry)(void *);
static jmp_buf reader_stop;

int64_t esp_timer_get_time(void) { return clock_ms * 1000; }
const char *esp_err_to_name(esp_err_t err) { return "test error"; }
void vTaskDelay(uint32_t ticks)
{
    if (stop_at_poll && ticks == POLL_MS) longjmp(reader_stop, 1);
}
int xTaskCreate(void (*entry)(void *), const char *name, unsigned stack,
                void *arg, unsigned priority, void *handle)
{
    reader_entry = entry;
    return pdPASS;
}
i2c_master_dev_handle_t board_i2c_device_slow(uint8_t addr, uint32_t hz, uint32_t stretch_us) { return addr; }
void board_bus_lock(void) {}
void board_bus_unlock(void) {}
esp_err_t i2c_master_transmit(i2c_master_dev_handle_t dev, const uint8_t *data, size_t len, int timeout)
{
    writes++;
    return ESP_OK;
}
esp_err_t i2c_master_receive(i2c_master_dev_handle_t dev, uint8_t *data, size_t len, int timeout)
{
    reads++;
    memset(data, 0, len);
    return receive_result;
}
esp_err_t nvs_open(const char *name, int mode, nvs_handle_t *handle) { *handle = 1; return ESP_OK; }
esp_err_t nvs_get_u8(nvs_handle_t handle, const char *key, uint8_t *value)
{
    *value = strcmp(key, "manual") == 0 ? manual_saved : QUIETER_VERSION;
    return ESP_OK;
}
esp_err_t nvs_set_u8(nvs_handle_t handle, const char *key, uint8_t value)
{
    if (strcmp(key, "manual") == 0) manual_saved = value;
    return ESP_OK;
}
esp_err_t nvs_get_blob(nvs_handle_t handle, const char *key, void *data, size_t *len) { return ESP_FAIL; }
esp_err_t nvs_set_blob(nvs_handle_t handle, const char *key, const void *data, size_t len) { return ESP_OK; }
esp_err_t nvs_commit(nvs_handle_t handle) { return ESP_OK; }
void nvs_close(nvs_handle_t handle) {}

static const char *valid_rmc = "GNRMC,120001.00,A,3752.1900,N,12215.4500,W,1.5,91.0,221026,,,A";

static void reset(void)
{
    state = (gnss_state_t){.first_fix_ms = -1, .last_sentence_ms = -1,
                          .last_position_ms = -1, .last_response_ms = -1};
    memset(in_view, 0, sizeof in_view);
    line_len = 0;
    kept_at = -KEEP_EVERY_MS;
    echo = paused = quiet = noisy = quieten_sent = false;
    clock_ms = 1000;
    receive_result = ESP_OK;
    reads = writes = 0;
    manual_saved = stop_at_poll = false;
    reader_entry = NULL;
}

static size_t frame(char *out, size_t capacity, const char *body)
{
    uint8_t sum = 0;
    for (const char *p = body; *p; p++) sum ^= (uint8_t)*p;
    int n = snprintf(out, capacity, "$%s*%02X\r\n", body, sum);
    assert(n > 0 && (size_t)n < capacity);
    return (size_t)n;
}

static void feed(const char *body)
{
    char input[160];
    size_t n = frame(input, sizeof input, body);
    take((const uint8_t *)input, (uint32_t)n);
}

static void connect(void)
{
    assert(waiting() == 0);
    assert(gnss_state().ok);
}

static void valid_position(void)
{
    reset();
    assert(!gnss_state().fix && !gnss_state().ok);
    connect();
    feed(valid_rmc);
    gnss_state_t s = gnss_state();
    assert(s.ok && s.fix);
    assert(fabs(s.lat - 37.8698333333) < 0.0000001);
    assert(fabs(s.lon + 122.2575) < 0.0000001);
    assert(fabs(s.speed_kmh - 2.778) < 0.0001);
    assert(strcmp(s.utc, "12:00:01") == 0);
    assert(strcmp(s.date, "2026-10-22") == 0);
    assert(s.first_fix_ms == 1000 && s.last_position_ms == 1000);
    feed("GNRMC,120002,A,0000.000,N,00000.000,E,0,0,221026,,,A");
    assert(gnss_state().fix && gnss_state().lat == 0 && gnss_state().lon == 0);
    puts("PASS: valid RMC and zero coordinates");
}

static void invalid_coordinates(void)
{
    const char *positions[] = {
        ",N,12215.4500,W", "3752.1900,N,,W", "3752.1900,,12215.4500,W",
        "3752.1900,E,12215.4500,W", "3752.1900,N,12215.4500,N",
        "garbage,N,12215.4500,W", "NaN,N,12215.4500,W", "inf,N,12215.4500,W",
        "3752.19junk,N,12215.4500,W", "-3752.1900,N,12215.4500,W",
        "3760.0000,N,12215.4500,W", "9100.0000,N,12215.4500,W",
        "9000.0001,N,12215.4500,W", "3752.1900,N,18100.0000,W"
    };
    for (unsigned i = 0; i < sizeof positions / sizeof positions[0]; i++) {
        reset();
        connect();
        feed(valid_rmc);
        clock_ms = 2000;
        char body[128];
        snprintf(body, sizeof body, "GNRMC,120002,A,%s,0,0,221026,,,A", positions[i]);
        feed(body);
        assert(!gnss_state().fix);
        assert(gnss_state().last_position_ms == 1000);
    }
    puts("PASS: empty, malformed, and out-of-range coordinates clear the fix");
}

static void stale_position(void)
{
    reset();
    connect();
    feed(valid_rmc);
    clock_ms = 5999;
    connect();
    feed("GNGGA,120005,3752.1900,N,12215.4500,W,1,08,0.9,100.0,M,0,M,,");
    assert(gnss_state().fix);
    clock_ms = 6000;
    feed("GPGSV,1,1,04,01,45,100,30,02,30,200,25,03,20,300,20,04,10,050,15");
    gnss_state_t s = gnss_state();
    assert(s.ok && !s.fix);
    assert(s.last_sentence_ms == 6000 && s.last_position_ms == 1000);
    assert(s.first_fix_ms == 1000 && s.sats_in_view == 4);
    feed(valid_rmc);
    assert(gnss_state().fix && gnss_state().last_position_ms == 6000);
    puts("PASS: position expires at five seconds despite continuing NMEA");
}

static void invalid_rmc(void)
{
    reset();
    connect();
    feed(valid_rmc);
    clock_ms = 2000;
    feed("GNRMC,120002,V,,,,,,,221026,,,N");
    assert(!gnss_state().fix);
    assert(gnss_state().last_position_ms == 1000);
    feed(valid_rmc);
    assert(gnss_state().fix);
    feed("GNRMC,120003,V");
    assert(!gnss_state().fix);
    puts("PASS: invalid and truncated RMC clear the previous fix");
}

static void connection_freshness(void)
{
    reset();
    connect();
    feed(valid_rmc);
    clock_ms = 5999;
    assert(gnss_state().ok);
    clock_ms = 6000;
    assert(!gnss_state().ok && !gnss_state().fix);
    receive_result = ESP_FAIL;
    assert(waiting() == -1);
    assert(!gnss_state().ok && gnss_state().last_response_ms == 1000);
    receive_result = ESP_OK;
    connect();
    assert(!gnss_state().fix);
    assert(gnss_state().last_response_ms == 6000);
    puts("PASS: I2C connection expires and recovers independently from position");
}

static void chunks_and_checksum(void)
{
    reset();
    connect();
    char input[160];
    size_t n = frame(input, sizeof input, valid_rmc);
    take((const uint8_t *)"noise\r\n", 7);
    take((const uint8_t *)input, 19);
    assert(gnss_state().sentences == 0);
    take((const uint8_t *)input + 19, (uint32_t)n - 19);
    assert(gnss_state().fix && gnss_state().sentences == 1);
    clock_ms = 2000;
    input[n - 3] = input[n - 3] == '0' ? '1' : '0';
    take((const uint8_t *)input, (uint32_t)n);
    assert(gnss_state().bad == 1 && gnss_state().sentences == 1);
    assert(gnss_state().last_sentence_ms == 1000);
    assert(!checksum_ok("$GNRMC*"));
    assert(!checksum_ok("$GNRMC*00x"));
    feed("PAIR001,513,0");
    assert(gnss_state().last_sentence_ms == 2000);
    assert(gnss_state().last_position_ms == 1000);
    puts("PASS: chunked frames, checksums, and acknowledgements");
}

static void manual_reader(void)
{
    reset();
    gnss_set_manual(true);
    assert(gnss_start() && paused && reader_entry);
    stop_at_poll = true;
    if (setjmp(reader_stop) == 0) reader_entry(NULL);
    stop_at_poll = false;
    assert(reads == 0 && writes == 0);
    gnss_set_manual(false);
    assert(!manual_saved);
    puts("PASS: manual mode does not touch I2C at startup");
}

int main(void)
{
    valid_position();
    invalid_coordinates();
    stale_position();
    invalid_rmc();
    connection_freshness();
    chunks_and_checksum();
    manual_reader();
    puts("All GNSS host regression tests passed.");
    return 0;
}
