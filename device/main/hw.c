#include "hw.h"
#include "audio/sound.h"
#include "board.h"
#include "buttons.h"
#include "bsp/esp-bsp.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gnss/gnss.h"
#include "heading/imu.h"
#include "power/pmu.h"
#include "storage/card.h"

#define TICK_MS 50  /* the motion sensor and the side buttons, twenty times a second */
#define PMU_TICKS 20 /* the power manager, once a second */

static hw_started_t started;
static volatile bool card_wanted;

static void task(void *arg)
{
    (void)arg;
    for (uint32_t n = 0;; n++) {
        buttons_poll();
        if (started.imu) imu_poll();
        if (started.pmu && n % PMU_TICKS == 0) pmu_poll();
        if (card_wanted) {
            card_wanted = false;
            card_check();
        }
        vTaskDelay(pdMS_TO_TICKS(TICK_MS));
    }
}

/* Touch is read by the BSP inside LVGL; wrapped so it waits out a GNSS exchange too. */
static lv_indev_read_cb_t touch_read;

static void touch_read_locked(lv_indev_t *indev, lv_indev_data_t *data)
{
    board_bus_lock();
    touch_read(indev, data);
    board_bus_unlock();
}

bool hw_start_gnss(void)
{
    bsp_i2c_init();
    board_init();
    started.gnss = gnss_start();
    return started.gnss;
}

hw_started_t hw_start(void)
{
    lv_indev_t *touch = bsp_display_get_input_dev();
    if (touch) {
        bsp_display_lock((uint32_t)-1);
        touch_read = lv_indev_get_read_cb(touch);
        lv_indev_set_read_cb(touch, touch_read_locked);
        bsp_display_unlock();
    }

    started.pmu = pmu_init();
    started.imu = imu_init();
    sound_init();
    buttons_init();
    card_wanted = true;
    xTaskCreate(task, "sensors", 4096, NULL, 4, NULL);
    ESP_LOGI("hw", "started: power %d, motion %d, gnss %d", started.pmu, started.imu, started.gnss);
    return started;
}

hw_started_t hw_started(void)
{
    return started;
}

void hw_check_card(void)
{
    card_wanted = true;
}
