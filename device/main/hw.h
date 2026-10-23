/**
 * The board's sensors and peripherals, started together: the power manager
 * and motion sensor polled on one task, the GNSS on its own, the card and
 * speaker on demand (docs/tour-device-plan.md, Phase 1).
 */
#pragma once
#include <stdbool.h>

typedef struct {
    bool pmu, imu, gnss; /* each answered when started */
} hw_started_t;

/**
 * The GNSS reader, first of all: the bus, its lock and the reader, before the
 * display, so the module's buffer can't fill unread (gnss.c).
 */
bool hw_start_gnss(void);

/** Everything else, once the display is up. */
hw_started_t hw_start(void);
hw_started_t hw_started(void);

/** Runs a card check on the sensor task (it blocks for a moment); see card_state(). */
void hw_check_card(void);
