/**
 * The microSD card (1-bit SDMMC, mounted by the BSP at /sdcard), where the
 * guide's bundle will live (docs/tour-device-plan.md, "SD card bundle").
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool checked; /* a check has run */
    bool mounted;
    bool read_write_ok;
    uint64_t size_mb, free_mb;
    char name[8];
    char error[40];
} card_state_t;

/** Mounts the card if it isn't, writes and reads back a test file. Blocks for a moment. */
card_state_t card_check(void);

/** The last check's result. */
card_state_t card_state(void);
