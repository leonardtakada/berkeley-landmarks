#include "board.h"
#include "bsp/esp-bsp.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#define TIMEOUT_MS 100
#define SLOW_LOCK_MS 2000 /* longer than any exchange should take: say who's holding it */

static SemaphoreHandle_t bus_lock;

void board_init(void)
{
    if (!bus_lock) bus_lock = xSemaphoreCreateRecursiveMutex();
}

void board_bus_lock(void)
{
    if (xSemaphoreTakeRecursive(bus_lock, pdMS_TO_TICKS(SLOW_LOCK_MS)) == pdTRUE) return;
    TaskHandle_t holder = xSemaphoreGetMutexHolder(bus_lock);
    ESP_LOGW("board", "%s waiting for the bus, held by %s", pcTaskGetName(NULL), holder ? pcTaskGetName(holder) : "?");
    xSemaphoreTakeRecursive(bus_lock, portMAX_DELAY);
}

void board_bus_unlock(void)
{
    xSemaphoreGiveRecursive(bus_lock);
}

i2c_master_dev_handle_t board_i2c_device(uint8_t addr, uint32_t hz)
{
    return board_i2c_device_slow(addr, hz, 0);
}

i2c_master_dev_handle_t board_i2c_device_slow(uint8_t addr, uint32_t hz, uint32_t stretch_us)
{
    i2c_master_bus_handle_t bus = bsp_i2c_get_handle();
    if (!bus) return NULL;
    i2c_device_config_t cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = addr,
        .scl_speed_hz = hz,
        .scl_wait_us = stretch_us,
    };
    i2c_master_dev_handle_t dev = NULL;
    if (i2c_master_bus_add_device(bus, &cfg, &dev) != ESP_OK) return NULL;
    return dev;
}

esp_err_t board_reg_read(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t *buf, size_t len)
{
    return i2c_master_transmit_receive(dev, &reg, 1, buf, len, TIMEOUT_MS);
}

esp_err_t board_reg_write(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t val)
{
    uint8_t b[2] = {reg, val};
    return i2c_master_transmit(dev, b, sizeof b, TIMEOUT_MS);
}

int board_i2c_scan(uint8_t *found, int max)
{
    i2c_master_bus_handle_t bus = bsp_i2c_get_handle();
    int n = 0;
    if (!bus) return 0;
    for (uint8_t a = 0x08; a < 0x78 && n < max; a++) {
        if (i2c_master_probe(bus, a, 20) == ESP_OK) found[n++] = a;
    }
    return n;
}
