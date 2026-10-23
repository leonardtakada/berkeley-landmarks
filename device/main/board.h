/**
 * The board's shared I2C bus (GPIO 14/15, brought up by the BSP for touch)
 * and small register helpers on it. Devices on it, 7-bit addresses
 * (Waveshare's HARDWARE_REFERENCE.md): ES8311 0x18, TCA9554 0x20, AXP2101
 * 0x34, ES7210 0x40, LC76G 0x50/0x54, PCF85063 0x51, CST9217 0x5A,
 * QMI8658 0x6B.
 */
#pragma once
#include <stddef.h>
#include <stdint.h>
#include "driver/i2c_master.h"

/** A device on the shared bus at `hz`; NULL if the bus isn't up. */
i2c_master_dev_handle_t board_i2c_device(uint8_t addr, uint32_t hz);

/** The same, allowing the device to hold the clock for up to `stretch_us`. */
i2c_master_dev_handle_t board_i2c_device_slow(uint8_t addr, uint32_t hz, uint32_t stretch_us);

/**
 * Keeps other traffic off the bus for a multi-step exchange: the GNSS module
 * jams if another device is spoken to between its request and answer. Every
 * reader on the bus takes it, touch included (hw.c wraps LVGL's touch read).
 */
void board_bus_lock(void);
void board_bus_unlock(void);

/** Creates the bus lock; call once at start-up, before anything that might take it. */
void board_init(void);

esp_err_t board_reg_read(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t *buf, size_t len);
esp_err_t board_reg_write(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t val);

/** Fills `found` with the addresses that answer (up to `max`); returns how many. */
int board_i2c_scan(uint8_t *found, int max);
