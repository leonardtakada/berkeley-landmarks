#include "imu.h"
#include <math.h>
#include "board.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

/* Registers after Waveshare's SensorLib (SensorQMI8658.hpp). */
#define ADDR 0x6B
#define REG_WHO_AM_I 0x00 /* 0x05 */
#define REG_CTRL1 0x02    /* bit 6: address auto-increment */
#define REG_CTRL2 0x03    /* accelerometer range << 4 | rate */
#define REG_CTRL3 0x04    /* gyroscope range << 4 | rate */
#define REG_CTRL5 0x06    /* low-pass filters: bit 0 accelerometer, bit 4 gyroscope */
#define REG_CTRL7 0x08    /* bit 0 accelerometer on, bit 1 gyroscope on */
#define REG_TEMP 0x33     /* then AX … GZ, little-endian */
#define REG_RESET 0x60
#define RESET_CODE 0xB0

#define ACC_4G (1 << 4)
#define ACC_125HZ 6
#define GYR_512DPS (5 << 4)
#define GYR_112HZ 6

static i2c_master_dev_handle_t dev;
static imu_state_t state;
static portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;

bool imu_init(void)
{
    dev = board_i2c_device(ADDR, 400000);
    if (!dev) return false;
    board_reg_write(dev, REG_RESET, RESET_CODE);
    vTaskDelay(pdMS_TO_TICKS(20));
    uint8_t id = 0;
    if (board_reg_read(dev, REG_WHO_AM_I, &id, 1) != ESP_OK || id != 0x05) return false;
    board_reg_write(dev, REG_CTRL1, 0x40);
    board_reg_write(dev, REG_CTRL2, ACC_4G | ACC_125HZ);
    board_reg_write(dev, REG_CTRL3, GYR_512DPS | GYR_112HZ);
    board_reg_write(dev, REG_CTRL5, 0x11);
    board_reg_write(dev, REG_CTRL7, 0x03);
    vTaskDelay(pdMS_TO_TICKS(30));
    imu_poll();
    return true;
}

void imu_poll(void)
{
    if (!dev) return;
    uint8_t b[14];
    imu_state_t s = {0};
    board_bus_lock();
    esp_err_t err = board_reg_read(dev, REG_TEMP, b, sizeof b);
    board_bus_unlock();
    if (err == ESP_OK) {
        int16_t v[7];
        for (int i = 0; i < 7; i++) v[i] = (int16_t)(b[i * 2] | b[i * 2 + 1] << 8);
        s.ok = true;
        s.temp_c = v[0] / 256.0f;
        s.ax = v[1] * 4.0f / 32768.0f, s.ay = v[2] * 4.0f / 32768.0f, s.az = v[3] * 4.0f / 32768.0f;
        s.gx = v[4] * 512.0f / 32768.0f, s.gy = v[5] * 512.0f / 32768.0f, s.gz = v[6] * 512.0f / 32768.0f;
    }
    portENTER_CRITICAL(&lock);
    state = s;
    portEXIT_CRITICAL(&lock);
}

imu_state_t imu_state(void)
{
    portENTER_CRITICAL(&lock);
    imu_state_t s = state;
    portEXIT_CRITICAL(&lock);
    return s;
}

float imu_tilt(const imu_state_t *s)
{
    float g = sqrtf(s->ax * s->ax + s->ay * s->ay + s->az * s->az);
    if (g < 0.1f) return 0;
    return acosf(fabsf(s->az) / g) * 180.0f / (float)M_PI;
}
