#include "player.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sound.h"
#include "storage/card.h"

#define TAG "player"
#define PACKET_BYTES 34   /* IMA4: a two-byte header, then 64 four-bit samples */
#define PACKET_FRAMES 64
#define BLOCK_PACKETS 64  /* read and played 64 packets (4096 samples, 0.26 s at 16 kHz) at a time */
#define MAX_PARTS 128

/* --- parts.txt ------------------------------------------------------------ */

typedef struct {
    char name[8];
    player_part_t part;
} entry_t;

static entry_t *index_entries;
static int index_count = -1; /* -1: not read yet */

static void read_index(void)
{
    if (index_count >= 0 || !card_state().mounted) return;
    FILE *f = fopen(PLAYER_DIR "/parts.txt", "r");
    if (!f) return; /* try again later: the card may be mounted but not loaded yet */
    index_entries = calloc(MAX_PARTS, sizeof(entry_t));
    index_count = 0;
    char line[200];
    while (index_entries && index_count < MAX_PARTS && fgets(line, sizeof line, f)) {
        entry_t *e = &index_entries[index_count];
        char *tok = strtok(line, " \n");
        if (!tok) continue;
        snprintf(e->name, sizeof e->name, "%s", tok);
        tok = strtok(NULL, " \n");
        e->part.length_ms = tok ? (uint32_t)strtoul(tok, NULL, 10) : 0;
        while ((tok = strtok(NULL, " \n")) && e->part.sections < PLAYER_MAX_SECTIONS) {
            char *at = strchr(tok, '@');
            if (!at) continue;
            player_section_t *s = &e->part.section[e->part.sections++];
            snprintf(s->speaker, sizeof s->speaker, "%.*s", (int)(at - tok), tok);
            s->from_ms = (uint32_t)strtoul(at + 1, NULL, 10);
        }
        index_count++;
    }
    fclose(f);
    ESP_LOGI(TAG, "%d parts on the card", index_count);
}

void player_forget_index(void)
{
    free(index_entries);
    index_entries = NULL;
    index_count = -1;
}

const player_part_t *player_part(const char *name)
{
    read_index();
    for (int i = 0; i < index_count; i++) {
        if (strcmp(index_entries[i].name, name) == 0) return &index_entries[i].part;
    }
    return NULL;
}

/* --- IMA4 ------------------------------------------------------------------ */

static const int16_t steps[89] = {
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
    107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871,
    5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
    27086, 29794, 32767};
static const int8_t index_step[16] = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};

/** One Apple IMA4 packet: its header carries the predictor (top 9 bits) and step index; samples go low nibble first. */
static void decode(const uint8_t *p, int16_t *out)
{
    int pred = (int16_t)(((p[0] << 8) | p[1]) & 0xFF80);
    int idx = p[1] & 0x7F;
    if (idx > 88) idx = 88;
    for (int i = 0; i < 32; i++) {
        for (int half = 0; half < 2; half++) {
            int nib = half ? p[2 + i] >> 4 : p[2 + i] & 0x0F;
            int step = steps[idx], diff = step >> 3;
            if (nib & 4) diff += step;
            if (nib & 2) diff += step >> 1;
            if (nib & 1) diff += step >> 2;
            pred += (nib & 8) ? -diff : diff;
            pred = pred > 32767 ? 32767 : pred < -32768 ? -32768 : pred;
            idx += index_step[nib];
            idx = idx < 0 ? 0 : idx > 88 ? 88 : idx;
            *out++ = (int16_t)pred;
        }
    }
}

/* --- CAF ------------------------------------------------------------------- */

static uint64_t be(const uint8_t *b, int n)
{
    uint64_t v = 0;
    for (int i = 0; i < n; i++) v = v << 8 | b[i];
    return v;
}

/** Finds the audio in a CAF: its sample rate, and where its packets start and how many. */
static bool open_caf(FILE *f, int *rate, long *data_at, uint32_t *packets)
{
    uint8_t h[32];
    if (fread(h, 1, 8, f) != 8 || memcmp(h, "caff", 4) != 0) return false;
    *rate = 0;
    for (;;) {
        if (fread(h, 1, 12, f) != 12) return false;
        uint64_t size = be(h + 4, 8);
        if (memcmp(h, "desc", 4) == 0) {
            if (fread(h, 1, 32, f) != 32 || memcmp(h + 8, "ima4", 4) != 0 || be(h + 24, 4) != 1) return false;
            union { uint64_t u; double d; } r = {.u = be(h, 8)};
            *rate = (int)r.d;
            fseek(f, (long)size - 32, SEEK_CUR);
        } else if (memcmp(h, "data", 4) == 0) {
            *data_at = ftell(f) + 4; /* after the edit count */
            *packets = (uint32_t)((size - 4) / PACKET_BYTES);
            return *rate > 0;
        } else {
            fseek(f, (long)size, SEEK_CUR);
        }
    }
}

/* --- Playing ----------------------------------------------------------------- */

static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
static TaskHandle_t task;
static struct {
    char name[8];       /* the part asked for */
    bool load;          /* a new part to open */
    bool paused, stop;
    int64_t seek_ms;    /* −1: none */
    int volume;         /* 0–100 */
    player_state_t state;
} cmd = {.seek_ms = -1, .volume = 70};

int player_codec_volume(int steps)
{
    return steps <= 0 ? 0 : 34 + 6 * (steps > 10 ? 10 : steps);
}

static void run(void *arg)
{
    (void)arg;
    static uint8_t packets[BLOCK_PACKETS * PACKET_BYTES];
    static int16_t pcm[BLOCK_PACKETS * PACKET_FRAMES];
    FILE *f = NULL;
    esp_codec_dev_handle_t out = NULL;
    int rate = 16000, volume = -1;
    long data_at = 0;
    uint32_t total = 0, at = 0; /* packets */

    for (;;) {
        char name[8] = {0};
        bool load, paused, stop;
        int64_t seek;
        int want_volume;
        portENTER_CRITICAL(&lock);
        load = cmd.load, paused = cmd.paused, stop = cmd.stop, seek = cmd.seek_ms, want_volume = cmd.volume;
        if (load) memcpy(name, cmd.name, sizeof name);
        cmd.load = cmd.stop = false;
        cmd.seek_ms = -1;
        portEXIT_CRITICAL(&lock);

        if (load || stop) {
            if (f) fclose(f), f = NULL;
            if (out) sound_give(), out = NULL;
        }
        if (stop) {
            portENTER_CRITICAL(&lock);
            cmd.state = (player_state_t){0};
            portEXIT_CRITICAL(&lock);
        }
        if (load) {
            char path[48];
            snprintf(path, sizeof path, PLAYER_DIR "/%s.caf", name);
            f = fopen(path, "rb");
            if (f && open_caf(f, &rate, &data_at, &total)) {
                at = 0;
                if (seek < 0) seek = 0;
                portENTER_CRITICAL(&lock);
                cmd.state.active = true;
                cmd.state.done = false;
                cmd.state.length_ms = (uint32_t)((uint64_t)total * PACKET_FRAMES * 1000 / rate);
                portEXIT_CRITICAL(&lock);
            } else {
                ESP_LOGW(TAG, "can't play %s", path);
                if (f) fclose(f), f = NULL;
                portENTER_CRITICAL(&lock);
                cmd.state = (player_state_t){0};
                portEXIT_CRITICAL(&lock);
            }
        }
        if (f && seek >= 0) {
            at = (uint32_t)((uint64_t)seek * rate / 1000 / PACKET_FRAMES);
            if (at > total) at = total;
            fseek(f, data_at + (long)at * PACKET_BYTES, SEEK_SET);
        }
        if (!f || paused || at >= total) {
            /* Nothing to play: give the speaker back (so the guide's sounds can play), and wait to be told. */
            if (out) sound_give(), out = NULL;
            portENTER_CRITICAL(&lock);
            cmd.state.playing = false;
            if (f && at >= total) cmd.state.done = true;
            portEXIT_CRITICAL(&lock);
            ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
            continue;
        }
        if (!out) {
            out = sound_take(rate, want_volume);
            volume = want_volume;
            if (!out) {
                ESP_LOGE(TAG, "no speaker");
                vTaskDelay(pdMS_TO_TICKS(500));
                continue;
            }
        } else if (want_volume != volume) {
            sound_volume(want_volume);
            volume = want_volume;
        }

        uint32_t n = total - at < BLOCK_PACKETS ? total - at : BLOCK_PACKETS;
        size_t got = fread(packets, PACKET_BYTES, n, f);
        for (size_t i = 0; i < got; i++) decode(packets + i * PACKET_BYTES, pcm + i * PACKET_FRAMES);
        if (got) esp_codec_dev_write(out, pcm, (int)(got * PACKET_FRAMES * sizeof(int16_t)));
        at = got ? at + (uint32_t)got : total;
        portENTER_CRITICAL(&lock);
        cmd.state.playing = true;
        cmd.state.at_ms = (uint32_t)((uint64_t)at * PACKET_FRAMES * 1000 / rate);
        portEXIT_CRITICAL(&lock);
    }
}

static void wake(void)
{
    if (!task) xTaskCreate(run, "player", 4096, NULL, 5, &task);
    xTaskNotifyGive(task);
}

bool player_play(const char *name, uint32_t at_ms)
{
    if (!player_part(name)) return false;
    portENTER_CRITICAL(&lock);
    snprintf(cmd.name, sizeof cmd.name, "%s", name);
    cmd.load = true;
    cmd.paused = false;
    cmd.seek_ms = at_ms;
    cmd.state = (player_state_t){.active = true, .length_ms = player_part(name)->length_ms, .at_ms = at_ms};
    portEXIT_CRITICAL(&lock);
    wake();
    return true;
}

void player_pause(bool paused)
{
    portENTER_CRITICAL(&lock);
    cmd.paused = paused;
    portEXIT_CRITICAL(&lock);
    wake();
}

void player_seek(uint32_t ms)
{
    portENTER_CRITICAL(&lock);
    cmd.seek_ms = ms;
    cmd.state.at_ms = ms;
    cmd.state.done = false;
    portEXIT_CRITICAL(&lock);
    wake();
}

void player_stop(void)
{
    portENTER_CRITICAL(&lock);
    cmd.stop = true;
    cmd.paused = false;
    portEXIT_CRITICAL(&lock);
    if (task) wake();
}

void player_set_volume(int steps)
{
    portENTER_CRITICAL(&lock);
    cmd.volume = player_codec_volume(steps);
    portEXIT_CRITICAL(&lock);
}

bool player_is(const char *name)
{
    portENTER_CRITICAL(&lock);
    bool is = cmd.state.active && strcmp(cmd.name, name) == 0;
    portEXIT_CRITICAL(&lock);
    return is;
}

player_state_t player_state(void)
{
    portENTER_CRITICAL(&lock);
    player_state_t s = cmd.state;
    portEXIT_CRITICAL(&lock);
    return s;
}
