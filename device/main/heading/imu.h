/**
 * The QMI8658 motion sensor: accelerometer (±4 g) and gyroscope (±512 °/s),
 * both filtered, read about twenty times a second. The board has no
 * magnetometer, so heading comes later from the gyro and the GPS course
 * (docs/tour-device-plan.md, Phase 4); here it's tilt and turning.
 */
#pragma once
#include <stdbool.h>

typedef struct {
    bool ok;
    float ax, ay, az; /* g */
    float gx, gy, gz; /* °/s */
    float temp_c;
} imu_state_t;

bool imu_init(void);
void imu_poll(void);
imu_state_t imu_state(void);

/** How far the face is tipped from level, in degrees. */
float imu_tilt(const imu_state_t *s);
