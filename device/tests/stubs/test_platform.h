/* Minimal host substitutes for the GNSS driver's hardware dependencies. */
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef int esp_err_t;
typedef uintptr_t i2c_master_dev_handle_t;
typedef int nvs_handle_t;
typedef int portMUX_TYPE;

#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_INVALID_RESPONSE -2
#define NVS_READONLY 0
#define NVS_READWRITE 1
#define pdPASS 1
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(mux) ((void)(mux))
#define portEXIT_CRITICAL(mux) ((void)(mux))
#define pdMS_TO_TICKS(ms) (ms)
#define LV_MIN(a, b) ((a) < (b) ? (a) : (b))
#define ESP_LOGI(...) ((void)0)
#define ESP_LOGW(...) ((void)0)
#define ESP_LOGE(...) ((void)0)

int64_t esp_timer_get_time(void);
const char *esp_err_to_name(esp_err_t err);
void vTaskDelay(uint32_t ticks);
int xTaskCreate(void (*entry)(void *), const char *name, unsigned stack,
                void *arg, unsigned priority, void *handle);
i2c_master_dev_handle_t board_i2c_device_slow(uint8_t addr, uint32_t hz, uint32_t stretch_us);
void board_bus_lock(void);
void board_bus_unlock(void);
esp_err_t i2c_master_transmit(i2c_master_dev_handle_t dev, const uint8_t *data, size_t len, int timeout);
esp_err_t i2c_master_receive(i2c_master_dev_handle_t dev, uint8_t *data, size_t len, int timeout);
esp_err_t nvs_open(const char *name, int mode, nvs_handle_t *handle);
esp_err_t nvs_get_u8(nvs_handle_t handle, const char *key, uint8_t *value);
esp_err_t nvs_set_u8(nvs_handle_t handle, const char *key, uint8_t value);
esp_err_t nvs_get_blob(nvs_handle_t handle, const char *key, void *data, size_t *len);
esp_err_t nvs_set_blob(nvs_handle_t handle, const char *key, const void *data, size_t len);
esp_err_t nvs_commit(nvs_handle_t handle);
void nvs_close(nvs_handle_t handle);
