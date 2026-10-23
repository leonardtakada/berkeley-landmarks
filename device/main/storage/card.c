#include "card.h"
#include <stdio.h>
#include <string.h>
#include "bsp/esp-bsp.h"
#include "esp_vfs_fat.h"
#include "freertos/FreeRTOS.h"

extern sdmmc_card_t *bsp_sdcard;

#define TEST_FILE BSP_SD_MOUNT_POINT "/guide-check.txt"
#define TEST_TEXT "Berkeley Tours pocket guide: card check\n"

static card_state_t state;
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;

card_state_t card_check(void)
{
    card_state_t s = {.checked = true};
    esp_err_t err = bsp_sdcard ? ESP_OK : bsp_sdcard_mount();
    if (err != ESP_OK) {
        snprintf(s.error, sizeof s.error, "%s", err == ESP_ERR_TIMEOUT ? "no card" : esp_err_to_name(err));
    } else {
        s.mounted = true;
        snprintf(s.name, sizeof s.name, "%s", bsp_sdcard->cid.name);
        s.size_mb = (uint64_t)bsp_sdcard->csd.capacity * bsp_sdcard->csd.sector_size / (1024 * 1024);
        uint64_t total = 0, free = 0;
        if (esp_vfs_fat_info(BSP_SD_MOUNT_POINT, &total, &free) == ESP_OK) s.free_mb = free / (1024 * 1024);

        char back[64] = {0};
        FILE *f = fopen(TEST_FILE, "w");
        if (f) {
            fputs(TEST_TEXT, f);
            fclose(f);
            f = fopen(TEST_FILE, "r");
            if (f) {
                fgets(back, sizeof back, f);
                fclose(f);
            }
            remove(TEST_FILE);
        }
        s.read_write_ok = strcmp(back, TEST_TEXT) == 0;
        if (!s.read_write_ok) snprintf(s.error, sizeof s.error, "write or read back failed");
    }
    portENTER_CRITICAL(&lock);
    state = s;
    portEXIT_CRITICAL(&lock);
    return s;
}

card_state_t card_state(void)
{
    portENTER_CRITICAL(&lock);
    card_state_t s = state;
    portEXIT_CRITICAL(&lock);
    return s;
}
