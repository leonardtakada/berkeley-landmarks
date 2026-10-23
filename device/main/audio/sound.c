#include "sound.h"
#include <math.h>
#include <stdint.h>
#include "board.h"
#include "bsp/esp-bsp.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#define RATE 22050
#define CHUNK 512
#define TAG "sound"

static esp_codec_dev_handle_t speaker;
static volatile bool busy;
static SemaphoreHandle_t turn; /* one sound at a time */

static bool open_speaker(int volume)
{
    if (!speaker) speaker = bsp_audio_codec_speaker_init();
    if (!speaker) {
        ESP_LOGE(TAG, "no speaker codec");
        return false;
    }
    esp_codec_dev_sample_info_t fs = {.bits_per_sample = 16, .channel = 1, .sample_rate = RATE};
    if (esp_codec_dev_open(speaker, &fs) != ESP_CODEC_DEV_OK) return false;
    esp_codec_dev_set_out_vol(speaker, volume);
    return true;
}

/**
 * Renders `ms` of sound a chunk at a time: each note a sine with a soft
 * second partial, struck at `at_ms` and dying away exponentially.
 */
typedef struct {
    float hz;
    int at_ms;
    float decay_s;
} note_t;

void sound_init(void)
{
    if (!turn) turn = xSemaphoreCreateMutex();
}

static void play(const note_t *notes, int n, int ms, int volume)
{
    xSemaphoreTake(turn, portMAX_DELAY);
    /* Codec setup/volume/close use the same I2C bus as the GPS. The samples
     * use I2S, so leave the bus free while the sound itself plays. */
    board_bus_lock();
    bool opened = open_speaker(volume);
    board_bus_unlock();
    if (!opened) {
        xSemaphoreGive(turn);
        return;
    }
    static int16_t buf[CHUNK];
    int total = RATE * ms / 1000;
    for (int start = 0; start < total; start += CHUNK) {
        for (int i = 0; i < CHUNK; i++) {
            float t = (float)(start + i) / RATE, v = 0;
            for (int k = 0; k < n; k++) {
                float dt = t - notes[k].at_ms / 1000.0f;
                if (dt < 0) continue;
                /* A 4 ms attack keeps the strike from clicking. */
                float env = expf(-dt / notes[k].decay_s) * fminf(1.0f, dt / 0.004f);
                float w = 2.0f * (float)M_PI * notes[k].hz * dt;
                v += env * (sinf(w) + 0.28f * sinf(2.0f * w));
            }
            buf[i] = (int16_t)(fmaxf(-1.0f, fminf(1.0f, v * 0.42f)) * 32767);
        }
        esp_codec_dev_write(speaker, buf, sizeof buf);
    }
    board_bus_lock();
    esp_codec_dev_close(speaker);
    board_bus_unlock();
    xSemaphoreGive(turn);
}

void sound_chime(int volume)
{
    /* E6 then C6: a bright strike, then a lower answer. */
    static const note_t notes[] = {{1318.5f, 0, 0.35f}, {1046.5f, 380, 0.5f}};
    play(notes, 2, 1600, volume);
}

void sound_tone(int hz, int ms, int volume)
{
    note_t note = {(float)hz, 0, 1000.0f};
    play(&note, 1, ms, volume);
}

static void chime_task(void *arg)
{
    sound_chime((int)(intptr_t)arg);
    busy = false;
    vTaskDelete(NULL);
}

bool sound_chime_async(int volume)
{
    if (busy) return false;
    busy = true;
    if (xTaskCreate(chime_task, "chime", 4096, (void *)(intptr_t)volume, 3, NULL) != pdPASS) {
        busy = false;
        return false;
    }
    return true;
}
