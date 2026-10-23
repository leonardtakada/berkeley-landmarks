/**
 * The pocket guide: Berkeley Tours on the Waveshare ESP32-S3-Touch-AMOLED-1.75
 * (docs/tour-device-plan.md).
 */
#include "board.h"
#include "bsp/esp-bsp.h"
#include "console.h"
#include "esp_log.h"
#include "gnss/gnss.h"
#include "hw.h"
#include "nvs_flash.h"
#include "ui.h"

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    /* The GNSS module fills its buffer seconds after power-up and then falls
     * silent for good, so it's read before anything else; once its output is
     * cut, the display comes up with the bus kept clear of GNSS exchanges (the
     * touch set-up can't be allowed between a request and its answer). */
    hw_start_gnss();
    bool quiet = gnss_wait_quiet(4000);
    if (quiet) board_bus_lock();
    bsp_display_start();
    if (quiet) board_bus_unlock();
    bsp_display_brightness_set(70);
    hw_start();
    ESP_LOGI("main", "gnss %s before the display", quiet ? "quietened" : "not quietened");

    bsp_display_lock((uint32_t)-1);
    ui_init();
    bsp_display_unlock();
    ESP_LOGI("main", "screens up");

    console_start();
}
