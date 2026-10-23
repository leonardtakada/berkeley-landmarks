/**
 * The AXP2101 power manager: battery, USB and charging, read only. Its
 * charger settings are left as the board ships (registers after XPowersLib,
 * which Waveshare's examples use).
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool ok;       /* the chip answers */
    bool usb;      /* power from USB */
    bool battery;  /* a battery is connected */
    bool charging;
    int percent;   /* the gauge's estimate, −1 without a battery */
    uint16_t battery_mv, usb_mv, system_mv;
    float temp_c;  /* the chip's own temperature */
} pmu_state_t;

bool pmu_init(void);
void pmu_poll(void);
pmu_state_t pmu_state(void);
